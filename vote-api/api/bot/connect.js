// GET /api/bot/connect?as=bot | broadcaster
// One-time setup: sends the bot account (or the channel owner) to Twitch to approve WaxyBot.
// The bot account grants "chat as a bot" (and, as a channel mod, "read followers" for !followage);
// the channel owner grants "let a bot chat in my channel".
import { randomBytes } from "node:crypto";
import { redis } from "../../lib/shared.js";

const SCOPES = { bot: "user:bot user:read:chat user:write:chat moderator:read:followers", broadcaster: "channel:bot" };

export default async function handler(req, res) {
  const as = req.query.as;
  if (!SCOPES[as]) return res.status(400).send("Use ?as=bot or ?as=broadcaster");
  const state = randomBytes(16).toString("hex");
  await redis("SET", "bot:state:" + state, as, "EX", 600);
  const u = new URL("https://id.twitch.tv/oauth2/authorize");
  u.search = new URLSearchParams({
    client_id: process.env.BOT_CLIENT_ID, response_type: "code", scope: SCOPES[as], state, force_verify: "true",
    redirect_uri: `https://${req.headers.host}/api/bot/callback`,
  }).toString();
  res.setHeader("Location", u.toString());
  return res.status(302).end();
}
