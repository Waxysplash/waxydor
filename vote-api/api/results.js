// GET /api/results
// While voting is open only the number of ballots is public. Once voting closes the finishing order is
// public, but not the points or the ballot count: those stay in the captain's view (/api/vote).
// Who voted for whom is never published.
import { cors, loadVote, redis, tally, fail } from "../lib/shared.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const vote = await loadVote();
    const raw = (await redis("HVALS", vote.key)) || [];
    const out = { phase: vote.phase, opens: vote.opens, closes: vote.closes };
    if (vote.phase === "closed") out.results = tally(raw.map((b) => JSON.parse(b)), vote.shortlist, vote.points || [5, 3, 1]).map(({ name }) => ({ name }));
    else out.ballots = raw.length;
    res.setHeader("Cache-Control", "s-maxage=30");
    return res.json(out);
  } catch (e) {
    return fail(res, e);
  }
}
