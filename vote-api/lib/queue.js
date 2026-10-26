// Pro Clubs viewer queue, run from Twitch chat by WaxyBot and shown on the site's queue page.
// The whole queue is one small JSON document in Redis, changed under a short lock so two
// commands arriving together can't overwrite each other. Rules live in config.queue.
import { redis } from "./shared.js";
import { pushAlert } from "./alerts.js";

const KEY = "queue:state";
const POSITIONS = ["GK", "CB", "LB", "RB", "LWB", "RWB", "CDM", "CM", "CAM", "LM", "RM", "LW", "RW", "CF", "ST", "ANY"];
const ALIAS = { STRIKER: "ST", KEEPER: "GK", GOALIE: "GK", DEF: "CB", MID: "CM", WINGER: "LW", FILL: "ANY", FLEX: "ANY" };

export const empty = () => ({ open: false, playing: [], waiting: [], updatedAt: null });

export async function load() {
  const s = await redis("GET", KEY);
  return s ? JSON.parse(s) : empty();
}

async function withLock(fn) {
  for (let i = 0; i < 20; i++) {
    if (await redis("SET", "queue:lock", "1", "NX", "PX", 4000)) {
      try {
        const s = await load();
        const out = await fn(s);
        s.updatedAt = new Date().toISOString();
        await redis("SET", KEY, JSON.stringify(s));
        return out;
      } finally { await redis("DEL", "queue:lock"); }
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return "The queue is busy, try again in a second.";
}

// s.waiting is kept in queue order. Subs (with sub priority on) go in behind the subs already at
// the front and ahead of everyone else; non-subs go to the back.
export const ordered = (s) => s.waiting;
function enqueue(s, rules, e) {
  const entry = { login: e.login, name: e.name, pos: e.pos || "ANY", note: e.note || "", sub: !!e.sub };
  let i = s.waiting.length;
  if (rules.subPriority && entry.sub) { i = 0; while (i < s.waiting.length && s.waiting[i].sub) i++; }
  s.waiting.splice(i, 0, entry);
}

export function publicView(s, rules) {
  return {
    open: s.open, updatedAt: s.updatedAt,
    playing: s.playing.map(({ login, name, pos, note, sub, left }) => ({ login, name, pos, note, sub, matchesLeft: left })),
    waiting: ordered(s, rules).map(({ login, name, pos, note, sub }) => ({ login, name, pos, note, sub })),
  };
}

const posOf = (t) => { const u = String(t || "").toUpperCase(); return POSITIONS.includes(u) ? u : ALIAS[u] || null; };
const turns = (rules, sub) => (sub ? rules.subMatchesPerTurn : rules.matchesPerTurn);
const where = (s, rules, login) => s.waiting.findIndex((e) => e.login === login) + 1;
const tag = (e) => `@${e.name}`;

// A viewer's first ever call-up from the queue is a signing: a HERE WE GO alert on stream and a line in chat with
// their player card. queue:signed remembers everyone signed, so it happens once per player, not once per night.
async function sign(called, rules) {
  const fresh = [];
  for (const e of called) {
    if (!(await redis("SADD", "queue:signed", e.login))) continue;
    const no = await redis("INCR", "queue:signings");
    await pushAlert({ type: "signing", name: e.name, pos: e.pos, no });
    fresh.push(e);
  }
  if (!fresh.length) return "";
  const card = (e) => `${(rules.siteUrl || "").replace(/\/?$/, "/")}card.html?p=${encodeURIComponent(e.login)}`;
  return ` 🖊️ HERE WE GO! ${fresh.map(tag).join(", ")} sign${fresh.length === 1 ? "s" : ""} for Waxys Phantoms.` +
    (fresh.length === 1 && rules.siteUrl ? ` Player card: ${card(fresh[0])}` : "");
}

export async function command(c, args, chatter, rules, isFollower) {
  const me = chatter.login.toLowerCase();
  const target = (args[0] || "").replace(/^@/, "").toLowerCase();

  switch (c) {
    case "!join": {
      if (rules.followersOnly && !chatter.mod && !(await isFollower(chatter.id))) return `@${chatter.name} follow the channel first, then !join again.`;
      if (await redis("GET", "queue:ban:" + me)) return `@${chatter.name} you're out of the queue for tonight.`;
      // Anything after !join is fine: it's kept as their note (Streamlabs-style), and a position in it is picked up.
      const note = args.join(" ").replace(/\s+/g, " ").trim().slice(0, 40);
      const pos = args.map(posOf).find(Boolean) || "ANY";
      return withLock((s) => {
        if (!s.open) return `@${chatter.name} the queue is closed right now.`;
        if (s.playing.some((e) => e.login === me)) return `@${chatter.name} you're on the pitch already.`;
        const old = s.waiting.find((e) => e.login === me);
        if (old) { Object.assign(old, { pos, note, sub: !!chatter.sub }); return `@${chatter.name} you're already in, #${where(s, rules, me)}${note ? ` (updated: ${note})` : ""}.`; }
        enqueue(s, rules, { login: me, name: chatter.name, pos, note, sub: chatter.sub });
        return `@${chatter.name} you're in the queue at #${where(s, rules, me)}${chatter.sub && rules.subPriority ? " · ⭐ sub priority" : ""}.`;
      });
    }
    case "!leave":
      return withLock((s) => {
        const before = s.waiting.length + s.playing.length;
        s.waiting = s.waiting.filter((e) => e.login !== me); s.playing = s.playing.filter((e) => e.login !== me);
        return before > s.waiting.length + s.playing.length ? `@${chatter.name} you've left the queue.` : `@${chatter.name} you weren't in the queue.`;
      });
    case "!queue": case "!q": case "!position": {
      const s = await load();
      if (!s.open && !s.waiting.length && !s.playing.length) return "The queue is closed. It opens on Pro Clubs streams: just type !join.";
      const list = ordered(s, rules);
      const mine = where(s, rules, me);
      const on = s.playing.some((e) => e.login === me);
      const next = list.slice(0, 5).map((e, i) => `${i + 1}. ${e.name}${e.sub ? "⭐" : ""}${e.pos && e.pos !== "ANY" ? ` (${e.pos})` : ""}`).join(" | ");
      return `${s.open ? "Queue OPEN" : "Queue closed"} · ${list.length} waiting${next ? ": " + next : ""}${on ? ` · @${chatter.name} you're playing now` : mine ? ` · @${chatter.name} you're #${mine}` : ""}`;
    }
  }

  // Everything below is for mods and the captain.
  if (!chatter.mod) return null;
  switch (c) {
    case "!qopen": return withLock((s) => { s.open = true; return "The Pro Clubs queue is OPEN! Type !join to get in (add your position if you like, e.g. !join ST). Followers only · subs get priority, 3 matches and first pick of position."; });
    case "!qclose": return withLock((s) => { s.open = false; return `Queue closed. ${s.waiting.length} still waiting stay in line for now.`; });
    case "!qclear": return withLock((s) => { Object.assign(s, { ...empty(), open: s.open }); return "Queue cleared."; });
    case "!next": case "!pick": case "!random": {
      // !next = first in line · !next 3 = the next three · !next CB = first who wants CB (or ANY; subs are first in line,
      // so they get first pick) · !pick @name = that person · !random = a random waiting player (Streamlabs-style).
      const count = /^\d+$/.test(args[0] || "") ? Math.min(+args[0], 11) : 1;
      const want = posOf(args[0]);
      return withLock(async (s) => {
        const called = [];
        for (let i = 0; i < count; i++) {
          const list = ordered(s, rules);
          const pick = c === "!pick" ? list.find((e) => e.login === target)
            : c === "!random" ? list[Math.floor(Math.random() * list.length)]
            : want ? list.find((e) => e.pos === want) || list.find((e) => e.pos === "ANY") : list[0];
          if (!pick) break;
          s.waiting = s.waiting.filter((e) => e !== pick);
          s.playing.push({ ...pick, pos: want || pick.pos, left: turns(rules, pick.sub), calledAt: Date.now() });
          called.push(pick);
        }
        if (!called.length) return c === "!pick" ? `${target || "That player"} isn't waiting in the queue.` : want ? `Nobody in the queue for ${want}.` : "Nobody waiting in the queue.";
        return `${called.map(tag).join(", ")} you're up! Watch for the Waxys Phantoms invite and accept it within ${rules.inviteMinutes} minutes.${called.length === 1 ? ` ${turns(rules, called[0].sub)} match${turns(rules, called[0].sub) === 1 ? "" : "es"}${called[0].note ? ` · ${called[0].note}` : ""}.` : ""}` +
          await sign(called, rules).catch((e) => { console.error("signing", e.message); return ""; });
      });
    }
    case "!remove":
      // Take someone out without a ban (left, wrong person, etc.).
      return withLock((s) => {
        const was = [...s.waiting, ...s.playing].find((x) => x.login === target);
        s.waiting = s.waiting.filter((x) => x.login !== target); s.playing = s.playing.filter((x) => x.login !== target);
        return was ? `${tag(was)} removed from the queue.` : `${target || "That player"} isn't in the queue.`;
      });
    case "!ft": case "!fulltime":
      // After each match: everyone from the queue on the pitch uses up a match. Turn over: back of the queue, unless nobody's waiting.
      return withLock((s) => {
        if (!s.playing.length) return "Nobody from the queue is on the pitch.";
        const done = [], stay = [];
        for (const e of s.playing) {
          e.left--;
          if (e.left > 0) continue;
          if (s.waiting.length) { done.push(e); enqueue(s, rules, e); }
          else { e.left = turns(rules, e.sub); stay.push(e); }
        }
        s.playing = s.playing.filter((e) => !done.includes(e));
        const parts = [];
        if (done.length) parts.push(`Turn over for ${done.map(tag).join(", ")}, back in the queue. Thanks for playing!`);
        if (stay.length) parts.push(`${stay.map(tag).join(", ")} stay on, nobody's waiting.`);
        if (done.length && s.waiting.length) parts.push(`${done.length} spot${done.length === 1 ? "" : "s"} open: !next to call up the next player.`);
        return parts.join(" ") || `Match counted. ${s.playing.map((e) => `${e.name} ${e.left} left`).join(", ")}`;
      });
    case "!back":
      // Undo a pick: off the pitch and back to the front of the queue, no penalty.
      return withLock((s) => {
        const e = s.playing.find((x) => x.login === target);
        if (!e) return `${target || "That player"} isn't on the pitch from the queue.`;
        s.playing = s.playing.filter((x) => x !== e);
        s.waiting.unshift({ login: e.login, name: e.name, pos: e.pos, note: e.note, sub: e.sub });
        return `${tag(e)} is back in the queue at #1.`;
      });
    case "!noshow":
      // Missed the invite: back into the queue, a few places down.
      return withLock((s) => {
        const e = s.playing.find((x) => x.login === target);
        if (!e) return `${target || "That player"} isn't on the pitch from the queue.`;
        s.playing = s.playing.filter((x) => x !== e);
        // Missed the invite: back in line behind the next noShowPenalty players, sub or not.
        s.waiting.splice(Math.min(rules.noShowPenalty, s.waiting.length), 0, { login: e.login, name: e.name, pos: e.pos, note: e.note, sub: e.sub });
        return `${tag(e)} missed the invite, back in the queue at #${where(s, rules, e.login)}. !next for the next player.`;
      });
    case "!kick":
      // Rage quit or no mic: out of the queue for the rest of the night.
      return withLock(async (s) => {
        const was = [...s.waiting, ...s.playing].find((x) => x.login === target);
        s.waiting = s.waiting.filter((x) => x.login !== target); s.playing = s.playing.filter((x) => x.login !== target);
        if (!target) return "Usage: !kick @name";
        await redis("SET", "queue:ban:" + target, "1", "EX", 12 * 3600);
        return `${was ? tag(was) : target} is out of the queue for tonight.`;
      });
  }
  return null;
}

// Twitch tells WaxyBot when the stream goes offline or online (stream.offline / stream.online). Going offline closes
// the queue like !qclose. A dropped stream that comes back within REOPEN_MINUTES gets its queue reopened, so a
// connection blip mid-match doesn't shut everyone out.
const REOPEN_MINUTES = 15;
export async function streamOffline() {
  return withLock(async (s) => {
    if (!s.open) return null;
    s.open = false;
    await redis("SET", "queue:autoclosed", "1", "EX", REOPEN_MINUTES * 60);
    return `Full time: the stream's over, so the queue is closed. ${s.waiting.length ? `${s.waiting.length} still waiting keep your place for next matchday.` : "See you next matchday."}`;
  });
}
export async function streamOnline() {
  if (!(await redis("GET", "queue:autoclosed"))) return null;
  await redis("DEL", "queue:autoclosed");
  return withLock((s) => { if (s.open) return null; s.open = true; return "We're back! The queue is open again, everyone kept their place. !join to get in."; });
}

export const QUEUE_COMMANDS = ["!join", "!leave", "!queue", "!q", "!position", "!qopen", "!qclose", "!qclear", "!next", "!pick", "!random", "!remove", "!back", "!ft", "!fulltime", "!noshow", "!kick"];
