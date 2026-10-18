// WaxyBot: the Waxys Phantoms Twitch chat bot. Serverless: Twitch sends each chat message to
// /api/bot/eventsub, and the bot answers through Twitch's Send Chat Message API. It reads the same
// data and the same ranking.js as the site, so chat and waxysplash.com never disagree.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redis } from "./shared.js";

const RAW = process.env.DATA_URL || "https://raw.githubusercontent.com/Waxysplash/waxydor/main/";
const CLIENT_ID = () => process.env.BOT_CLIENT_ID;
const CLIENT_SECRET = () => process.env.BOT_CLIENT_SECRET;

// ---------- Twitch ----------
export async function appToken() {
  const cached = await redis("GET", "bot:apptoken");
  if (cached) return cached;
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), grant_type: "client_credentials" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("app token: " + JSON.stringify(j));
  await redis("SET", "bot:apptoken", j.access_token, "EX", Math.max(60, (j.expires_in || 3600) - 300));
  return j.access_token;
}

export async function helix(method, path, body) {
  const r = await fetch("https://api.twitch.tv/helix/" + path, {
    method,
    headers: { Authorization: `Bearer ${await appToken()}`, "Client-Id": CLIENT_ID(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const j = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`helix ${method} ${path} ${r.status}: ${text.slice(0, 300)}`);
  return j;
}

export async function ids() {
  const [bot, broadcaster] = await Promise.all([redis("GET", "bot:bot"), redis("GET", "bot:broadcaster")]);
  return { bot: bot && JSON.parse(bot), broadcaster: broadcaster && JSON.parse(broadcaster) };
}

export async function say(message, replyTo) {
  const { bot, broadcaster } = await ids();
  if (!bot || !broadcaster) throw new Error("bot not connected");
  return helix("POST", "chat/messages", {
    broadcaster_id: broadcaster.id, sender_id: bot.id, message: message.slice(0, 500),
    ...(replyTo ? { reply_parent_message_id: replyTo } : {}),
  });
}

export async function isLive() {
  const { broadcaster } = await ids();
  const j = await helix("GET", `streams?user_id=${broadcaster.id}`);
  return (j.data || []).length > 0;
}

// The webhook secret is generated and kept by the server itself; nobody has to copy it anywhere.
export async function webhookSecret() {
  let s = await redis("GET", "bot:whsecret");
  if (!s) { s = randomBytes(24).toString("hex"); await redis("SET", "bot:whsecret", s); }
  return s;
}

export function verifySignature(secret, headers, raw) {
  const id = headers["twitch-eventsub-message-id"], ts = headers["twitch-eventsub-message-timestamp"];
  const sig = headers["twitch-eventsub-message-signature"] || "";
  const want = "sha256=" + createHmac("sha256", secret).update(id + ts + raw).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b) && Math.abs(Date.now() - new Date(ts).getTime()) < 10 * 60_000;
}

export async function subscribeChat(callback) {
  const { bot, broadcaster } = await ids();
  const existing = await helix("GET", "eventsub/subscriptions?type=channel.chat.message");
  for (const s of existing.data || []) await helix("DELETE", `eventsub/subscriptions?id=${s.id}`);
  return helix("POST", "eventsub/subscriptions", {
    type: "channel.chat.message", version: "1",
    condition: { broadcaster_user_id: broadcaster.id, user_id: bot.id },
    transport: { method: "webhook", callback, secret: await webhookSecret() },
  });
}

// ---------- club data (same files and ranking code as the site) ----------
let cache = { at: 0, d: null };
export async function loadData() {
  if (cache.d && Date.now() - cache.at < 60_000) return cache.d;
  const t = "?t=" + Math.floor(Date.now() / 60_000);
  const get = (f) => fetch(RAW + f + t).then((r) => { if (!r.ok) throw new Error(f + " " + r.status); return f.endsWith(".js") ? r.text() : r.json(); });
  const [config, members, store, club, rankingSrc] = await Promise.all([
    get("data/config.json"), get("data/members.json"), get("data/matches.json"), get("data/club.json"), get("ranking.js"),
  ]);
  const now = new Date();
  const season = config.seasons.find((s) => new Date(s.start) <= now && now <= new Date(s.end)) || config.seasons.at(-1);
  let snapshot = { members: [] };
  try { snapshot = await get(`data/snapshots/${season.id}-start.json`); } catch (e) {}
  const mod = { exports: {} };
  new Function("module", "exports", rankingSrc)(mod, mod.exports);
  const R = mod.exports.rank({ config, members, matches: store.matches, snapshot, season });
  cache = { at: Date.now(), d: { config, club, season, matches: store.matches, R } };
  return cache.d;
}

// ---------- commands ----------
const norm = (s) => String(s || "").toLowerCase().replace(/^ttv[\s_-]*/, "").replace(/[^a-z0-9]/g, "");
const pos = { forward: "FWD", midfielder: "MID", defender: "DEF", goalkeeper: "GK" };
const LABEL = { contribution: "contribution", appearances: "appearances", rating: "rating", passAccuracy: "pass accuracy", winRate: "win rate", motm: "MOTM", accuracy: "accuracy" };

function findPlayer(d, query) {
  const all = [...d.R.rows, ...(d.R.gaffer ? [d.R.gaffer] : [])];
  const q = norm(query);
  if (!q) return null;
  return all.find((r) => norm(r.name) === q) || all.find((r) => norm(r.name).startsWith(q)) || all.find((r) => norm(r.name).includes(q)) || null;
}

function playerLine(d, r) {
  if (r.gaffer) return `${r.name} (the gaffer, not in the race): ${r.gp} apps · ${r.g}G ${r.a}A · rating ${r.rating.toFixed(1)}`;
  const C = d.config.index;
  const rank = d.R.ranked.indexOf(r);
  const head = r.qualified ? `#${rank + 1} · index ${r.index}` : r.index != null ? `provisional ${r.index} (needs ${C.minGames - r.gp} more app${C.minGames - r.gp === 1 ? "" : "s"})` : `needs ${C.minGames - r.gp} more apps for an index`;
  let weak = "";
  if (r.index != null) {
    const [k] = Object.entries(r.parts).map(([k, v]) => [k, v / C.weights[k]]).sort((a, b) => a[1] - b[1])[0];
    weak = ` · weakest: ${LABEL[k]} ${r.parts[k]}/${C.weights[k]}`;
  }
  return `${r.name} (${pos[r.pos] || r.pos}) ${head} · ${r.gp} apps · ${r.g}G ${r.a}A · rating ${r.rating.toFixed(1)} · pass ${r.passPct}%${weak}`;
}

export function matchLine(d, m) {
  const big = (d.config.bigGames || []).some((b) => String(b.matchId) === String(m.matchId)) || (d.config.index.playoffsAreBigGames && m.matchType === "playoffMatch");
  const scorers = m.players.filter((p) => p.goals || p.assists).sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .map((p) => `${p.name}${p.goals ? " " + p.goals + "⚽" : ""}${p.assists ? " " + p.assists + "🅰️" : ""}`).join(", ");
  const motm = m.players.find((p) => p.mom);
  return `FT: ${d.club.name || "Waxys Phantoms"} ${m.goalsFor}-${m.goalsAgainst} ${m.opponent}${m.matchType === "playoffMatch" ? " (playoff)" : ""}${big ? " ★ Big game" : ""}` +
    (scorers ? ` · ${scorers}` : "") + (motm ? ` · MOTM ${motm.name}` : "");
}

export async function handleCommand(text, chatter) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const c = cmd.toLowerCase();
  const arg = rest.join(" ");
  const d = await loadData();
  const site = d.config.siteUrl;
  const top = (n) => d.R.ranked.slice(0, n).map((r, i) => `${i + 1}. ${r.name} ${r.index}`).join(" | ");

  switch (c) {
    case "!table":
      return `${d.season.name} Waxy index: ${top(3)} · full table ${site}`;
    case "!race": {
      const r = d.R.ranked, C = d.config.index;
      const cut = r[4] && r[5] ? ` · 5th v 6th: ${r[4].name} ${r[4].index} v ${r[5].name} ${r[5].index}` : "";
      const hot = d.R.provisional.filter((p) => p.index != null).sort((a, b) => b.index - a.index)[0];
      return `Waxy d'Or shortlist: ${top(5)}${cut}${hot ? ` · watch out: ${hot.name} on ${hot.index}, ${C.minGames - hot.gp} apps from qualifying` : ""}`;
    }
    case "!me": {
      const map = d.config.bot?.twitchToPlayer || {};
      const r = findPlayer(d, map[chatter.login] || chatter.login) || findPlayer(d, chatter.name);
      return r ? playerLine(d, r) : `@${chatter.name} I can't match your Twitch name to an EA player yet. Try !player <your EA name>, and the captain can link you.`;
    }
    case "!player": case "!stats": {
      if (!arg) return "Usage: !player <name>, e.g. !player George";
      const r = findPlayer(d, arg);
      return r ? playerLine(d, r) : `No player matching "${arg.slice(0, 30)}". Full squad: ${site}`;
    }
    case "!last": {
      const m = d.matches[0];
      return m ? matchLine(d, m) + ` · ${new Date(m.date).toUTCString().slice(5, 22)} UTC` : "No matches on record yet.";
    }
    case "!record": {
      const o = d.club.overall;
      return `${d.club.name}: Division ${d.club.division} · ${o.wins}W ${o.ties}D ${o.losses}L · goals ${o.goals}-${o.goalsAgainst} · skill ${o.skillRating}`;
    }
    case "!vote": {
      const v = d.config.fanVote || {}, now = Date.now();
      const url = (site || "").replace(/\/?$/, "/") + "vote.html";
      if (!v.shortlist?.length || now < new Date(v.opens)) return `The Waxy d'Or fan vote opens when the season ends${v.opens ? ` (${new Date(v.opens).toUTCString().slice(0, 16)})` : ""}. One vote per Twitch account, followers only: ${url}`;
      if (now <= new Date(v.closes)) return `Fan vote is OPEN until ${new Date(v.closes).toUTCString().slice(0, 22)} UTC. Log in with Twitch and pick your top 3: ${url}`;
      return `Fan vote is closed. Results: ${url}`;
    }
    case "!waxydor":
      return `The Waxy d'Or race, every stat, every match: ${site}`;
    case "!commands": case "!help":
      return `Commands: !table !race !me !player <name> !last !record !vote !waxydor${Object.keys(d.config.bot?.commands || {}).length ? " " + Object.keys(d.config.bot.commands).join(" ") : ""}`;
    default: {
      // Simple text commands (!discord, !club, !socials, anything moved over from StreamElements) live in config.bot.commands.
      const t = (d.config.bot?.commands || {})[c];
      return t ? t.replace(/\{user\}/g, chatter.name).replace(/\{site\}/g, site) : null;
    }
  }
}
