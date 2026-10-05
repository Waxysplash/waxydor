(async function () {
  const $ = (s) => document.querySelector(s);
  const bust = "?t=" + Math.floor(Date.now() / 60000);
  const load = (f) => fetch("data/" + f + bust).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [config, members, club, matchStore, awardsData] = await Promise.all([
    load("config.json"), load("members.json"), load("club.json"), load("matches.json"), load("awards.json"),
  ]);
  const now = new Date();
  const season = config.seasons.find((s) => new Date(s.start) <= now && now <= new Date(s.end)) || config.seasons.at(-1);
  let snapshot = { members: [] };
  try { snapshot = await load("snapshots/" + season.id + "-start.json"); } catch (e) {}
  const S = window.WAXY = { config, members, club, matches: matchStore.matches, awards: awardsData, season, snapshot };

  // ---------- season stats ----------
  const inSeason = (m) => new Date(m.date) >= new Date(season.start) && new Date(m.date) <= new Date(season.end);
  const seasonMatches = S.matches.filter(inSeason);
  const baseBy = new Map(snapshot.members.map((m) => [m.name, m]));
  const n = (v) => +v || 0;
  const isGaffer = (name) => (config.gaffer || "").toLowerCase() === String(name).toLowerCase();
  const allRows = members.members.map((m) => {
    const b = baseBy.get(m.name) || {};
    const gp = n(m.gamesPlayed) - n(b.gamesPlayed);
    const g = n(m.goals) - n(b.goals);
    const a = n(m.assists) - n(b.assists);
    const mom = n(m.manOfTheMatch) - n(b.manOfTheMatch);
    const passes = n(m.passesMade) - n(b.passesMade);
    const tackles = n(m.tacklesMade) - n(b.tacklesMade);
    const reds = n(m.redCards) - n(b.redCards);
    // Season 1 starts from zero, so EA's lifetime rates and average rating are the season's. Later seasons use captured matches.
    let rating = n(m.ratingAve), shotPct = n(m.shotSuccessRate), passPct = n(m.passSuccessRate), tacklePct = n(m.tackleSuccessRate);
    if (!season.fromZero) {
      const lines = seasonMatches.flatMap((x) => x.players.filter((p) => p.name === m.name));
      if (lines.length) {
        const sum = (k) => lines.reduce((t, p) => t + n(p[k]), 0);
        rating = +(sum("rating") / lines.length).toFixed(1);
        shotPct = sum("shots") ? Math.round(100 * sum("goals") / sum("shots")) : 0;
        passPct = sum("passAttempts") ? Math.round(100 * sum("passesMade") / sum("passAttempts")) : 0;
        tacklePct = sum("tackleAttempts") ? Math.round(100 * sum("tacklesMade") / sum("tackleAttempts")) : 0;
      }
    }
    const form = seasonMatches.filter((x) => x.players.some((p) => p.name === m.name)).slice(0, 5).map((x) => x.result);
    return { name: m.name, pro: m.proName, pos: m.favoritePosition, ovr: n(m.proOverall), gp, g, a, ga: g + a, mom, passes, tackles, reds, rating, shotPct, passPct, tacklePct, form, gaffer: isGaffer(m.name) };
  }).filter((r) => r.gp > 0);
  // The gaffer sits outside the Waxy d'Or race: shown, never ranked.
  const rows = allRows.filter((r) => !r.gaffer);
  const gaffer = allRows.find((r) => r.gaffer) || null;

  // Waxy index: weighted blend of rating, contributions per game and MOTM per game, scaled to 100 against the best in each.
  const q = rows.filter((r) => r.gp >= config.index.minGames);
  const maxR = Math.max(...q.map((r) => r.rating), 1);
  const maxC = Math.max(...q.map((r) => r.ga / r.gp), 0.01);
  const maxM = Math.max(...q.map((r) => r.mom / r.gp), 0.01);
  for (const r of allRows) {
    r.qualified = r.gp >= config.index.minGames;
    r.index = r.qualified
      ? Math.round(100 * (config.index.ratingWeight * (r.rating / maxR) + config.index.contributionWeight * ((r.ga / r.gp) / maxC) + config.index.momWeight * ((r.mom / r.gp) / maxM)))
      : null;
  }
  S.rows = rows;

  // ---------- header ----------
  const o = club.overall;
  $("#clubName").textContent = club.name;
  $("#record").innerHTML = [
    `<span class="pill">Division <b>${club.division || "–"}</b></span>`,
    `<span class="pill"><b>${o.wins}</b>W <b>${o.ties}</b>D <b>${o.losses}</b>L</span>`,
    `<span class="pill">GF <b>${o.goals}</b> GA <b>${o.goalsAgainst}</b></span>`,
    `<span class="pill">Skill <b>${o.skillRating}</b></span>`,
  ].join("");
  $("#seasonName").textContent = season.name;
  const po = new Date(season.playoffsStart), end = new Date(season.end);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const phase = now < po ? "League phase" : now <= end ? "Playoffs" : "Season over";
  $("#seasonPhase").textContent = `${phase} · playoffs ${fmt(po)} · season ends ${fmt(end)}`;
  const target = now < po ? po : end;
  const label = now < po ? "to playoffs" : now <= end ? "to final whistle" : "";
  function tick() {
    const ms = Math.max(0, target - new Date());
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60;
    $("#countdown").innerHTML = label ? `<div><b>${d}</b><span>days</span></div><div><b>${h}</b><span>hrs</span></div><div><b>${mi}</b><span>min</span></div><div class="lbl">${label}</div>` : "";
  }
  tick(); setInterval(tick, 30000);

  // ---------- tabs ----------
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll("section[id^=tab-]").forEach((s) => (s.hidden = s.id !== "tab-" + b.dataset.tab));
    try { localStorage.setItem("waxy.tab", b.dataset.tab); } catch (e) {}
  });
  try { const t = localStorage.getItem("waxy.tab"); const btn = t && document.querySelector(`#tabs [data-tab="${t}"]`); if (btn) btn.click(); } catch (e) {}

  // ---------- table ----------
  const cols = [
    ["#", null], ["Player", "name"], ["Apps", "gp"], ["G", "g"], ["A", "a"], ["G+A", "ga"], ["Rating", "rating"], ["MOTM", "mom"],
    ["Shot%", "shotPct"], ["Pass%", "passPct"], ["Tackle%", "tacklePct"], ["Passes", "passes"], ["Tackles", "tackles"], ["Form", null], ["Waxy index", "index"],
  ];
  let sortKey = "index", sortDir = -1;
  function renderTable() {
    const sorted = [...rows].sort((x, y) => {
      const ax = x[sortKey], ay = y[sortKey];
      if (ax == null && ay == null) return y.ga - x.ga; if (ax == null) return 1; if (ay == null) return -1;
      return typeof ax === "string" ? sortDir * ax.localeCompare(ay) : (sortDir * (ax - ay)) || (y.ga - x.ga);
    });
    $("#table").innerHTML = `<thead><tr>${cols.map(([h, k]) => `<th data-k="${k || ""}" class="${k === sortKey ? "sorted" : ""}${h === "Player" ? " name" : ""}">${h}${k === sortKey ? (sortDir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>` +
      `<tbody>${sorted.map((r, i) => `<tr class="${r.qualified ? "" : "unq"} rank-${i + 1}">
        <td>${i + 1}</td><td class="name">${r.name}<small>${r.pro || ""} · ${r.pos || ""} · ${r.ovr || ""} OVR</small></td>
        <td>${r.gp}</td><td>${r.g}</td><td>${r.a}</td><td><b>${r.ga}</b></td><td>${r.rating.toFixed(1)}</td><td>${r.mom}</td>
        <td>${r.shotPct}%</td><td>${r.passPct}%</td><td>${r.tacklePct}%</td><td>${r.passes}</td><td>${r.tackles}</td>
        <td><span class="form">${r.form.map((f) => `<i class="${f}">${f}</i>`).join("") || "–"}</span></td>
        <td>${r.index == null ? `<span class="idx" style="opacity:.5">–</span>` : `<span class="idx">${r.index}</span>`}</td>
      </tr>`).join("")}</tbody>` + (gaffer ? `<tbody class="gaffer"><tr class="sep"><td colspan="${cols.length}">The Gaffer's stats · not in the Waxy d'Or race</td></tr><tr>
        <td>–</td><td class="name">${gaffer.name}<small>${gaffer.pro || ""} · ${gaffer.pos || ""} · ${gaffer.ovr || ""} OVR</small></td>
        <td>${gaffer.gp}</td><td>${gaffer.g}</td><td>${gaffer.a}</td><td><b>${gaffer.ga}</b></td><td>${gaffer.rating.toFixed(1)}</td><td>${gaffer.mom}</td>
        <td>${gaffer.shotPct}%</td><td>${gaffer.passPct}%</td><td>${gaffer.tacklePct}%</td><td>${gaffer.passes}</td><td>${gaffer.tackles}</td>
        <td><span class="form">${gaffer.form.map((f) => `<i class="${f}">${f}</i>`).join("") || "–"}</span></td>
        <td>${gaffer.index == null ? `<span class="idx" style="opacity:.5">–</span>` : `<span class="idx">${gaffer.index}</span>`}</td></tr></tbody>` : "");
  }
  $("#table").addEventListener("click", (e) => {
    const th = e.target.closest("th"); if (!th || !th.dataset.k) return;
    if (sortKey === th.dataset.k) sortDir = -sortDir; else { sortKey = th.dataset.k; sortDir = th.dataset.k === "name" ? 1 : -1; }
    renderTable();
  });
  $("#tableNote").textContent = `Waxy index = ${Math.round(config.index.ratingWeight * 100)}% match rating, ${Math.round(config.index.contributionWeight * 100)}% goals + assists per game, ${Math.round(config.index.momWeight * 100)}% MOTM per game. Players need ${config.index.minGames} apps to qualify. Updated ${new Date(members.fetchedAt).toLocaleString()}.`;
  renderTable();

  // ---------- matches ----------
  const resColor = { W: "var(--win)", L: "var(--loss)", D: "var(--draw)" };
  $("#matches").innerHTML = seasonMatches.length ? seasonMatches.map((m, i) => `
    <div class="match" data-i="${i}">
      <div class="res" style="background:${resColor[m.result]}">${m.result}</div>
      <div><div class="opp">vs ${m.opponent}</div><div class="meta">${new Date(m.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${m.matchType === "playoffMatch" ? "Playoff" : "League"}</div></div>
      <div class="score">${m.goalsFor}–${m.goalsAgainst}</div>
    </div>
    <div class="lines" hidden>
      <div class="table-wrap"><table><thead><tr><th class="name">Player</th><th>Pos</th><th>G</th><th>A</th><th>Shots</th><th>Pass</th><th>Tackles</th><th>Rating</th><th>MOTM</th></tr></thead>
      <tbody>${[...m.players].sort((a, b) => b.rating - a.rating).map((p) => `<tr class="${isGaffer(p.name) ? "gaffer-line" : ""}"><td class="name">${p.name}${isGaffer(p.name) ? " <small style=\"display:inline;color:var(--accent-2)\">gaffer</small>" : ""}</td><td>${p.pos}</td><td>${p.goals}</td><td>${p.assists}</td><td>${p.shots}</td><td>${p.passesMade}/${p.passAttempts}</td><td>${p.tacklesMade}/${p.tackleAttempts}</td><td>${p.rating.toFixed(1)}</td><td>${p.mom ? "★" : ""}</td></tr>`).join("")}</tbody></table></div>
    </div>`).join("") : `<div class="note">No matches captured yet this season.</div>`;
  $("#matches").addEventListener("click", (e) => {
    const m = e.target.closest(".match"); if (!m) return;
    const l = m.nextElementSibling; l.hidden = !l.hidden;
  });

  // ---------- awards ----------
  const winners = awardsData.winners[season.id] || {};
  const best = (k) => { const c = rows.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k] || (b.index ?? 0) - (a.index ?? 0)); return c[0] ? `${c[0].name} <small style="color:var(--muted);font-size:13px">(${c[0][k]})</small>` : null; };
  $("#awardsTitle").textContent = `${season.name} awards`;
  $("#awards").innerHTML = awardsData.awards.map((a) => {
    const manual = winners[a.id];
    const live = a.auto ? best(a.auto) : null;
    const w = manual ? manual : live;
    const gold = a.id === "waxydor";
    return `<div class="award ${gold ? "gold" : ""}"><div class="t">${a.name}${a.auto && !manual && now <= end ? " · live" : ""}</div>
      <div class="w">${w || `<span class="pending">${a.manual ? "Decided at season end" : "No data yet"}</span>`}</div><div class="d">${a.description}</div></div>`;
  }).join("");
  const past = Object.entries(awardsData.winners).filter(([sid]) => sid !== season.id);
  if (past.length) {
    $("#hallCard").hidden = false;
    $("#hall").innerHTML = past.map(([sid, w]) => { const s = config.seasons.find((x) => x.id === sid); return `<div class="note"><b style="color:var(--text)">${s ? s.name : sid}</b> · ${awardsData.awards.filter((a) => w[a.id]).map((a) => `${a.name}: ${w[a.id]}`).join(" · ")}</div>`; }).join("");
  }

  // ---------- players ----------
  $("#players").innerHTML = [...(gaffer ? [gaffer] : []), ...[...rows].sort((a, b) => ((b.index ?? -1) - (a.index ?? -1)) || (b.ga - a.ga))].map((r) => `
    <div class="player ${r.gaffer ? "gaffer" : ""}"><div class="n">${r.name}${r.gaffer ? ` <span class="tag">The Gaffer</span>` : ""}</div><div class="p">${r.pro || ""} · ${r.pos || ""} · ${r.ovr || "–"} OVR${r.index != null ? ` · index ${r.index}` : ""}</div>
      <div class="grid"><div><b>${r.gp}</b><span>apps</span></div><div><b>${r.g}</b><span>goals</span></div><div><b>${r.a}</b><span>assists</span></div>
      <div><b>${r.rating.toFixed(1)}</b><span>rating</span></div><div><b>${r.mom}</b><span>MOTM</span></div><div><b>${r.passPct}%</b><span>pass</span></div></div></div>`).join("");

  $("#footer").textContent = `Stats from EA Sports FC Pro Clubs, refreshed every 20 minutes. ${S.matches.length} matches on record. Season windows and awards are set by the captain.`;
})();
