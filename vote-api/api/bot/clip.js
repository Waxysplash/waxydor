// POST /api/bot/clip — the captain's clip key in OBS (obs/instant-replay.lua in the brand folder) and the clip
// agent's "clip that" voice trigger (clipbot/clipbot.py) call this. Makes a Twitch clip of the last 30 seconds as
// the channel owner, posts the link in chat as a WaxyClip and pops a "Clipped" card on the alerts overlay.
// Body (optional): { "source": "voice" }; no body means the OBS key.
// GET /api/bot/clip?since=<iso time> — every clip WaxyBot made since then (chat !clip, auto clips, OBS key, voice),
// oldest first, so the clip agent can save the full-res vertical copy of each one.
// Both need the X-Clip-Key header to match the key WaxyBot made and showed the channel owner when they connected.
import { timingSafeEqual } from "node:crypto";
import { redis } from "../../lib/shared.js";
import { createClip, say, logEvent } from "../../lib/bot.js";
import { pushAlert } from "../../lib/alerts.js";

const keyOk = async (given) => {
  const want = (await redis("GET", "bot:clipkey")) || "";
  const a = Buffer.from(String(given || "")), b = Buffer.from(want);
  return want.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "GET or POST" });
  if (!(await keyOk(req.headers["x-clip-key"]))) return res.status(401).json({ error: "bad key" });
  if (req.method === "GET") {
    const since = String(req.query.since || "");
    const clips = ((await redis("LRANGE", "bot:clips", 0, 49)) || []).map((c) => JSON.parse(c))
      .filter((c) => !since || c.at > since).reverse();
    return res.json({ clips });
  }
  const source = req.body?.source === "voice" ? "voice" : "obs";
  // A double press makes one clip, not two.
  if (!(await redis("SET", "bot:clipcooldown", "1", "NX", "EX", 10))) return res.json({ skipped: "cooldown" });
  try {
    const url = await createClip(source, "Waxy");
    await pushAlert({ type: "clip" });
    await say(`🎬 WaxyClip: ${url}`);
    await logEvent({ user: source, text: source === "voice" ? "clip that" : "clip key", reply: url });
    return res.json({ url });
  } catch (e) {
    console.error(e);
    await logEvent({ user: source, text: "clip", reply: "failed: " + String(e.message).slice(0, 200) });
    return res.status(500).json({ error: String(e.message).slice(0, 200) });
  }
}
