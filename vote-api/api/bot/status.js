// GET /api/bot/status — which accounts WaxyBot is connected as. Public on purpose: it shows logins only, never tokens.
import { redis } from "../../lib/shared.js";
import { ids, followCheck } from "../../lib/bot.js";

export default async function handler(req, res) {
  const { bot, broadcaster } = await ids();
  const followers = bot && broadcaster ? await followCheck().catch((e) => "error: " + e.message) : "not connected";
  res.setHeader("Cache-Control", "no-store");
  return res.json({ botAccount: bot?.login || null, channel: broadcaster?.login || null, followerLookup: followers });
}
