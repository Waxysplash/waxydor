// POST /api/bot/eventsub — Twitch EventSub webhook for channel.chat.message.
// Verifies Twitch's signature, answers "!" commands, ignores everything else.
import { redis } from "../../lib/shared.js";
import { webhookSecret, verifySignature, handleCommand, say, ids } from "../../lib/bot.js";

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
  if (type === "revocation") { console.warn("eventsub revoked", body.subscription?.status); return res.status(204).end(); }

  // Twitch retries deliveries; answer each message once.
  const fresh = await redis("SET", "bot:seen:" + req.headers["twitch-eventsub-message-id"], "1", "NX", "EX", 600);
  if (!fresh) return res.status(204).end();

  const e = body.event || {};
  const text = e.message?.text || "";
  const { bot } = await ids();
  if (!text.startsWith("!") || e.chatter_user_id === bot?.id) return res.status(204).end();
  try {
    const reply = await handleCommand(text, {
      login: e.chatter_user_login, name: e.chatter_user_name, id: e.chatter_user_id,
      mod: (e.badges || []).some((b) => b.set_id === "moderator" || b.set_id === "broadcaster"),
    });
    if (reply) await say(reply, e.message_id);
  } catch (err) {
    console.error("command failed", text, err);
  }
  return res.status(204).end();
}
