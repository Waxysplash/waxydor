// GET /api/clips — the channel's Twitch clips from the last 90 days, newest first, for the Waxyclips page
// and the clips replay scene. Comes straight from Twitch, so viewers' clips show up too. Also carries the
// Clip of the Week vote: this week's nominees with their votes, and last week's winner.
// POST /api/clips { token, clip? } — Clip of the Week ballot. Without clip: who is logged in and their vote.
// With clip: votes for it (one vote per Twitch account per week, followers only; voting again moves it).
import { cors, fail, loadVote, twitchUser, follows, VoteError } from "../lib/shared.js";
import { channelClips, state, vote, myVote } from "../lib/cotw.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "POST") {
      const { token, clip } = req.body || {};
      const user = await twitchUser(token);
      const { channel } = await loadVote();
      const follower = await follows(user, channel, token);
      if (!clip) return res.json({ login: user.login, follower, vote: await myVote(user) });
      if (!follower) throw new VoteError(403, "follow", `Follow twitch.tv/${channel} to vote.`);
      return res.json({ login: user.login, follower, vote: await vote(user, String(clip), await channelClips()) });
    }
    const clips = await channelClips();
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
    return res.json({ clips, cotw: await state(clips) });
  } catch (e) {
    return fail(res, e);
  }
}
