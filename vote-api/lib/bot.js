// WaxyBot: the Waxys Phantoms Twitch chat bot. Serverless: Twitch sends each chat message to
// /api/bot/eventsub, and the bot answers through Twitch's Send Chat Message API. It reads the same
// data and the same ranking.js as the site, so chat and waxysplash.com never disagree.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redis } from "./shared.js";
import * as queue from "./queue.js";

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

// Every command and what the bot did with it, newest first, so problems can be traced after the fact.
export async function logEvent(entry) {
  try {
    await redis("LPUSH", "bot:log", JSON.stringify({ t: new Date().toISOString(), ...entry }));
    await redis("LTRIM", "bot:log", 0, 499);
  } catch (e) { console.error("log failed", e); }
}

// The bot account's own token, refreshed as needed. Only used for things an app token can't do (!followage).
async function botUserToken() {
  const cached = await redis("GET", "bot:usertoken");
  if (cached) return cached;
  const refresh = await redis("GET", "bot:refresh");
  if (!refresh) return null;
  const r = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: CLIENT_ID(), client_secret: CLIENT_SECRET(), grant_type: "refresh_token", refresh_token: refresh }),
  });
  const j = await r.json();
  if (!j.access_token) { console.error("bot token refresh failed", j); return null; }
  await redis("SET", "bot:refresh", j.refresh_token);
  await redis("SET", "bot:usertoken", j.access_token, "EX", Math.max(60, (j.expires_in || 3600) - 300));
  return j.access_token;
}

function since(date, now = new Date()) {
  const a = new Date(date), b = new Date(now);
  // Whole calendar months first (a 31 Jan follow is "1 month" on 28/29 Feb), then the leftover days.
  const addMonths = (n) => {
    const y = a.getUTCFullYear(), m = a.getUTCMonth() + n;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(a.getUTCDate(), last), a.getUTCHours(), a.getUTCMinutes()));
  };
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (addMonths(months) > b) months--;
  const days = Math.floor((b - addMonths(months)) / 864e5);
  const part = (n, w) => (n ? `${n} ${w}${n === 1 ? "" : "s"}` : "");
  return [part(Math.floor(months / 12), "year"), part(months % 12, "month"), part(days, "day")].filter(Boolean).join(", ") || "less than a day";
}

export { since };

async function followedAt(userId) {
  const { broadcaster } = await ids();
  const token = await botUserToken();
  if (!token) return undefined;
  const r = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcaster.id}&user_id=${userId}`, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": CLIENT_ID() },
  });
  if (!r.ok) { console.error("followers", r.status, await r.text()); return undefined; }
  return (await r.json()).data?.[0]?.followed_at || null;
}

// Health check for /api/bot/status: can the bot read the channel's followers right now?
export async function followCheck() {
  const { broadcaster } = await ids();
  const token = await botUserToken();
  if (!token) return "no bot token";
  const r = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcaster.id}&first=1`, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": CLIENT_ID() },
  });
  if (r.ok) return "ok";
  const j = await r.json().catch(() => ({}));
  return /permission/i.test(j.message || "") ? "bot is not a mod" : `twitch ${r.status}`;
}

// For the queue's followers-only rule. If Twitch can't be asked, let the viewer in rather than block them.
async function isFollower(userId) {
  const { broadcaster } = await ids();
  if (userId === broadcaster.id) return true;
  const at = await followedAt(userId);
  return at !== null;
}

async function followage(login, name) {
  const { bot, broadcaster } = await ids();
  if (login.toLowerCase() === broadcaster.login.toLowerCase()) return `${name} is the captain. Following since day one.`;
  const token = await botUserToken();
  if (!token) return "!followage isn't set up yet.";
  const u = await helix("GET", `users?login=${encodeURIComponent(login)}`);
  const user = u.data?.[0];
  if (!user) return `Can't find a Twitch user called ${login}.`;
  const r = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcaster.id}&user_id=${user.id}`, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": CLIENT_ID() },
  });
  if (!r.ok) { console.error("followage", r.status, await r.text()); return `!followage needs ${bot.login} to be a mod in the channel.`; }
  const f = (await r.json()).data?.[0];
  if (!f) return `${user.display_name} isn't following ${broadcaster.login} yet. Hit that follow button!`;
  return `${user.display_name} has been following ${broadcaster.login} for ${since(f.followed_at)} (since ${new Date(f.followed_at).toUTCString().slice(5, 16)}).`;
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

