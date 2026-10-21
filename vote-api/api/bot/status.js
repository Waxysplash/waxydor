// GET /api/bot/status — is WaxyBot healthy? Accounts, follower access, Twitch's chat subscription, and
// the last commands it handled. Logins and public chat only, never tokens.
import { redis } from "../../lib/shared.js";
import { ids, followCheck, helix } from "../../lib/bot.js";

export default async function handler(req, res) {
  const { bot, broadcaster } = await ids();
  const connected = bot && broadcaster;
  const followers = connected ? await followCheck().catch((e) => "error: " + e.message) : "not connected";
  const subs = connected ? await helix("GET", "eventsub/subscriptions").then((j) => (j.data || []).map((s) => ({ type: s.type, status: s.status, created: s.created_at }))).catch((e) => "error: " + e.message) : [];
  const n = Math.min(+req.query.n || 25, 200);
  const log = ((await redis("LRANGE", "bot:log", 0, n - 1)) || []).map((l) => JSON.parse(l));
  res.setHeader("Cache-Control", "no-store");
  return res.json({ botAccount: bot?.login || null, channel: broadcaster?.login || null, followerLookup: followers, chatSubscription: subs, recent: log });
}
