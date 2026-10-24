// GET /api/queue — the live Pro Clubs queue for the site's queue page and OBS. Twitch names, EA names and
// positions only; nothing private.
// POST /api/queue { token, action?, login? } — the captain's controls on the queue page. Twitch must confirm the login
// is the channel owner. action "pick" = !pick @login (WaxyBot tags them in chat), "back" = !back, "remove" = !remove.
import { cors, twitchUser, fail, VoteError } from "../lib/shared.js";
import { load, publicView, command } from "../lib/queue.js";
import { say } from "../lib/bot.js";

let cfg = { at: 0, rules: {}, channel: "" };
async function config() {
  if (Date.now() - cfg.at > 60_000) {
    const r = await fetch("https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/config.json?t=" + Math.floor(Date.now() / 60_000));
    if (r.ok) { const c = await r.json(); cfg = { at: Date.now(), rules: c.queue || {}, channel: String(c.fanVote?.channel || "").toLowerCase() }; }
  }
  return cfg;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    const [s, c] = await Promise.all([load(), config()]);
    return res.json(publicView(s, c.rules));
  }
  try {
    const { token, action, login } = req.body || {};
    const [user, c] = await Promise.all([twitchUser(token), config()]);
    if (!c.channel || user.login.toLowerCase() !== c.channel) throw new VoteError(403, "captain", "Only the channel owner can run the queue from here.");
    let message = null;
    const cmd = { pick: "!pick", back: "!back", remove: "!remove" }[action];
    if (cmd && login) {
      message = await command(cmd, [String(login)], { login: user.login, name: user.login, mod: true }, c.rules, async () => true);
      // Tag them in chat like the chat command does. The pick stands even if Twitch chat is down.
      if (/you're up/.test(message)) await say(message).catch((e) => console.error("queue say", e.message));
    }
    return res.json({ captain: true, message, queue: publicView(await load(), c.rules) });
  } catch (e) {
    return fail(res, e);
  }
}
