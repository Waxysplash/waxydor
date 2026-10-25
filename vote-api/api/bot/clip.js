// POST /api/bot/clip — the captain's clip key in OBS (obs/instant-replay.lua in the brand folder) calls this.
// Makes a Twitch clip of the last 30 seconds as the channel owner and posts the link in chat.
// Needs the X-Clip-Key header to match the key WaxyBot made and showed the channel owner when they connected.
import { timingSafeEqual } from "node:crypto";
import { redis } from "../../lib/shared.js";
import { createClip, say, logEvent } from "../../lib/bot.js";

const keyOk = async (given) => {
  const want = (await redis("GET", "bot:clipkey")) || "";
  const a = Buffer.from(String(given || "")), b = Buffer.from(want);
  return want.length >= 16 && a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!(await keyOk(req.headers["x-clip-key"]))) return res.status(401).json({ error: "bad key" });
  // A double press makes one clip, not two.
  if (!(await redis("SET", "bot:clipcooldown", "1", "NX", "EX", 10))) return res.json({ skipped: "cooldown" });
  try {
    const url = await createClip();
    await say(`🎬 Clip: ${url}`);
    await logEvent({ user: "obs", text: "clip key", reply: url });
    return res.json({ url });
  } catch (e) {
    console.error(e);
    await logEvent({ user: "obs", text: "clip key", reply: "failed: " + String(e.message).slice(0, 200) });
    return res.status(500).json({ error: String(e.message).slice(0, 200) });
  }
}
