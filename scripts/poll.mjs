// Polls EA's Pro Clubs endpoint for Waxys Phantoms and merges into data/.
// Run: node scripts/poll.mjs   (writes data/members.json, data/club.json, data/matches.json, data/table.txt)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data");
const config = JSON.parse(readFileSync(join(DATA, "config.json"), "utf8"));
const { clubId, platform } = config;
const BASE = "https://proclubs.ea.com/api/fc";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "application/json",
  Referer: "https://www.ea.com/",
};

async function get(path) {
  const url = `${BASE}/${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(url, { headers: HEADERS });
    if (r.ok) return r.json();
    if (attempt === 3) throw new Error(`${r.status} ${url}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

function readJson(file, fallback) {
  const p = join(DATA, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback;
}
function writeJson(file, obj) {
  writeFileSync(join(DATA, file), JSON.stringify(obj, null, 2) + "\n");
}

const now = new Date().toISOString();

// 1. Member aggregate stats (all-time for the club this game cycle).
const members = await get(`members/stats?platform=${platform}&clubId=${clubId}`);
writeJson("members.json", { fetchedAt: now, ...members });

// 2. Club overall record.
const overall = (await get(`clubs/overallStats?platform=${platform}&clubIds=${clubId}`))[0];
const info = (await get(`clubs/info?platform=${platform}&clubIds=${clubId}`))[clubId];
// Current division only appears on the leaderboard search result.
let division = null;
try {
  const hits = await get(`allTimeLeaderboard/search?platform=${platform}&clubName=${encodeURIComponent(info.name)}`);
  division = hits.find((h) => String(h.clubId) === String(clubId))?.currentDivision ?? null;
} catch (e) { console.warn("division lookup failed:", e.message); }
writeJson("club.json", { fetchedAt: now, name: info.name, clubId, division, overall, kit: info.customKit });

// 3. Matches: league + playoff. EA keeps only the last ~10 per type, so merge by matchId.
const store = readJson("matches.json", { matches: [] });
const known = new Map(store.matches.map((m) => [m.matchId, m]));
let added = 0;
for (const matchType of ["leagueMatch", "playoffMatch"]) {
  const list = await get(`clubs/matches?platform=${platform}&clubIds=${clubId}&matchType=${matchType}&maxResultCount=100`);
  for (const m of list) {
    if (known.has(m.matchId)) continue;
    const us = m.clubs[clubId];
    const oppId = Object.keys(m.clubs).find((id) => id !== String(clubId));
    const opp = m.clubs[oppId];
    const players = Object.values(m.players[clubId] || {}).map((p) => ({
      name: p.playername,
      pos: p.pos,
      goals: +p.goals, assists: +p.assists, shots: +p.shots,
      passAttempts: +p.passattempts, passesMade: +p.passesmade,
      tackleAttempts: +p.tackleattempts, tacklesMade: +p.tacklesmade,
      rating: +p.rating, mom: +p.mom, redCards: +p.redcards,
      saves: +p.saves, goalsConceded: +p.goalsconceded,
      cleanSheet: +p.cleansheetsany, secondsPlayed: +p.secondsPlayed,
    }));
    known.set(m.matchId, {
      matchId: m.matchId,
      timestamp: +m.timestamp,
      date: new Date(m.timestamp * 1000).toISOString(),
      matchType,
      opponent: opp?.details?.name || oppId,
      opponentId: oppId,
      goalsFor: +us.goals, goalsAgainst: +us.goalsAgainst,
      result: us.wins === "1" ? "W" : us.losses === "1" ? "L" : "D",
      players,
    });
    added++;
  }
}
const matches = [...known.values()].sort((a, b) => b.timestamp - a.timestamp);
writeJson("matches.json", { updatedAt: now, matches });

// 4. Season boundary snapshots: when a season's start date passes and no snapshot exists, freeze the aggregate.
// Season tables are computed as (current aggregate) minus (snapshot at season start).
mkdirSync(join(DATA, "snapshots"), { recursive: true });
for (const s of config.seasons) {
  const snap = join(DATA, "snapshots", `${s.id}-start.json`);
  if (!existsSync(snap) && new Date(s.start) <= new Date()) {
    // First season of the cycle starts from zero; later seasons snapshot the current totals.
    const zero = s.fromZero ? { members: [] } : members;
    writeFileSync(snap, JSON.stringify({ takenAt: now, ...zero }, null, 2) + "\n");
  }
}

// 5. Chat-bot text (StreamElements/Nightbot $(urlfetch)).
const season = config.seasons.find((s) => new Date(s.start) <= new Date() && new Date() <= new Date(s.end)) || config.seasons.at(-1);
const snapFile = join(DATA, "snapshots", `${season.id}-start.json`);
const base = existsSync(snapFile) ? JSON.parse(readFileSync(snapFile, "utf8")).members : [];
const baseBy = new Map(base.map((m) => [m.name, m]));
const excluded = new Set((config.exclude || []).map((x) => x.toLowerCase()));
const rows = members.members.filter((m) => !excluded.has(m.name.toLowerCase())).map((m) => {
  const b = baseBy.get(m.name);
  const gp = +m.gamesPlayed - (b ? +b.gamesPlayed : 0);
  const g = +m.goals - (b ? +b.goals : 0);
  const a = +m.assists - (b ? +b.assists : 0);
  return { name: m.name, gp, g, a, rating: +m.ratingAve, mom: +m.manOfTheMatch - (b ? +b.manOfTheMatch : 0) };
}).filter((r) => r.gp > 0);
rows.sort((x, y) => (y.g + y.a) - (x.g + x.a) || y.rating - x.rating);
const top = rows.slice(0, 3).map((r, i) => `${i + 1}. ${r.name} ${r.g}G ${r.a}A (${r.gp} apps)`).join(" | ");
writeFileSync(join(DATA, "table.txt"), `${season.name} top 3: ${top} — full table: ${config.siteUrl}\n`);

console.log(`members=${members.members.length} matches=${matches.length} (+${added}) season=${season.id}`);
