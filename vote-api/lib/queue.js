// Pro Clubs viewer queue, run from Twitch chat by WaxyBot and shown on the site's queue page.
// The whole queue is one small JSON document in Redis, changed under a short lock so two
// commands arriving together can't overwrite each other. Rules live in config.queue.
import { redis } from "./shared.js";

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
  const entry = { login: e.login, name: e.name, pos: e.pos, sub: !!e.sub };
  let i = s.waiting.length;
  if (rules.subPriority && entry.sub) { i = 0; while (i < s.waiting.length && s.waiting[i].sub) i++; }
  s.waiting.splice(i, 0, entry);
}

export function publicView(s, rules) {
  return {
    open: s.open, updatedAt: s.updatedAt,
    playing: s.playing.map(({ name, pos, sub, left }) => ({ name, pos, sub, matchesLeft: left })),
    waiting: ordered(s, rules).map(({ name, pos, sub }) => ({ name, pos, sub })),
  };
}

const posOf = (t) => { const u = String(t || "").toUpperCase(); return POSITIONS.includes(u) ? u : ALIAS[u] || null; };
const turns = (rules, sub) => (sub ? rules.subMatchesPerTurn : rules.matchesPerTurn);
const where = (s, rules, login) => s.waiting.findIndex((e) => e.login === login) + 1;
const tag = (e) => `@${e.name}`;

export async function command(c, args, chatter, rules, isFollower) {
  const me = chatter.login.toLowerCase();
  const target = (args[0] || "").replace(/^@/, "").toLowerCase();

  switch (c) {
    case "!join": {
      if (rules.followersOnly && !chatter.mod && !(await isFollower(chatter.id))) return `@${chatter.name} follow the channel first, then !join again.`;
      if (await redis("GET", "queue:ban:" + me)) return `@${chatter.name} you're out of the queue for tonight.`;
      // "!join ST": the position is all they type; who they are comes from the Twitch message itself.
      const pos = args.map(posOf).find(Boolean);
      if (!pos) return `@${chatter.name} ${args.length ? `"${args.join(" ").slice(0, 20)}" isn't a position. ` : ""}Type !join and your position, e.g. !join ST (GK CB LB RB CDM CM CAM LM RM LW RW ST, or ANY).`;
      return withLock((s) => {
        if (!s.open) return "The queue is closed right now.";
        if (s.playing.some((e) => e.login === me)) return `@${chatter.name} you're on the pitch already.`;
        const old = s.waiting.find((e) => e.login === me);
        if (old) { Object.assign(old, { pos, sub: !!chatter.sub }); return `@${chatter.name} position changed to ${pos}, you're #${where(s, rules, me)} in the queue.`; }
        enqueue(s, rules, { login: me, name: chatter.name, pos, sub: chatter.sub });
        return `@${chatter.name} you're in at #${where(s, rules, me)} (${pos})${chatter.sub && rules.subPriority ? " · ⭐ sub priority" : ""}.`;
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
      if (!s.open && !s.waiting.length && !s.playing.length) return "The queue is closed. It opens on Pro Clubs streams: !join <position>, e.g. !join ST.";
      const list = ordered(s, rules);
      const mine = where(s, rules, me);
      const on = s.playing.some((e) => e.login === me);
      const next = list.slice(0, 5).map((e, i) => `${i + 1}. ${e.name}${e.sub ? "⭐" : ""} (${e.pos})`).join(" | ");
      return `${s.open ? "Queue OPEN" : "Queue closed"} · ${list.length} waiting${next ? ": " + next : ""}${on ? ` · @${chatter.name} you're playing now` : mine ? ` · @${chatter.name} you're #${mine}` : ""}`;
    }
  }

  // Everything below is for mods and the captain.
  if (!chatter.mod) return null;
  switch (c) {
    case "!qopen": return withLock((s) => { s.open = true; return "The Pro Clubs queue is OPEN! Type !join and your position to get in, e.g. !join ST. Followers only · subs get priority, 3 matches and first pick of position."; });
    case "!qclose": return withLock((s) => { s.open = false; return `Queue closed. ${s.waiting.length} still waiting stay in line for now.`; });
    case "!qclear": return withLock((s) => { Object.assign(s, { ...empty(), open: s.open }); return "Queue cleared."; });
    case "!next": {
      // "!next" takes the first in line; "!next CB" takes the first who wants CB (or ANY). Subs are first in line, so they get first pick.
      const want = posOf(args[0]);
      return withLock((s) => {
        const list = ordered(s, rules);
        const pick = want ? list.find((e) => e.pos === want) || list.find((e) => e.pos === "ANY") : list[0];
        if (!pick) return want ? `Nobody in the queue for ${want}.` : "Nobody waiting in the queue.";
        s.waiting = s.waiting.filter((e) => e !== pick);
        s.playing.push({ ...pick, left: turns(rules, pick.sub), calledAt: Date.now() });
        return `${tag(pick)} you're up at ${want || pick.pos}! Watch for the Waxys Phantoms invite and accept it within ${rules.inviteMinutes} minutes · ${turns(rules, pick.sub)} match${turns(rules, pick.sub) === 1 ? "" : "es"}.`;
      });
    }
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
    case "!noshow":
      // Missed the invite: back into the queue, a few places down.
      return withLock((s) => {
        const e = s.playing.find((x) => x.login === target);
        if (!e) return `${target || "That player"} isn't on the pitch from the queue.`;
        s.playing = s.playing.filter((x) => x !== e);
        // Missed the invite: back in line behind the next noShowPenalty players, sub or not.
        s.waiting.splice(Math.min(rules.noShowPenalty, s.waiting.length), 0, { login: e.login, name: e.name, pos: e.pos, sub: e.sub });
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

export const QUEUE_COMMANDS = ["!join", "!leave", "!queue", "!q", "!position", "!qopen", "!qclose", "!qclear", "!next", "!ft", "!fulltime", "!noshow", "!kick"];
