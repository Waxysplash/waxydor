// GET /api/clips — the channel's Twitch clips from the last 90 days, newest first, for the Waxyclips page
// and the clips replay scene. Comes straight from Twitch, so viewers' clips show up too.
import { cors, fail } from "../lib/shared.js";
import { helix, ids } from "../lib/bot.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const { broadcaster } = await ids();
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const clips = [];
    let cursor = "";
    for (let page = 0; page < 3; page++) {
      const j = await helix("GET", `clips?broadcaster_id=${broadcaster.id}&started_at=${since}&first=100${cursor ? "&after=" + cursor : ""}`);
      clips.push(...(j.data || []));
      cursor = j.pagination?.cursor;
      if (!cursor) break;
    }
    const out = clips
      .map((c) => ({ id: c.id, url: c.url, title: c.title, by: c.creator_name, views: c.view_count, seconds: c.duration, at: c.created_at, thumb: c.thumbnail_url }))
      .sort((a, b) => b.at.localeCompare(a.at));
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.json({ clips: out });
  } catch (e) {
    return fail(res, e);
  }
}
