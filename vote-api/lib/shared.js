// Shared helpers for the Waxy d'Or fan vote API (Vercel serverless functions).
// One ballot per Twitch account: ballots are stored in Redis under the voter's Twitch user ID,
// so voting again replaces the earlier ballot. Rules (window, shortlist, points) come from the
// site's data/config.json, so the page and the server can never disagree.

const CONFIG_URL = process.env.CONFIG_URL || "https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/config.json";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://waxysplash.com,https://www.waxysplash.com,https://waxysplash.github.io,http://localhost:8765").split(",");

export function cors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

let cached = { at: 0, cfg: null };
export async function loadVote() {
  if (!cached.cfg || Date.now() - cached.at > 60_000) {
    const r = await fetch(CONFIG_URL + "?t=" + Math.floor(Date.now() / 60_000));
    if (!r.ok) throw new Error("config " + r.status);
    cached = { at: Date.now(), cfg: await r.json() };
  }
  const v = cached.cfg.fanVote || {};
  const now = Date.now();
  const opens = new Date(v.opens).getTime(), closes = new Date(v.closes).getTime();
  const phase = !v.shortlist?.length || !(now >= opens) ? "notOpen" : now <= closes ? "open" : "closed";
  return { ...v, phase, key: `ballots:${v.season}` };
}

// Upstash Redis over REST. Vercel's Upstash integration sets KV_REST_API_* (or UPSTASH_REDIS_REST_*).
export async function redis(...cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

export class VoteError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

// Checks the Twitch token with Twitch itself: it must belong to our app and carry user:read:follows.
export async function twitchUser(token) {
  if (!token) throw new VoteError(401, "login", "Log in with Twitch to vote.");
  const r = await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${token}` } });
  if (!r.ok) throw new VoteError(401, "login", "Your Twitch login has expired. Log in again.");
  const v = await r.json();
  if (v.client_id !== process.env.TWITCH_CLIENT_ID) throw new VoteError(401, "login", "That login isn't from the Waxy d'Or site.");
  if (!(v.scopes || []).includes("user:read:follows")) throw new VoteError(401, "login", "Log in again and allow the follow check.");
  return { id: v.user_id, login: v.login };
}

const broadcasterIds = new Map();
async function helix(path, token) {
  const r = await fetch("https://api.twitch.tv/helix/" + path, { headers: { Authorization: `Bearer ${token}`, "Client-Id": process.env.TWITCH_CLIENT_ID } });
  if (!r.ok) throw new VoteError(502, "twitch", "Twitch didn't answer. Try again in a minute.");
  return r.json();
}
export async function follows(user, channel, token) {
  if (!broadcasterIds.has(channel)) {
    const u = await helix(`users?login=${encodeURIComponent(channel)}`, token);
    if (!u.data?.[0]) throw new VoteError(502, "twitch", "Couldn't find the channel on Twitch.");
    broadcasterIds.set(channel, u.data[0].id);
  }
  const f = await helix(`channels/followed?user_id=${user.id}&broadcaster_id=${broadcasterIds.get(channel)}`, token);
  return (f.data || []).length > 0;
}

export function tally(ballots, shortlist, points) {
  const rows = shortlist.map((name) => ({ name, points: 0, first: 0 }));
  const by = new Map(rows.map((r) => [r.name, r]));
  for (const b of ballots) b.picks.forEach((name, i) => {
    const r = by.get(name); if (!r) return;
    r.points += points[i] || 0;
    if (i === 0) r.first++;
  });
  // Ties: more first-place votes wins.
  return rows.sort((a, b) => b.points - a.points || b.first - a.first);
}

export function fail(res, e) {
  if (e instanceof VoteError) return res.status(e.status).json({ error: e.code, message: e.message });
  console.error(e);
  return res.status(500).json({ error: "server", message: "Something went wrong. Try again in a minute." });
}
