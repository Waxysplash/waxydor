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
  const BREAKDOWN = ["goals", "assists", "cleanSheets", "saves", "tackles", "passes", "missedShots", "conceded"];

  function inSeason(season) {
    return (m) => new Date(m.date) >= new Date(season.start) && new Date(m.date) <= new Date(season.end);
  }

  function rank({ config, members, matches, snapshot, season }) {
    const C = config.index, P = C.points;
    const gname = (config.gaffer || "").toLowerCase();
    const seasonMatches = (matches || []).filter(inSeason(season));
    const baseBy = new Map(((snapshot && snapshot.members) || []).map((m) => [m.name, m]));
    const pts = (pos) => P[pos] || P.forward;

    const all = members.members.map((m) => {
      const b = baseBy.get(m.name) || {};
      const d = (k) => n(m[k]) - n(b[k]);
      const gp = d("gamesPlayed"), g = d("goals"), a = d("assists"), mom = d("manOfTheMatch");
      const passes = d("passesMade"), tackles = d("tacklesMade"), reds = d("redCards");
      const csEA = d("cleanSheetsDef") + d("cleanSheetsGK");

      // Every saved match is scored by the position played in it.
      const lines = seasonMatches.flatMap((x) => x.players.filter((p) => p.name === m.name).map((p) => ({ p, x })));
      const posCount = {};
      const L = { g: 0, a: 0, tk: 0, pm: 0, sh: 0, csDefGk: 0, wins: 0, rating: 0, pa: 0, ta: 0 };
      const br = Object.fromEntries(BREAKDOWN.map((k) => [k, 0]));
      for (const { p, x } of lines) {
        const pos = POSITIONS.includes(p.pos) ? p.pos : "forward", R = pts(pos);
        posCount[pos] = (posCount[pos] || 0) + 1;
        // EA's own clean-sheet field is blank, so a clean sheet is any match the team didn't concede.
        const cs = x.goalsAgainst === 0 ? 1 : 0;
        if (cs && (pos === "defender" || pos === "goalkeeper")) L.csDefGk++;
        L.g += n(p.goals); L.a += n(p.assists); L.tk += n(p.tacklesMade); L.pm += n(p.passesMade); L.sh += n(p.shots);
        L.wins += x.result === "W" ? 1 : 0; L.rating += n(p.rating); L.pa += n(p.passAttempts); L.ta += n(p.tackleAttempts);
        br.goals += n(p.goals) * R.goal;
        br.assists += n(p.assists) * R.assist;
        br.cleanSheets += cs * R.cleanSheet;
        br.saves += n(p.saves) * R.save;
        br.tackles += n(p.tacklesMade) * P.tackle;
        br.passes += n(p.passesMade) / P.passesPerPoint;
        br.missedShots += Math.max(0, n(p.shots) - n(p.goals)) * P.missedShot;
        br.conceded += Math.max(0, n(p.goalsConceded) - P.concededAllowance) * R.conceded;
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

      const form = seasonMatches.filter((x) => x.players.some((p) => p.name === m.name)).slice(0, 5).map((x) => x.result);
      return {
        name: m.name, pro: m.proName, pos, ovr: n(m.proOverall), gp, g, a, ga: g + a, mom, passes, tackles, reds,
        shots: totalShots, rating, shotPct, passPct, tacklePct, winPct, form, breakdown: br,
        points: Math.round(contribution * 10) / 10, ppg: gp ? contribution / gp : 0,
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
      gp: max((r) => r.gp), ppg: max((r) => r.ppg), rating: max((r) => r.rating), pass: max((r) => r.passPct),
      win: max((r) => r.winPct), mom: max((r) => r.mom / r.gp), shot: max((r) => r.shotPct), tackle: max((r) => r.tacklePct),
    };
    const clamp = (v) => Math.max(0, Math.min(1, v));
    const between = (v, lo, hi) => clamp((v - lo) / Math.max(hi - lo, 0.01));
    for (const r of all) {
      const share = {
        contribution: clamp(r.ppg / best.ppg),
        appearances: clamp(r.gp / best.gp),
        rating: between(r.rating, C.ratingFloor, best.rating),
        passAccuracy: between(r.passPct, C.passFloor, best.pass),
        winRate: clamp(r.winPct / best.win),
        motm: clamp((r.mom / r.gp) / best.mom),
        accuracy: (clamp(r.shotPct / best.shot) + clamp(r.tacklePct / best.tackle)) / 2,
      };
      r.parts = Object.fromEntries(FACTORS.map(([k]) => [k, Math.round(C.weights[k] * share[k] * 10) / 10]));
      r.penalty = r.reds * C.redCardPenalty;
      r.qualified = r.gp >= C.minGames;
      // Below compareMinGames there is too little to go on, so no index is shown at all.
      r.index = r.gp >= C.compareMinGames ? Math.max(0, Math.round(FACTORS.reduce((t, [k]) => t + C.weights[k] * share[k], 0) - r.penalty)) : null;
    }
    // Ties: index, then appearances, then contribution points. Players short of the minimum sit below, provisional.
    const order = (x, y) => ((y.index ?? -1) - (x.index ?? -1)) || (y.gp - x.gp) || (y.points - x.points);
    const ranked = rows.filter((r) => r.qualified).sort(order);
    const provisional = rows.filter((r) => !r.qualified).sort(order);
    return { rows: [...ranked, ...provisional], ranked, provisional, gaffer, seasonMatches };
  }

  const api = { rank, FACTORS, BREAKDOWN, POSITIONS, inSeason };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WaxyRanking = api;
})(typeof window !== "undefined" ? window : globalThis);