// ---------- settings (data/config.json), cached for a minute ----------
let cfgCache = { at: 0, c: null };
export async function loadConfig() {
  if (cfgCache.c && Date.now() - cfgCache.at < 60_000) return cfgCache.c;
  const r = await fetch(RAW + "data/config.json?t=" + Math.floor(Date.now() / 60_000));
  if (!r.ok) { if (cfgCache.c) return cfgCache.c; throw new Error("config " + r.status); }
  cfgCache = { at: Date.now(), c: await r.json() };
  return cfgCache.c;
}

// Commands added from chat (!addcom) live in Redis and win over the ones in config.bot.commands.
async function customCommand(c, config) {
  const fromChat = await redis("HGET", "bot:cmds", c);
  if (fromChat) return JSON.parse(fromChat);
  const def = (config.bot?.commands || {})[c];
  return def ? (typeof def === "string" ? { text: def } : def) : null;
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

// Timers (Nightbot/StreamElements-style): a message every N minutes, but only after M chat lines since the
// last time, so the bot never talks to an empty room. "whenQueueOpen" timers only run while the queue is open.
export async function runTimers(config) {
  const timers = config.bot?.timers || [];
  if (!timers.length) return;
  let queueOpen = null;
  for (const t of timers) {
    const lines = await redis("INCR", "bot:timerlines:" + t.name);
    if (lines < (t.minLines || 5)) continue;
    if (t.whenQueueOpen) { queueOpen ??= (await queue.load()).open; if (!queueOpen) continue; }
    if (!(await redis("SET", "bot:timer:" + t.name, "1", "NX", "EX", (t.minutes || 15) * 60))) continue;
    await redis("SET", "bot:timerlines:" + t.name, 0);
    await say(t.text);
    await logEvent({ timer: t.name });
  }
}

const STATS = ["!table", "!race", "!me", "!player", "!stats", "!last", "!record"];

export async function handleCommand(text, chatter) {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const c = cmd.toLowerCase();
  const arg = rest.join(" ");
  const config = await loadConfig();
  if (queue.QUEUE_COMMANDS.includes(c)) return queue.command(c, rest, chatter, config.queue || {}, isFollower);
  const custom = await customCommand(c, config);
  const cooldown = custom?.cooldown ?? 5;
  if (cooldown > 0 && !chatter.mod && !(await redis("SET", "bot:cd:" + c, "1", "NX", "EX", cooldown))) return null;
  // Only the stats commands need the full club data and rankings; everything else answers straight away.
  const d = STATS.includes(c) ? await loadData() : { config };
  const site = config.siteUrl;
  const top = (n) => d.R.ranked.slice(0, n).map((r, i) => `${i + 1}. ${r.name} ${r.index}`).join(" | ");
  const target = (rest[0] || "").replace(/^@/, "");

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
    case "!followage": {
      const target = (rest[0] || "").replace(/^@/, "");
      return followage(target || chatter.login, target || chatter.name);
    }
    case "!waxydor":
      return `The Waxy d'Or race, every stat, every match: ${site}`;
    case "!uptime": {
      const { broadcaster } = await ids();
      const live = (await helix("GET", `streams?user_id=${broadcaster.id}`)).data?.[0];
      if (!live) return `${broadcaster.login} is offline right now.`;
      const mins = Math.floor((Date.now() - new Date(live.started_at)) / 60000);
      return `Live for ${Math.floor(mins / 60) ? Math.floor(mins / 60) + "h " : ""}${mins % 60}m · ${live.game_name || "no category"}`;
    }
    case "!so": case "!shoutout": {
      if (!chatter.mod) return null;
      if (!target) return `Usage: ${c} @name`;
      const u = (await helix("GET", `users?login=${encodeURIComponent(target.toLowerCase())}`)).data?.[0];
      if (!u) return `Can't find ${target} on Twitch.`;
      const ch = (await helix("GET", `channels?broadcaster_id=${u.id}`)).data?.[0];
      return `Go check out ${u.display_name} at twitch.tv/${u.login}${ch?.game_name ? `, last seen playing ${ch.game_name}` : ""}! Drop them a follow 💜`;
    }
    case "!quote": {
      const n = await redis("LLEN", "bot:quotes");
      if (!n) return "No quotes yet. Mods can add one with !addquote <text>.";
      const i = /^\d+$/.test(rest[0] || "") ? +rest[0] - 1 : Math.floor(Math.random() * n);
      const q = await redis("LINDEX", "bot:quotes", i);
      return q ? `#${i + 1}: ${JSON.parse(q).text}` : `There's no quote #${i + 1} (there are ${n}).`;
    }
    case "!addquote": {
      if (!chatter.mod) return null;
      if (!arg) return "Usage: !addquote <text>";
      const n = await redis("RPUSH", "bot:quotes", JSON.stringify({ text: arg.slice(0, 300), by: chatter.login, at: new Date().toISOString() }));
      return `Quote #${n} added.`;
    }
    case "!delquote": {
      if (!chatter.mod) return null;
      const i = +rest[0] - 1;
      const q = await redis("LINDEX", "bot:quotes", i);
      if (!q) return "Usage: !delquote <number>";
      await redis("LSET", "bot:quotes", i, "__deleted__"); await redis("LREM", "bot:quotes", 1, "__deleted__");
      return `Quote #${i + 1} deleted.`;
    }
    case "!addcom": case "!editcom": {
      // Nightbot-style: !addcom !name reply text. {user} = who typed it, {touser} = who they named, {count} = times used.
      if (!chatter.mod) return null;
      const name = (rest[0] || "").toLowerCase();
      const reply = rest.slice(1).join(" ");
      if (!name.startsWith("!") || !reply) return `Usage: ${c} !name reply text ({user} {touser} {count} work)`;
      if (STATS.includes(name) || queue.QUEUE_COMMANDS.includes(name)) return `${name} is a built-in command.`;
      const exists = await redis("HEXISTS", "bot:cmds", name) || !!(config.bot?.commands || {})[name];
      if (c === "!addcom" && exists) return `${name} already exists. Use !editcom.`;
      await redis("HSET", "bot:cmds", name, JSON.stringify({ text: reply.slice(0, 400), cooldown: 10 }));
      return `${name} ${exists ? "updated" : "added"}.`;
    }
    case "!delcom": {
      if (!chatter.mod) return null;
      const name = (rest[0] || "").toLowerCase();
      const gone = await redis("HDEL", "bot:cmds", name);
      if (gone) return `${name} deleted.`;
      if ((config.bot?.commands || {})[name]) { await redis("HSET", "bot:cmds", name, JSON.stringify({ text: "", off: true })); return `${name} turned off.`; }
      return `There's no ${name} command.`;
    }
    case "!commands": case "!help": {
      const flat = (await redis("HGETALL", "bot:cmds")) || [];
      const fromChat = {};
      for (let k = 0; k < flat.length; k += 2) fromChat[flat[k]] = JSON.parse(flat[k + 1]);
      const all = { ...(config.bot?.commands || {}), ...fromChat };
      const text = Object.entries(all).filter(([, v]) => !(v && (v.mods || v.off))).map(([k]) => k).join(" ");
      return `Commands: !join !leave !queue !uptime !quote !table !race !me !player <name> !last !record !vote !followage !waxydor ${text}`.slice(0, 500);
    }
    default: {
      // Text commands: from chat (!addcom) or config.bot.commands. A string, or { text, cooldown, mods }.
      if (!custom || custom.off || !custom.text) return null;
      if (custom.mods && !chatter.mod) return null;
      if (/\{touser\}/.test(custom.text) && !target) return `Usage: ${c} @name`;
      const count = /\{count\}/.test(custom.text) ? await redis("HINCRBY", "bot:counts", c, 1) : 0;
      return custom.text.replace(/\{user\}/g, chatter.name).replace(/\{touser\}/g, target).replace(/\{count\}/g, count).replace(/\{site\}/g, site);
    }
  }
}
