// New Twitch clips credited to the channel go to a Discord channel through a webhook (env DISCORD_CLIP_WEBHOOK).
// That's the owner's own clips plus every clip WaxyBot makes (chat !clip, auto clips, OBS key, voice), since the
// bot clips as the channel owner. Clips viewers make on Twitch themselves are left out.
// Checked off the back of chat (at most every 2 minutes) and after each stats poll; each clip is posted once.
import { redis } from "./shared.js";
import { helix, ids, loadData } from "./bot.js";

export async function postNewClips({ force = false } = {}) {
  const hook = process.env.DISCORD_CLIP_WEBHOOK;
  if (!hook) return { posted: 0, reason: "DISCORD_CLIP_WEBHOOK not set" };
  if (!force && !(await redis("SET", "discord:clipcheck", "1", "NX", "EX", 120))) return { posted: 0, reason: "checked recently" };
  const { broadcaster } = await ids();
  if (!broadcaster) return { posted: 0, reason: "bot not connected" };

  // First run: start from now, so the channel's old clips aren't dumped into Discord.
  let since = await redis("GET", "discord:clipsince");
  if (!since) { since = new Date().toISOString(); await redis("SET", "discord:clipsince", since); }
  // Twitch only searches 7 days at a time.
  const now = new Date();
  const from = new Date(Math.max(Date.parse(since), now - 6 * 864e5)).toISOString();
  const j = await helix("GET", `clips?broadcaster_id=${broadcaster.id}&started_at=${from}&ended_at=${now.toISOString()}&first=50`);
  const mine = (j.data || [])
    .filter((c) => c.creator_id === broadcaster.id && c.created_at >= since)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let posted = 0;
  for (const c of mine.slice(-5)) {
    // Claim it before posting, so two checks at once can't post the same clip twice.
    if (!(await redis("SADD", "discord:clips", c.id))) continue;
    const r = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🎬 **${c.title || "New clip"}**\n${c.url}`, allowed_mentions: { parse: [] } }),
    });
    if (!r.ok) {
      await redis("SREM", "discord:clips", c.id);
      throw new Error(`discord ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    posted++;
  }
  return { posted };
}

// ---------- Go-live card + full-time recap (replaces MEE6's go-live ping, Kamal 14 Nov 2026) ----------
// stream.online → one "@everyone, we're live" card in #going-live through a webhook (env DISCORD_LIVE_WEBHOOK),
// posted the moment Twitch says so. stream.offline → the same message is edited into a full-time card with the
// stream's W-D-L. EA's results land after the stream ends, so every stats poll (/api/bot/announce) refreshes the
// recap for 6 hours. A stream that drops and comes back within 15 minutes edits the card back to live, no new ping.
const BRASS = 0xb9985a, RED = 0x9d3a2b;
const CREST = "https://waxysplash.com/brand/crest.png";
const TWITCH = "https://twitch.tv/waxysplash";
const SITE = "https://waxysplash.com/";
const BLIP_MS = 15 * 60_000, RECAP_MS = 6 * 3600_000;

async function hookCall(method, path, body) {
  // Strip a byte-order mark or spaces that can sneak in when the env var is set from a Windows shell.
  const hook = (process.env.DISCORD_LIVE_WEBHOOK || "").replace(/^﻿/, "").trim();
  if (!hook) throw new Error("DISCORD_LIVE_WEBHOOK not set");
  const r = await fetch(hook + path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`discord ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function streamInfo() {
  const { broadcaster } = await ids();
  const [s, c] = await Promise.all([
    helix("GET", `streams?user_id=${broadcaster.id}`).then((j) => (j.data || [])[0]).catch(() => null),
    helix("GET", `channels?broadcaster_id=${broadcaster.id}`).then((j) => (j.data || [])[0]).catch(() => null),
  ]);
  return { title: s?.title || c?.title || "Waxy Splash is live", game: s?.game_name || c?.game_name || "", startedAt: s?.started_at };
}

function liveEmbed(info) {
  return {
    color: RED,
    author: { name: "Waxys Phantoms · LIVE NOW", icon_url: CREST, url: TWITCH },
    title: info.title.slice(0, 250),
    url: TWITCH,
    description: `**Waxy Splash is live on Twitch!** Come hang out${/pro clubs/i.test(info.title) ? ", type **!join** to get in the queue" : ""} 🇲🇦`,
    fields: info.game ? [{ name: "Playing", value: info.game, inline: true }, { name: "Watch", value: `[twitch.tv/waxysplash](${TWITCH})`, inline: true }] : [],
    thumbnail: { url: CREST },
    // Twitch's live preview; the query string stops Discord caching an old frame.
    image: { url: `https://static-cdn.jtvnw.net/previews-ttv/live_user_waxysplash-1280x720.jpg?t=${Date.now()}` },
    timestamp: new Date(info.startedAt || Date.now()).toISOString(),
  };
}

