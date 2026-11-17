// Player-card photos. A viewer logs in with Twitch and sends a photo for a player's card; it waits until the captain
// (the channel owner) approves it, then it shows on that player's card on the site.
//
// GET  /api/photo                      -> { photos: { "<player>": <version> } }  approved photos only
// GET  /api/photo?p=<player>&v=<ver>   -> the approved JPEG itself
// POST /api/photo { token, action: "me" }                          -> who is logged in, their pending/approved photos
// POST /api/photo { token, action: "submit", player, image }       -> image is a data:image/jpeg;base64 URL
// POST /api/photo { token, action: "pending" }                     -> captain only: photos waiting for approval
// POST /api/photo { token, action: "approve" | "reject" | "remove", player } -> captain only
import { cors, loadVote, redis, twitchUser, fail, VoteError } from "../lib/shared.js";

const PENDING = "photos:pending", LIVE = "photos:live";
const MAX_BYTES = 350_000; // the page sends a 480x640 JPEG, normally 40-90 KB

const isCaptain = (user, vote) => user.login.toLowerCase() === String(vote.channel).toLowerCase();

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      res.setHeader("Access-Control-Allow-Origin", "*"); // public images and list; lets "Save image" on a card include the photo
      const p = req.query.p;
      if (!p) {
        const all = (await redis("HGETALL", LIVE)) || [];
        const photos = {};
        for (let i = 0; i < all.length; i += 2) photos[all[i]] = JSON.parse(all[i + 1]).v;
        res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
        return res.json({ photos });
      }
      const raw = await redis("HGET", LIVE, String(p));
      if (!raw) return res.status(404).json({ error: "none" });
      const { image } = JSON.parse(raw);
      const buf = Buffer.from(image.split(",")[1], "base64");
      res.setHeader("Content-Type", "image/jpeg");
      // The URL carries the version, so a new photo gets a new URL and this one can be cached for good.
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.end(buf);
    }
    if (req.method !== "POST") return res.status(405).json({ error: "method" });

    const { token, action, player, image } = req.body || {};
    const vote = await loadVote();
    const user = await twitchUser(token);
    const captain = isCaptain(user, vote);

    if (action === "me") {
      const [pend, live] = await Promise.all([redis("HGETALL", PENDING), redis("HKEYS", LIVE)]);
      const mine = [];
      for (let i = 0; i < (pend || []).length; i += 2) { const x = JSON.parse(pend[i + 1]); if (x.id === user.id) mine.push(pend[i]); }
      return res.json({ login: user.login, captain, pending: mine, live: live || [] });
    }

    if (action === "submit") {
      if (typeof player !== "string" || !player || player.length > 40) throw new VoteError(400, "player", "Pick which player the photo is for.");
      if (typeof image !== "string" || !image.startsWith("data:image/jpeg;base64,")) throw new VoteError(400, "image", "That photo didn't come through. Try another one.");
      if (image.length * 0.75 > MAX_BYTES) throw new VoteError(413, "image", "That photo is too big. Try another one.");
      // One waiting photo per player: a newer one replaces it. One waiting photo per Twitch account too.
      const pend = (await redis("HGETALL", PENDING)) || [];
      for (let i = 0; i < pend.length; i += 2) if (JSON.parse(pend[i + 1]).id === user.id && pend[i] !== player) await redis("HDEL", PENDING, pend[i]);
      await redis("HSET", PENDING, player, JSON.stringify({ id: user.id, login: user.login, image, at: new Date().toISOString() }));
      return res.json({ ok: true, player });
    }

    if (!captain) throw new VoteError(403, "captain", "Only the captain can do that.");

    if (action === "pending") {
      const pend = (await redis("HGETALL", PENDING)) || [];
      const list = [];
      for (let i = 0; i < pend.length; i += 2) { const x = JSON.parse(pend[i + 1]); list.push({ player: pend[i], login: x.login, at: x.at, image: x.image }); }
      const live = (await redis("HKEYS", LIVE)) || [];
      return res.json({ pending: list.sort((a, b) => a.at.localeCompare(b.at)), live });
    }

    if (typeof player !== "string" || !player) throw new VoteError(400, "player", "Which player?");
    if (action === "approve") {
      const raw = await redis("HGET", PENDING, player);
      if (!raw) throw new VoteError(404, "none", "That photo isn't waiting any more.");
      const x = JSON.parse(raw);
      await redis("HSET", LIVE, player, JSON.stringify({ image: x.image, login: x.login, v: Date.now().toString(36) }));
      await redis("HDEL", PENDING, player);
      return res.json({ ok: true });
    }
    if (action === "reject") { await redis("HDEL", PENDING, player); return res.json({ ok: true }); }
    if (action === "remove") { await redis("HDEL", LIVE, player); return res.json({ ok: true }); }
    throw new VoteError(400, "action", "Unknown action.");
  } catch (e) {
    return fail(res, e);
  }
}
