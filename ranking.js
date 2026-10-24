// The Waxy d'Or ranking. One calculation shared by the site, the stream overlays and the chat-bot text
// (scripts/poll.mjs), so every surface shows the same numbers. The rules themselves live in data/config.json.
(function (root) {
  const n = (v) => +v || 0;
  const POSITIONS = ["forward", "midfielder", "defender", "goalkeeper"];
  const FACTORS = [
    ["contribution", "Contribution points per game", "Goals, assists, clean sheets, saves, tackles and passes, by position, minus missed shots and heavy defeats"],
    ["appearances", "Appearances", "Turning up"],
    ["rating", "Match rating", "EA's overall rating of the performance"],
    ["passAccuracy", "Pass accuracy", "Keeping the ball"],
    ["winRate", "Win rate", "Winning when on the pitch"],
    ["motm", "Man of the match per game", "Being the best player on the pitch"],
    ["accuracy", "Shot and tackle accuracy", "Finishing chances and winning tackles cleanly"],
  ];
  const BREAKDOWN = ["goals", "assists", "cleanSheets", "saves", "tackles", "passes", "missedShots", "bigMisses", "hatTricks", "conceded", "bigGames"];

  function inSeason(season) {
    return (m) => new Date(m.date) >= new Date(season.start) && new Date(m.date) <= new Date(season.end);
  }

  function rank({ config, members, matches, snapshot, season }) {
    // A season can keep its own point values (season.points), so a finished season isn't rescored when the rules change.
    const C = config.index, P = season.points || C.points;
    const gname = (config.gaffer || "").toLowerCase();
    const seasonMatches = (matches || []).filter(inSeason(season));
    const baseBy = new Map(((snapshot && snapshot.members) || []).map((m) => [m.name, m]));
    const pts = (pos) => P[pos] || P.forward;
    // Big games are picked by the captain (config.bigGames); everything a player does in one counts bigGameMultiplier times.
    const big = new Set((config.bigGames || []).map((b) => String(b.matchId)));
    // Big misses are logged by the captain after the stream (config.bigMisses), one entry per miss.
    const misses = new Map();
    for (const b of config.bigMisses || []) { const k = b.matchId + "|" + b.player; misses.set(k, (misses.get(k) || 0) + (b.count || 1)); }
    const posOf = (p) => POSITIONS.includes(p.pos) ? p.pos : "forward";
    // One match line, scored by the position played. bigExtra is what a big game adds on top.
    function scoreLine(p, x) {
      const pos = posOf(p), R = pts(pos);
      // EA's own clean-sheet field is blank, so a clean sheet is any match the team didn't concede.
      const cs = x.goalsAgainst === 0 ? 1 : 0;
      const got = {
        goals: n(p.goals) * R.goal,
        assists: n(p.assists) * R.assist,
        cleanSheets: cs * R.cleanSheet,
        saves: n(p.saves) * R.save,
        tackles: n(p.tacklesMade) * P.tackle,
        passes: n(p.passesMade) / P.passesPerPoint,
        missedShots: Math.max(0, n(p.shots) - n(p.goals)) * P.missedShot,
        bigMisses: (misses.get(x.matchId + "|" + p.name) || 0) * n(P.bigMiss),
        hatTricks: n(p.goals) >= 3 ? n(P.hatTrick) : 0,
        conceded: Math.max(0, n(p.goalsConceded) - P.concededAllowance) * R.conceded,
      };
      let total = 0;
      for (const k in got) total += got[k];
      const bigExtra = big.has(String(x.matchId)) || (C.playoffsAreBigGames && x.matchType === "playoffMatch") ? total * (C.bigGameMultiplier - 1) : 0;
      return { pos, cs, got, bigExtra };
    }

    // Position-relative seasons judge contribution, MOTM and rating against an average player in the same position,
    // so a midfielder isn't measured against a striker's goal tally. The average comes from every saved match up to
    // this season's end, pulled towards the all-position average by positionPrior matches so a thin position can't swing it.
    let base = null;
    if (season.positionRelative) {
      const sum = {}, tot = { k: 0, pts: 0, mom: 0, rating: 0 };
      for (const x of matches || []) {
        if (new Date(x.date) > new Date(season.end)) continue;
        for (const p of x.players) {
          const s = scoreLine(p, x), v = { k: 1, pts: Object.values(s.got).reduce((t, y) => t + y, 0) + s.bigExtra, mom: n(p.mom), rating: n(p.rating) };
          const a = sum[s.pos] = sum[s.pos] || { k: 0, pts: 0, mom: 0, rating: 0 };
          for (const k in v) { a[k] += v[k]; tot[k] += v[k]; }
        }
      }
      const K = C.positionPrior, avg = (a, k) => tot.k ? (a[k] + K * tot[k] / tot.k) / (a.k + K) : 0;
      base = { all: { pts: tot.k ? tot.pts / tot.k : 0, mom: tot.k ? tot.mom / tot.k : 0, rating: tot.k ? tot.rating / tot.k : 0 } };
      for (const pos of POSITIONS) {
        const a = sum[pos] || { k: 0, pts: 0, mom: 0, rating: 0 };
        base[pos] = { pts: avg(a, "pts"), mom: avg(a, "mom"), rating: avg(a, "rating"), matches: a.k };
      }
    }

    const all = members.members.map((m) => {
      // Every saved match is scored by the position played in it.
      const lines = seasonMatches.flatMap((x) => x.players.filter((p) => p.name === m.name).map((p) => ({ p, x })));
      let d;
      if (baseBy.has(m.name) || season.fromZero) {
        const b = baseBy.get(m.name) || {};
        d = (k) => n(m[k]) - n(b[k]);
      } else {
        // Missing from the start-of-season snapshot (new, or EA left them off the list that day), so EA's totals would
        // include earlier seasons. Their season is just their saved matches.
        const sum = (f) => lines.reduce((t, { p, x }) => t + f(p, x), 0);
        const fromLines = {
          gamesPlayed: lines.length, goals: sum((p) => n(p.goals)), assists: sum((p) => n(p.assists)), manOfTheMatch: sum((p) => n(p.mom)),
          passesMade: sum((p) => n(p.passesMade)), tacklesMade: sum((p) => n(p.tacklesMade)), redCards: sum((p) => n(p.redCards)),
          cleanSheetsDef: sum((p, x) => x.goalsAgainst === 0 && (p.pos === "defender" || p.pos === "goalkeeper") ? 1 : 0), cleanSheetsGK: 0,
        };
        d = (k) => fromLines[k] || 0;
      }
      const gp = d("gamesPlayed"), g = d("goals"), a = d("assists"), mom = d("manOfTheMatch");
      const passes = d("passesMade"), tackles = d("tacklesMade"), reds = d("redCards");
      const csEA = d("cleanSheetsDef") + d("cleanSheetsGK");
      const posCount = {};
      const L = { g: 0, a: 0, tk: 0, pm: 0, sh: 0, csDefGk: 0, wins: 0, rating: 0, pa: 0, ta: 0, sv: 0, gc: 0 };
      const br = Object.fromEntries(BREAKDOWN.map((k) => [k, 0]));
      const exp = { pts: 0, mom: 0, rating: 0 };
      for (const { p, x } of lines) {
        const { pos, cs, got, bigExtra } = scoreLine(p, x);
        posCount[pos] = (posCount[pos] || 0) + 1;
        if (cs && (pos === "defender" || pos === "goalkeeper")) L.csDefGk++;
        L.g += n(p.goals); L.a += n(p.assists); L.tk += n(p.tacklesMade); L.pm += n(p.passesMade); L.sh += n(p.shots);
        L.wins += x.result === "W" ? 1 : 0; L.rating += n(p.rating); L.pa += n(p.passAttempts); L.ta += n(p.tackleAttempts);
        if (pos === "goalkeeper") { L.sv += n(p.saves); L.gc += n(p.goalsConceded); }
        for (const k in got) br[k] += got[k];
        // The extra is shown on its own line so the breakdown says exactly what the big game added.
        br.bigGames += bigExtra;
        if (base) for (const k in exp) exp[k] += base[pos][k];
      }
      const pos = Object.entries(posCount).sort((x, y) => y[1] - x[1])[0]?.[0]
        || (POSITIONS.includes(m.favoritePosition) ? m.favoritePosition : "forward");
      const R = pts(pos);

      // Season 1 starts from zero, so EA's lifetime rates are the season's. Later seasons use saved matches.
      let rating = n(m.ratingAve), shotPct = n(m.shotSuccessRate), passPct = n(m.passSuccessRate),
        tacklePct = n(m.tackleSuccessRate), winPct = n(m.winRate);
      if (!season.fromZero && lines.length) {
        rating = +(L.rating / lines.length).toFixed(1);
        shotPct = L.sh ? Math.round(100 * L.g / L.sh) : 0;
        passPct = L.pa ? Math.round(100 * L.pm / L.pa) : 0;
        tacklePct = L.ta ? Math.round(100 * L.tk / L.ta) : 0;
        winPct = Math.round(100 * L.wins / lines.length);
      }

      // Games played before matches were saved only exist in EA's totals: score them at the main position.
      const rg = Math.max(0, g - L.g), ra = Math.max(0, a - L.a);
      const totalShots = season.fromZero && shotPct > 0 ? Math.max(L.sh, Math.round(g * 100 / shotPct)) : L.sh;
      const rMissed = Math.max(0, (totalShots - L.sh) - rg);
      br.goals += rg * R.goal;
      br.assists += ra * R.assist;
      if (pos === "defender" || pos === "goalkeeper") br.cleanSheets += Math.max(0, csEA - L.csDefGk) * R.cleanSheet;
      br.tackles += Math.max(0, tackles - L.tk) * P.tackle;
      br.passes += Math.max(0, passes - L.pm) / P.passesPerPoint;
      br.missedShots += rMissed * P.missedShot;
      for (const k of BREAKDOWN) br[k] = Math.round(br[k] * 100) / 100;
      const contribution = BREAKDOWN.reduce((t, k) => t + br[k], 0);

      // What the index compares. In a position-relative season each one is scaled by how this player did against an
      // average player in the positions they actually played (games without a saved match count at the main position),
      // then put back on the all-position scale, so the numbers still read as points per game, MOTM per game and a rating.
      let cmp = { ppg: gp ? contribution / gp : 0, mom: gp ? mom / gp : 0, rating };
      let vsPos = null;
      if (base && gp) {
        const rem = Math.max(0, gp - lines.length);
        for (const k in exp) exp[k] += rem * base[pos][k];
        const ratio = (v, e) => e > 0 ? v / e : 1;
        vsPos = { points: ratio(contribution, exp.pts), motm: ratio(mom, exp.mom), rating: rating - exp.rating / gp };
        cmp = { ppg: vsPos.points * base.all.pts, mom: vsPos.motm * base.all.mom, rating: base.all.rating + vsPos.rating };
      }

      const form = seasonMatches.filter((x) => x.players.some((p) => p.name === m.name)).slice(0, 5).map((x) => x.result);
      return {
        name: m.name, pro: m.proName, pos, ovr: n(m.proOverall), gp, g, a, ga: g + a, mom, passes, tackles, reds,
        shots: totalShots, rating, shotPct, passPct, tacklePct, winPct, form, breakdown: br, savePct: L.sv + L.gc ? Math.round(100 * L.sv / (L.sv + L.gc)) : null,
        points: Math.round(contribution * 10) / 10, ppg: gp ? contribution / gp : 0, cmp, vsPos,
        gaffer: m.name.toLowerCase() === gname,
      };
    }).filter((r) => r.gp > 0);

    const rows = all.filter((r) => !r.gaffer);
    const gaffer = all.find((r) => r.gaffer) || null;
    // Each factor is measured against the best regular (compareMinGames+ apps), so a one-game cameo can't set the bar.
    const q = rows.filter((r) => r.gp >= C.compareMinGames);
    const pool = q.length ? q : rows;
    const max = (f) => Math.max(...pool.map(f), 0.01);
    const best = {
      gp: max((r) => r.gp), ppg: max((r) => r.cmp.ppg), rating: max((r) => r.cmp.rating), pass: max((r) => r.passPct),
      win: max((r) => r.winPct), mom: max((r) => r.cmp.mom), shot: max((r) => r.shotPct), tackle: max((r) => r.tacklePct),
    };
    // A season can keep its own weights (season.weights), so a finished season isn't rescored when the rules change.
    const W = season.weights || C.weights;
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const between = (v, lo, hi) => clamp((v - lo) / Math.max(hi - lo, 0.01));
    for (const r of all) {
      const share = {
        contribution: clamp(r.cmp.ppg / best.ppg),
        appearances: clamp(r.gp / best.gp),
        rating: between(r.cmp.rating, C.ratingFloor, best.rating),
        // Accuracy only counts in full at passVolumeFull completed passes per game, so 2/2 can't beat 40/47.
        // A season can set the volume per position (season.passVolume), since defenders and keepers pass less by the nature of the job.
        passAccuracy: between(r.passPct, C.passFloor, best.pass) * clamp((r.passes / r.gp) / (season.passVolume ? season.passVolume[r.pos] : r.pos === "goalkeeper" ? C.passVolumeFullKeeper : C.passVolumeFull)),
        winRate: clamp(r.winPct / best.win),
        motm: clamp(r.cmp.mom / best.mom),
        // Keepers don't shoot or tackle, so in a season with keeperSaves their accuracy is save percentage instead.
        accuracy: season.keeperSaves && r.pos === "goalkeeper" && r.savePct != null
          ? between(r.savePct, season.keeperSaves.floor, season.keeperSaves.full)
          : (clamp(r.shotPct / best.shot) + clamp(r.tacklePct / best.tackle)) / 2,
      };
      r.parts = Object.fromEntries(FACTORS.map(([k]) => [k, Math.round(W[k] * share[k] * 10) / 10]));
      r.penalty = r.reds * C.redCardPenalty;
      r.qualified = r.gp >= C.minGames;
      // Below compareMinGames there is too little to go on, so no index is shown at all.
      r.index = r.gp >= C.compareMinGames ? Math.max(0, Math.round(FACTORS.reduce((t, [k]) => t + W[k] * share[k], 0) - r.penalty)) : null;
    }
    // Ties: index, then appearances, then contribution points. Players short of the minimum sit below, provisional.
    const order = (x, y) => ((y.index ?? -1) - (x.index ?? -1)) || (y.gp - x.gp) || (y.points - x.points);
    const ranked = rows.filter((r) => r.qualified).sort(order);
    const provisional = rows.filter((r) => !r.qualified).sort(order);
    return { rows: [...ranked, ...provisional], ranked, provisional, gaffer, seasonMatches, positionBase: base };
  }

  const api = { rank, FACTORS, BREAKDOWN, POSITIONS, inSeason };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WaxyRanking = api;
})(typeof window !== "undefined" ? window : globalThis);
