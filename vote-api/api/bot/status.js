// GET /api/bot/status — which accounts WaxyBot is connected as. Public on purpose: it shows logins only, never tokens.
import { redis } from "../../lib/shared.js";
import { ids } from "../../lib/bot.js";

export default async function handler(req, res) {
  const { bot, broadcaster } = await ids();
  const followage = !!(await redis("GET", "bot:refresh"));
  res.setHeader("Cache-Control", "no-store");
  return res.json({ botAccount: bot?.login || null, channel: broadcaster?.login || null, followageReady: followage });
}
