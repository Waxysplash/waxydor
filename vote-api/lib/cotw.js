// Clip of the Week: every clip made on the channel during a week (Monday to Sunday, Toronto time) is up for a vote
// on the Waxyclips page. One vote per Twitch account per week, followers only; voting again moves the vote.
// Ballots: Redis hash cotw:<week> (Twitch user ID -> clip ID). Winners are kept for good in cotw:winners (week -> clip).
import { redis, VoteError } from "./shared.js";
import { helix, ids } from "./bot.js";

const TZ = "America/Toronto";

// The Monday (YYYY-MM-DD, Toronto) that starts the week a moment falls in, and that Monday's 00:00 as a real instant.
function mondayOf(at) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(at).map((x) => [x.type, x.value]));
  const back = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day - back));
  return d.toISOString().slice(0, 10);
}
function midnight(day) {
  // Toronto midnight is 04:00 or 05:00 UTC; pick whichever lands on 00:00 local.
  for (const h of [4, 5]) {
    const t = new Date(`${day}T0${h}:00:00Z`);
    if (new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(t) === "00") return t;
  }
  return new Date(`${day}T05:00:00Z`);
}
const addDays = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export function week(at = new Date()) {
  const id = mondayOf(at);
  return { id, starts: midnight(id).toISOString(), ends: midnight(addDays(id, 7)).toISOString(), prev: addDays(id, -7) };
}

async function counts(id) {
  const n = {};
  for (const c of (await redis("HVALS", "cotw:" + id)) || []) n[c] = (n[c] || 0) + 1;
  return n;
}

// Most votes wins; a tie goes to the clip with more views.
function pick(clips, n) {
  return clips.filter((c) => n[c.id]).sort((a, b) => n[b.id] - n[a.id] || b.views - a.views)[0] || null;
}

// What the page and !cotw need: this week's clips with their votes, and last week's winner (settled once, then kept).
export async function state(clips, now = new Date()) {
  const w = week(now);
  const inWeek = (c, s, e) => Date.parse(c.at) >= Date.parse(s) && Date.parse(c.at) < Date.parse(e);
  const n = await counts(w.id);
  const nominees = clips.filter((c) => inWeek(c, w.starts, w.ends)).map((c) => ({ ...c, votes: n[c.id] || 0 }));
  let last = await redis("HGET", "cotw:winners", w.prev);
  if (last) last = JSON.parse(last);
  else {
    const p = week(new Date(Date.parse(w.starts) - 864e5));
    const lastN = await counts(p.id);
    const win = pick(clips.filter((c) => inWeek(c, p.starts, p.ends)), lastN);
    if (win) {
      last = { ...win, votes: lastN[win.id], week: p.id };
      await redis("HSET", "cotw:winners", p.id, JSON.stringify(last));
    }
  }
  return { week: w.id, ends: w.ends, nominees, winner: last || null };
}

export async function vote(user, clipId, clips) {
  const w = week();
  const nominee = clips.find((c) => c.id === clipId && Date.parse(c.at) >= Date.parse(w.starts) && Date.parse(c.at) < Date.parse(w.ends));
  if (!nominee) throw new VoteError(400, "clip", "That clip isn't up for this week's vote.");
  await redis("HSET", "cotw:" + w.id, user.id, clipId);
  await redis("EXPIRE", "cotw:" + w.id, 60 * 86400);   // ballots kept 60 days; the winner is kept for good
  return clipId;
}

export const myVote = (user) => redis("HGET", "cotw:" + week().id, user.id);

// The channel's Twitch clips from the last 90 days, newest first (the Waxyclips page and the vote both use this).
export async function channelClips() {
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
  return clips
    .map((c) => ({ id: c.id, url: c.url, title: c.title, by: c.creator_name, views: c.view_count, seconds: c.duration, at: c.created_at, thumb: c.thumbnail_url }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
