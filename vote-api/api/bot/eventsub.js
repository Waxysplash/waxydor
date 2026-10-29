// POST /api/bot/eventsub — Twitch EventSub webhook. Verifies Twitch's signature, answers "!" commands from
// channel.chat.message, turns follows, subs, gifts, raids and cheers into on-stream alerts, and closes the
// queue when the stream ends.
import { redis } from "../../lib/shared.js";
import { alertFromEvent, pushAlert, ensureStreamEvents } from "../../lib/alerts.js";
import { streamOffline, streamOnline } from "../../lib/queue.js";
import { webhookSecret, verifySignature, handleCommand, say, ids, logEvent, runTimers, loadConfig, hypeCheck } from "../../lib/bot.js";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const raw = await rawBody(req);
  if (!verifySignature(await webhookSecret(), req.headers, raw)) return res.status(403).end();
  const body = JSON.parse(raw);
  const type = req.headers["twitch-eventsub-message-type"];
  if (type === "webhook_callback_verification") return res.status(200).setHeader("Content-Type", "text/plain").send(body.challenge);
  if (type === "revocation") { console.warn("eventsub revoked", body.subscription?.status); await logEvent({ revoked: body.subscription?.status }); return res.status(204).end(); }

  // Twitch retries deliveries; answer each message once.
  const fresh = await redis("SET", "bot:seen:" + req.headers["twitch-eventsub-message-id"], "1", "NX", "EX", 600);
  if (!fresh) return res.status(204).end();

  const e = body.event || {};
  const subType = body.subscription?.type;
  if (subType === "stream.offline" || subType === "stream.online") {
    try {
      const msg = await (subType === "stream.offline" ? streamOffline() : streamOnline());
      if (msg) await say(msg).catch((err) => console.error("queue say", err.message));
      await logEvent({ stream: subType, queue: msg ? msg.slice(0, 120) : "no change" });
    } catch (err) { console.error(subType, err); }
    return res.status(204).end();
  }
  if (subType !== "channel.chat.message") {
    const alert = alertFromEvent(subType, e);
    if (alert) await pushAlert(alert);
    return res.status(204).end();
  }
  // Make sure Twitch will tell us when the stream ends (checked every few hours, off the back of chat).
  try { await ensureStreamEvents(`https://${req.headers.host}/api/bot/eventsub`); } catch (err) { console.error("stream events", err.message); }
  const text = e.message?.text || "";
  const { bot } = await ids();
  if (e.chatter_user_id === bot?.id) return res.status(204).end();
  if (!text.startsWith("!")) {
    try { await runTimers(await loadConfig()); } catch (err) { console.error("timers", err); }
    try { await hypeCheck(e, await loadConfig()); } catch (err) { console.error("autoclip", err); }
    return res.status(204).end();
  }
  try {
    const reply = await handleCommand(text, {
      login: e.chatter_user_login, name: e.chatter_user_name, id: e.chatter_user_id,
      mod: (e.badges || []).some((b) => b.set_id === "moderator" || b.set_id === "broadcaster"),
      sub: (e.badges || []).some((b) => b.set_id === "subscriber" || b.set_id === "founder"),
    });
    if (reply) await say(reply, e.message_id);
    await logEvent({ user: e.chatter_user_login, text: text.slice(0, 120), reply: reply ? reply.slice(0, 200) : null });
  } catch (err) {
    console.error("command failed", text, err);
    await logEvent({ user: e.chatter_user_login, text: text.slice(0, 120), error: String(err.message || err).slice(0, 300) });
  }
  return res.status(204).end();
}
