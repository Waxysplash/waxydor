// On-stream alerts (follows, subs, gifts, raids, cheers, clips) without Streamlabs. Twitch sends the events to
// /api/bot/eventsub, they are kept in Redis with a running number, and overlays/alerts.html asks
// /api/alerts for anything newer than the last one it showed.
import { redis } from "./shared.js";
import { helix, ids, webhookSecret } from "./bot.js";

const KEEP = 50;

export async function pushAlert(a) {
  const id = await redis("INCR", "alerts:seq");
  await redis("LPUSH", "alerts:list", JSON.stringify({ id, t: new Date().toISOString(), ...a }));
  await redis("LTRIM", "alerts:list", 0, KEEP - 1);
  return id;
}

// Everything newer than `after`, oldest first. With no `after`, just the latest number, so a freshly
// opened overlay doesn't replay old alerts.
export async function alertsSince(after) {
  const last = +(await redis("GET", "alerts:seq")) || 0;
  if (after == null || after === "" || +after >= last) return { last, alerts: [] };
  const list = ((await redis("LRANGE", "alerts:list", 0, KEEP - 1)) || []).map((s) => JSON.parse(s));
  return { last, alerts: list.filter((a) => a.id > +after).reverse() };
}

const TIER = { 1000: 1, 2000: 2, 3000: 3 };
const anon = (e) => (e.is_anonymous ? "Anonymous" : e.user_name);

// One EventSub notification -> one alert, or null when it shouldn't show.
export function alertFromEvent(type, e) {
  switch (type) {
    case "channel.follow": return { type: "follow", name: e.user_name };
    // Gifted subs arrive here too, one per recipient; the gift event already covers them.
    case "channel.subscribe": return e.is_gift ? null : { type: "sub", name: e.user_name, tier: TIER[e.tier] || 1 };
    case "channel.subscription.message":
      return { type: "resub", name: e.user_name, tier: TIER[e.tier] || 1, months: e.cumulative_months || 0, message: e.message?.text || "" };
    case "channel.subscription.gift": return { type: "gift", name: anon(e), tier: TIER[e.tier] || 1, count: e.total || 1 };
    case "channel.raid": return { type: "raid", name: e.from_broadcaster_user_name, viewers: e.viewers || 0 };
    case "channel.cheer": return { type: "cheer", name: anon(e), bits: e.bits || 0, message: e.message || "" };
    default: return null;
  }
}

// The alert events and the condition each needs. Follows need a moderator (the bot account); subs and
// cheers need the channel owner's approval (channel:read:subscriptions, bits:read); raids need nothing.
function wanted(bot, b) {
  return [
    { type: "channel.follow", version: "2", condition: { broadcaster_user_id: b.id, moderator_user_id: bot.id } },
    { type: "channel.subscribe", version: "1", condition: { broadcaster_user_id: b.id } },
    { type: "channel.subscription.message", version: "1", condition: { broadcaster_user_id: b.id } },
    { type: "channel.subscription.gift", version: "1", condition: { broadcaster_user_id: b.id } },
    { type: "channel.raid", version: "1", condition: { to_broadcaster_user_id: b.id } },
    { type: "channel.cheer", version: "1", condition: { broadcaster_user_id: b.id } },
  ];
}

// (Re)creates every alert subscription. One failing (say, a missing approval) doesn't stop the rest.
export async function subscribeAlerts(callback) {
  const { bot, broadcaster } = await ids();
  const subs = wanted(bot, broadcaster);
  const existing = (await helix("GET", "eventsub/subscriptions")).data || [];
  for (const s of existing) if (subs.some((w) => w.type === s.type)) await helix("DELETE", `eventsub/subscriptions?id=${s.id}`);
  const secret = await webhookSecret();
  const out = [];
  for (const w of subs) {
    try {
      await helix("POST", "eventsub/subscriptions", { ...w, transport: { method: "webhook", callback, secret } });
      out.push({ type: w.type, ok: true });
    } catch (e) {
      out.push({ type: w.type, ok: false, error: String(e.message).slice(0, 160) });
    }
  }
  return out;
}

// !testalert [follow|sub|resub|gift|raid|cheer|clip] for mods, so the overlay can be checked in OBS any time.
const SAMPLES = {
  follow: { type: "follow" },
  sub: { type: "sub", tier: 1 },
  resub: { type: "resub", tier: 1, months: 6, message: "Up the Phantoms" },
  gift: { type: "gift", tier: 1, count: 5 },
  raid: { type: "raid", viewers: 42 },
  cheer: { type: "cheer", bits: 500, message: "What a strike" },
  clip: { type: "clip" },
};
export async function testAlert(kind, name) {
  const k = SAMPLES[kind] ? kind : "follow";
  await pushAlert({ ...SAMPLES[k], name, test: true });
  return `Test ${k} alert sent to the overlay.`;
}
