// WaxyBot on TikTok LIVE. TikTok has no bot accounts or chat API, so Social Stream Ninja reads the TikTok comments
// on the stream PC and a small relay there (tiktokbot/tiktok_relay.py in the brand folder) sends every "!" comment
// to POST /api/bot/clip { tiktok: { name, text } } with the clip key. It runs the same commands as Twitch chat.
// The answer goes out as a "tiktok" alert: overlays/alerts.html shows it as a toast on the vertical canvas only,
// and the relay picks it up from /api/alerts and types it into TikTok chat through SSN.
// TikTok viewers are "tt:<name>" so they never clash with a Twitch login. Settings: config.bot.tiktok.
import { createHash } from "node:crypto";
import { redis } from "./shared.js";
import { handleCommand, loadConfig, logEvent, say } from "./bot.js";
import { pushAlert, tiktokChat } from "./alerts.js";

// Twitch-only commands: they need a Twitch account, or would let TikTok spam Twitch (clips).
const BLOCKED = ["!clip", "!followage", "!vote", "!so", "!shoutout", "!cotw"];

// The capture window only gives TikTok's display name, so that is the key. Lowercase, no spaces or symbols.
const handleOf = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9._]/g, "").slice(0, 40);
const clean = (s) => String(s || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40);

export async function tiktokCommand({ user, name, text } = {}, { dry = false } = {}) {
  const config = await loadConfig();
  const t = config.bot?.tiktok || {};
  if (!t.on) return { skipped: "off" };
  const display = clean(name || user);
  const handle = handleOf(user || name);
  const msg = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!handle || !msg.startsWith("!")) return { skipped: "not a command" };

  // The capture window can read a comment twice; the same comment from the same person within 30 s counts once.
  const dup = createHash("sha1").update(handle + "\n" + msg.toLowerCase()).digest("hex").slice(0, 16);
  if (!(await redis("SET", "tt:dup:" + dup, "1", "NX", "EX", 30))) return { skipped: "duplicate" };
  const [cmd, ...rest] = msg.split(" ");
  const c = cmd.toLowerCase();
  if (BLOCKED.includes(c)) return { skipped: "twitch only" };
  if (!(await redis("SET", "tt:cd:" + handle, "1", "NX", "EX", t.cooldown || 10))) return { skipped: "cooldown" };
  const chatter = { login: "tt:" + handle, name: display || handle, id: null, mod: false, sub: false, tiktok: true };

  let reply;
  if (dry && ["!join", "!leave", "!link"].includes(c)) {
    reply = `(dry run) ${chatter.name} ${c} would change the queue or links, so it was not run.`;
  } else if (c === "!link") {
    // !link <EA name>: remembers who they are on EA, for !me and so the captain knows who to invite.
    const ea = clean(rest.join(" "));
    if (!ea) reply = `${chatter.name} type !link <your EA name>, e.g. !link George-Truly`;
    else { await redis("SET", "tt:link:" + handle, ea); reply = `${chatter.name} linked to EA name ${ea}. !me shows your stats.`; }
  } else {
    chatter.player = (await redis("GET", "tt:link:" + handle)) || "";
    // In the queue, a linked EA name goes in their note so the captain can send the invite.
    const line = c === "!join" && chatter.player && !rest.some((w) => w.toLowerCase().includes(chatter.player.toLowerCase()))
      ? `${msg} EA ${chatter.player}` : msg;
    reply = await handleCommand(line, chatter);
  }

  await logEvent({ user: chatter.login, text: msg.slice(0, 120), reply: reply ? reply.slice(0, 200) : null, tiktok: true, ...(dry ? { dry: true } : {}) });
  if (!reply || dry) return { reply: reply || null, chat: reply ? tiktokChat(reply) : null, dry };
  await pushAlert({ type: "tiktok", name: chatter.name, cmd: c, text: reply, chat: tiktokChat(reply) });
  if (t.twitchEcho) await say(`[TikTok] ${reply}`).catch((e) => console.error("tiktok echo", e.message));
  return { reply, chat: tiktokChat(reply) };
}