async function recapEmbed(live) {
  const d = await loadData();
  const from = Date.parse(live.startedAt) - 5 * 60_000, to = Date.parse(live.endedAt) + 10 * 60_000;
  const games = d.matches.filter((m) => m.timestamp * 1000 >= from && m.timestamp * 1000 <= to).sort((a, b) => a.timestamp - b.timestamp);
  const n = (r) => games.filter((m) => m.result === r).length;
  const mins = Math.round((Date.parse(live.endedAt) - Date.parse(live.startedAt)) / 60_000);
  const lines = games.slice(-12).map((m) => `${{ W: "🟢", D: "⚪", L: "🔴" }[m.result] || "▫️"} ${m.goalsFor}-${m.goalsAgainst} ${m.opponent}`);
  return {
    color: BRASS,
    author: { name: "Waxys Phantoms · FULL TIME", icon_url: CREST, url: SITE },
    title: live.title.slice(0, 250),
    url: TWITCH,
    description: games.length
      ? `**${n("W")}W ${n("D")}D ${n("L")}L** in ${games.length} game${games.length === 1 ? "" : "s"} · ${Math.floor(mins / 60)}h ${mins % 60}m live\n\n${lines.join("\n")}`
      : `Stream's over (${Math.floor(mins / 60)}h ${mins % 60}m). Results appear here once EA has them.`,
    fields: [{ name: "Waxy d'Or", value: `[Live table + player cards](${SITE})`, inline: true }, { name: "Next stream", value: "<#694005931989794896>", inline: true }],
    thumbnail: { url: CREST },
    footer: { text: "Thanks for watching!" },
    timestamp: new Date(live.endedAt).toISOString(),
  };
}

const getLive = async () => { const v = await redis("GET", "discord:live"); return v ? JSON.parse(v) : null; };
const setLive = (v) => redis("SET", "discord:live", JSON.stringify(v), "EX", 7 * 86400);

export async function postLive({ test = false } = {}) {
  if (!process.env.DISCORD_LIVE_WEBHOOK) return { reason: "DISCORD_LIVE_WEBHOOK not set" };
  // Twitch can send stream.online twice; only the first one in 2 minutes counts.
  if (!test && !(await redis("SET", "discord:liveclaim", "1", "NX", "EX", 120))) return { reason: "already handled" };
  const info = await streamInfo();
  const prev = await getLive();
  if (!test && prev?.endedAt && Date.now() - Date.parse(prev.endedAt) < BLIP_MS) {
    await hookCall("PATCH", `/messages/${prev.id}`, { embeds: [liveEmbed({ ...info, startedAt: prev.startedAt })] });
    await setLive({ ...prev, endedAt: null });
    return { resumed: prev.id };
  }
  const msg = await hookCall("POST", "?wait=true", {
    username: "WaxyBot", avatar_url: CREST,
    content: test ? "🧪 Test post (not live). Ignore me!" : "Hey @everyone, we're live! 🔴",
    allowed_mentions: { parse: test ? [] : ["everyone"] },
    embeds: [liveEmbed(info)],
  });
  const live = { id: msg.id, title: info.title, startedAt: info.startedAt || new Date().toISOString(), endedAt: null, test };
  await setLive(live);
  return { posted: msg.id };
}

export async function postFullTime() {
  const live = await getLive();
  if (!live || live.endedAt) return { reason: "no live card" };
  live.endedAt = new Date().toISOString();
  await setLive(live);
  await hookCall("PATCH", `/messages/${live.id}`, { content: "", embeds: [await recapEmbed(live)] });
  return { recap: live.id };
}

// After each stats poll: refresh the recap with any results EA has added since.
export async function refreshRecap() {
  const live = await getLive();
  if (!live?.endedAt || Date.now() - Date.parse(live.endedAt) > RECAP_MS) return { reason: "nothing to refresh" };
  await hookCall("PATCH", `/messages/${live.id}`, { embeds: [await recapEmbed(live)] });
  return { refreshed: live.id };
}
