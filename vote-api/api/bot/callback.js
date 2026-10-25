// GET /api/bot/callback — Twitch sends the approver back here. Chat runs on an app token; the user tokens
// kept are the bot account's refresh token, for !followage (Twitch shows followers only to mods), and the
// channel owner's, for clips. Once both accounts have approved, the chat subscription is created automatically.
import { randomBytes } from "node:crypto";
import { redis, loadVote } from "../../lib/shared.js";
import { subscribeChat, ids } from "../../lib/bot.js";
import { subscribeAlerts } from "../../lib/alerts.js";

const page = (res, title, msg, ok) => res.status(ok ? 200 : 400).setHeader("Content-Type", "text/html; charset=utf-8").send(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>WaxyBot</title>
  <body style="font-family:system-ui;background:#16150e;color:#ece1c3;display:grid;place-items:center;min-height:90vh;margin:0">
  <div style="max-width:520px;padding:24px"><h1 style="color:${ok ? "#d9a63b" : "#c9583f"}">${title}</h1><p style="line-height:1.5">${msg}</p></div>`);

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query;
  if (error) return page(res, "Not connected", `Twitch said: ${String(error_description || error).slice(0, 200)}`, false);
  const as = state && (await redis("GET", "bot:state:" + state));
  if (!as) return page(res, "Link expired", "Start again from the setup link.", false);
  await redis("DEL", "bot:state:" + state);

  const tr = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.BOT_CLIENT_ID, client_secret: process.env.BOT_CLIENT_SECRET, code,
      grant_type: "authorization_code", redirect_uri: `https://${req.headers.host}/api/bot/callback`,
    }),
  });
  const t = await tr.json();
  if (!t.access_token) return page(res, "Not connected", "Twitch didn't accept the approval. Try again.", false);
  const v = await (await fetch("https://id.twitch.tv/oauth2/validate", { headers: { Authorization: `OAuth ${t.access_token}` } })).json();
  const who = { id: v.user_id, login: v.login };

  const { channel } = await loadVote();
  const isOwner = who.login.toLowerCase() === String(channel).toLowerCase();
  if (as === "broadcaster" && !isOwner)
    return page(res, "Wrong account", `You approved as ${who.login}. This step needs the channel owner, ${channel}.`, false);
  // The bot must be its own account, never the channel owner, or it would talk in chat as the captain.
  if (as === "bot" && isOwner)
    return page(res, "Wrong account", `You approved as ${who.login}, the channel owner. Log in to Twitch as the bot account and open this link again.`, false);
  await redis("SET", "bot:" + as, JSON.stringify(who));
  if (as === "bot" && t.refresh_token) { await redis("SET", "bot:refresh", t.refresh_token); await redis("DEL", "bot:usertoken"); }
  if (as === "broadcaster" && t.refresh_token) { await redis("SET", "bot:bcrefresh", t.refresh_token); await redis("DEL", "bot:bctoken"); }
  // The OBS clip key: made once, shown only to the channel owner right after they approve.
  let clipKey = "";
  if (as === "broadcaster") {
    clipKey = (await redis("GET", "bot:clipkey")) || randomBytes(24).toString("base64url");
    await redis("SET", "bot:clipkey", clipKey);
  }
  const clipNote = clipKey ? `<br><br>OBS clip key (paste into OBS → Tools → Scripts → instant-replay.lua):<br><code style="user-select:all;color:#d9a63b">${clipKey}</code>` : "";

  const both = await ids();
  if (!both.bot || !both.broadcaster)
    return page(res, `${who.login} connected ✓`, `Now approve the ${both.bot ? "channel owner" : "bot account"} step.${clipNote}`, true);
  let alertNote = "";
  try {
    await subscribeChat(`https://${req.headers.host}/api/bot/eventsub`);
    const failed = (await subscribeAlerts(`https://${req.headers.host}/api/bot/eventsub`)).filter((r) => !r.ok);
    alertNote = failed.length ? `<br><br>Alerts not set up for: ${failed.map((f) => f.type.replace("channel.", "")).join(", ")}. Reconnect both accounts to retry.` : "<br><br>On-stream alerts are on.";
  } catch (e) {
    console.error(e);
    return page(res, "Almost", `Both accounts approved, but Twitch refused the chat subscription: ${String(e.message).slice(0, 300)}`, false);
  }
  return page(res, "WaxyBot is live ✓", `${both.bot.login} will answer commands in ${both.broadcaster.login}'s chat. Type !commands to try it.${alertNote}${clipNote}`, true);
}
