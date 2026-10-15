// POST /api/vote  { token, picks?: [first, second, third] }
// Without picks: returns who is logged in, whether they follow, and their current ballot.
// With picks: saves the ballot under their Twitch user ID, replacing any earlier one.
import { cors, loadVote, redis, twitchUser, follows, tally, fail, VoteError } from "../lib/shared.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const { token, picks } = req.body || {};
    const vote = await loadVote();
    const user = await twitchUser(token);
    const follower = await follows(user, vote.channel, token);
    const saved = await redis("HGET", vote.key, user.id);
    const ballot = saved ? JSON.parse(saved) : null;
    if (!picks) {
      const out = { login: user.login, follower, ballot, phase: vote.phase };
      // The channel owner (the captain) sees live totals while voting is open. Twitch has confirmed the login above.
      if (user.login.toLowerCase() === String(vote.channel).toLowerCase()) {
        const raw = (await redis("HVALS", vote.key)) || [];
        out.captain = { ballots: raw.length, results: tally(raw.map((b) => JSON.parse(b)), vote.shortlist, vote.points || [5, 3, 1]) };
      }
      return res.json(out);
    }

    if (vote.phase !== "open") throw new VoteError(403, "closed", vote.phase === "closed" ? "Voting has closed." : "Voting isn't open yet.");
    if (vote.followersOnly && !follower) throw new VoteError(403, "follow", `Follow twitch.tv/${vote.channel} to vote.`);
    const n = (vote.points || [5, 3, 1]).length;
    if (!Array.isArray(picks) || picks.length !== n || new Set(picks).size !== n || !picks.every((p) => vote.shortlist.includes(p)))
      throw new VoteError(400, "ballot", `Pick ${n} different players from the shortlist.`);

    const next = { login: user.login, picks, at: new Date().toISOString() };
    await redis("HSET", vote.key, user.id, JSON.stringify(next));
    return res.json({ login: user.login, follower, ballot: next, phase: vote.phase, replaced: !!ballot });
  } catch (e) {
    return fail(res, e);
  }
}
