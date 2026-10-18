// POST /api/bot/announce — called by the stats poll after each run. Posts the full-time result of every
// match the bot hasn't announced yet, but only while the stream is live. Safe to call any number of
// times by anyone: each match is announced once, and only real results from EA can be posted.
import { redis } from "../../lib/shared.js";
import { loadData, matchLine, say, isLive, ids } from "../../lib/bot.js";

export default async function handler(req, res) {
  try {
    const { bot, broadcaster } = await ids();
    if (!bot || !broadcaster) return res.json({ posted: 0, reason: "bot not connected" });
    const d = await loadData();
    const recent = d.matches.slice(0, 10);
    const first = !(await redis("EXISTS", "bot:announced"));
    const unseen = [];
    for (const m of recent) if (!(await redis("SISMEMBER", "bot:announced", m.matchId))) unseen.push(m);
    // Remember them before posting, so a slow or repeated call can't post twice.
    if (unseen.length) await redis("SADD", "bot:announced", ...unseen.map((m) => m.matchId));
    // First run, or stream offline: just remember what's there.
    if (first || !unseen.length || !(await isLive())) return res.json({ posted: 0, remembered: unseen.length });
    const fresh = unseen.filter((m) => Date.now() - new Date(m.date).getTime() < 3 * 3600_000).reverse().slice(-3);
    for (const m of fresh) await say(matchLine(d, m));
    return res.json({ posted: fresh.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message).slice(0, 200) });
  }
}
