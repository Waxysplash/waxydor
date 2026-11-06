// New Twitch clips credited to the channel go to a Discord channel through a webhook (env DISCORD_CLIP_WEBHOOK).
// That's the owner's own clips plus every clip WaxyBot makes (chat !clip, auto clips, OBS key, voice), since the
// bot clips as the channel owner. Clips viewers make on Twitch themselves are left out.
// Checked off the back of chat (at most every 2 minutes) and after each stats poll; each clip is posted once.
import { redis } from "./shared.js";
import { helix, ids } from "./bot.js";

export async function postNewClips({ force = false } = {}) {
  const hook = process.env.DISCORD_CLIP_WEBHOOK;
  if (!hook) return { posted: 0, reason: "DISCORD_CLIP_WEBHOOK not set" };
  if (!force && !(await redis("SET", "discord:clipcheck", "1", "NX", "EX", 120))) return { posted: 0, reason: "checked recently" };
  const { broadcaster } = await ids();
  if (!broadcaster) return { posted: 0, reason: "bot not connected" };

  // First run: start from now, so the channel's old clips aren't dumped into Discord.
  let since = await redis("GET", "discord:clipsince");
  if (!since) { since = new Date().toISOString(); await redis("SET", "discord:clipsince", since); }
  // Twitch only searches 7 days at a time.
  const now = new Date();
  const from = new Date(Math.max(Date.parse(since), now - 6 * 864e5)).toISOString();
  const j = await helix("GET", `clips?broadcaster_id=${broadcaster.id}&started_at=${from}&ended_at=${now.toISOString()}&first=50`);
  const mine = (j.data || [])
    .filter((c) => c.creator_id === broadcaster.id && c.created_at >= since)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  let posted = 0;
  for (const c of mine.slice(-5)) {
    // Claim it before posting, so two checks at once can't post the same clip twice.
    if (!(await redis("SADD", "discord:clips", c.id))) continue;
    const r = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `🎬 **${c.title || "New clip"}**\n${c.url}`, allowed_mentions: { parse: [] } }),
    });
    if (!r.ok) {
      await redis("SREM", "discord:clips", c.id);
      throw new Error(`discord ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    posted++;
  }
  return { posted };
}
