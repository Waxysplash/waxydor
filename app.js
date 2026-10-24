(async function () {
  const $ = (s) => document.querySelector(s);
  const bust = "?t=" + Math.floor(Date.now() / 60000);
// On waxysplash.com the stats come straight from GitHub, so the 20-minute poll never needs a redeploy.
  const DATA = /(^|\.)github\.io$|^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "data/" : "https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/";
  const load = (f) => fetch(DATA + f + bust).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
  const [config, members, club, matchStore, awardsData] = await Promise.all([
    load("config.json"), load("members.json"), load("club.json"), load("matches.json"), load("awards.json"),
  ]);
  const now = new Date();
  const season = config.seasons.find((s) => new Date(s.start) <= now && now <= new Date(s.end)) || config.seasons.at(-1);
  let snapshot = { members: [] };
  try { snapshot = await load("snapshots/" + season.id + "-start.json"); } catch (e) {}
  const S = window.WAXY = { config, members, club, matches: matchStore.matches, awards: awardsData, season, snapshot };

  // ---------- season stats ----------
  // The ranking itself lives in ranking.js, shared with the overlays and the chat-bot text.
  const isGaffer = (name) => (config.gaffer || "").toLowerCase() === String(name).toLowerCase();
  const R = WaxyRanking.rank({ config, members, matches: S.matches, snapshot, season });
  const seasonMatches = R.seasonMatches;
  const rows = R.rows;
  const gaffer = R.gaffer;
  S.rows = rows;
  const C = config.index;
  const posShort = { forward: "FWD", midfielder: "MID", defender: "DEF", goalkeeper: "GK" };
  const fmt1 = (v) => (Math.round(v * 10) / 10).toString();

  // ---------- header ----------
  const o = club.overall;
  $("#clubName").textContent = club.name;
  $("#record").innerHTML = [
    `<span class="pill">Division <b>${club.division || "–"}</b></span>`,
    `<span class="pill">Skill <b>${o.skillRating}</b></span>`,
  ].join("");

  // ---------- season record ----------
  const n = (v) => +v || 0;
  // EA's club totals run for the whole game cycle; a later season subtracts the totals frozen at its start.
  const cb = (snapshot.club && snapshot.club.overall) || {};
  const sd = (k) => n(o[k]) - n(cb[k]);
  const W = sd("wins"), D = sd("ties"), Lo = sd("losses"), GF = sd("goals"), GA = sd("goalsAgainst"), PR = sd("promotions"), RL = sd("relegations");
  const GP = W + D + Lo, gd = GF - GA;
  const streak = n(o.wstreak) ? `W${n(o.wstreak)}` : n(o.unbeatenstreak) ? `${n(o.unbeatenstreak)} unbeaten` : "–";
  const last10 = R.seasonMatches.slice(0, 10).map((m) => `<i class="${m.result}">${m.result}</i>`).join("");
  const mins = Math.max(0, Math.round((now - new Date(club.fetchedAt)) / 6e4));
  $("#seasonRecord").innerHTML = `
    <div class="sr-head"><h3>${season.name} record</h3><span>Updated ${mins < 1 ? "just now" : mins < 60 ? mins + " min ago" : new Date(club.fetchedAt).toLocaleString()}</span></div>
    <div class="sr-grid">
      <div><b>Div ${club.division || "–"}</b><span>${PR} promotion${PR === 1 ? "" : "s"} · ${RL} relegation${RL === 1 ? "" : "s"}</span></div>
      <div><b>${W}-${D}-${Lo}</b><span>W-D-L · ${GP} played · ${GP ? Math.round(100 * W / GP) : 0}% won</span></div>
      <div><b>${GF}–${GA}</b><span>goals · ${gd > 0 ? "+" : ""}${gd} difference</span></div>
      <div><b>${streak}</b><span>current streak${n(o.unbeatenstreak) > n(o.wstreak) && n(o.wstreak) ? ` · ${n(o.unbeatenstreak)} unbeaten` : ""}</span></div>
      <div><b>${o.skillRating}</b><span>skill rating</span></div>
    </div>
    ${last10 ? `<div class="sr-form"><span>Last ${Math.min(10, R.seasonMatches.length)}</span><span class="form">${last10}</span></div>` : ""}`;

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
    ["#", null], ["Player", "name"], ["Pos", "pos"], ["Apps", "gp"], ["G", "g"], ["A", "a"], ["Rating", "rating"], ["MOTM", "mom"],
    ["Win%", "winPct"], ["Pass%", "passPct"], ["Passes", "passes"], ["Shot%", "shotPct"], ["Tackle%", "tacklePct"], ["Tackles", "tackles"],
    ["Pts/game", "ppg"], ["Form", null], ["Waxy index", "index"],
  ];
  let sortKey = "index", sortDir = -1;
  const idxCell = (r) => r.index == null ? `<span class="idx" style="opacity:.5">–</span>`
    : `<span class="idx${r.qualified || r.gaffer ? "" : " prov"}" title="${r.qualified || r.gaffer ? "" : "Provisional: needs " + C.minGames + " apps"}">${r.index}</span>`;
  const breakdownHtml = (r) => {
    const parts = WaxyRanking.FACTORS.map(([k, label]) => `<span><b>${fmt1(r.parts[k])}</b>/${C.weights[k]} ${label}</span>`).join("");
    const b = r.breakdown, lbl = { goals: "goals", assists: "assists", cleanSheets: "clean sheets", saves: "saves", tackles: "tackles", passes: "passes", missedShots: "missed shots", bigMisses: "big misses", hatTricks: "hat-tricks", conceded: "goals conceded", bigGames: "big-game bonus" };
    const pts = WaxyRanking.BREAKDOWN.filter((k) => b[k]).map((k) => `${b[k] > 0 ? "+" : ""}${fmt1(b[k])} ${lbl[k]}`).join(" · ");
    const left = C.minGames - r.gp;
    const status = r.gaffer ? "The gaffer · not in the race" : r.qualified ? "Qualified" : `Provisional · ${left} more app${left === 1 ? "" : "s"} to qualify`;
    const v = r.vsPos;
    const vs = v ? `<div class="bd-pts">Against an average player in the same position: <b>${v.points.toFixed(2)}×</b> the contribution points, <b>${v.motm.toFixed(2)}×</b> the MOTMs, match rating <b>${v.rating >= 0 ? "+" : "−"}${Math.abs(v.rating).toFixed(2)}</b></div>` : "";
    return `<div class="bd-parts">${parts}${r.penalty ? `<span class="neg"><b>−${r.penalty}</b> red cards</span>` : ""}</div>
      <div class="bd-pts"><b>${fmt1(r.points)} contribution points</b> in ${r.gp} apps (${fmt1(r.ppg)} per game, main position ${r.pos}): ${pts || "none yet"}</div>${vs}
      <div class="bd-st">${status}${r.index != null ? ` · index ${r.index}` : ` · index shown from ${C.compareMinGames} apps`}</div>`;
  };
  const rowHtml = (r, i) => `<tr class="${r.qualified || r.gaffer ? "" : "unq"} rank-${i} prow">
        <td>${i}</td><td class="name">${r.name}<small>${r.pro || ""} · ${r.ovr || ""} OVR</small></td><td>${posShort[r.pos] || ""}</td>
        <td>${r.gp}</td><td>${r.g}</td><td>${r.a}</td><td>${r.rating.toFixed(1)}</td><td>${r.mom}</td>
        <td>${r.winPct}%</td><td>${r.passPct}%</td><td>${r.passes}</td><td>${r.shotPct}%</td><td>${r.tacklePct}%</td><td>${r.tackles}</td>
        <td>${fmt1(r.ppg)}</td><td><span class="form">${r.form.map((f) => `<i class="${f}">${f}</i>`).join("") || "–"}</span></td>
        <td>${idxCell(r)}</td></tr>
      <tr class="bd" hidden><td colspan="${cols.length}">${breakdownHtml(r)}</td></tr>`;
  function renderTable() {
    const byIndex = sortKey === "index" && sortDir < 0;
    const sorted = byIndex ? rows : [...rows].sort((x, y) => {
      const ax = x[sortKey], ay = y[sortKey];
      if (ax == null && ay == null) return y.points - x.points; if (ax == null) return 1; if (ay == null) return -1;
      return typeof ax === "string" ? sortDir * ax.localeCompare(ay) : (sortDir * (ax - ay)) || (y.points - x.points);
    });
    const firstProv = byIndex ? sorted.findIndex((r) => !r.qualified) : -1;
    $("#table").innerHTML = `<thead><tr>${cols.map(([h, k]) => `<th data-k="${k || ""}" class="${k === sortKey ? "sorted" : ""}${h === "Player" ? " name" : ""}">${h}${k === sortKey ? (sortDir < 0 ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>` +
      `<tbody>${sorted.map((r, i) => (i === firstProv ? `<tr class="sep"><td colspan="${cols.length}">Not qualified yet · fewer than ${C.minGames} apps</td></tr>` : "") + rowHtml(r, i + 1)).join("")}</tbody>` +
      (gaffer ? `<tbody class="gaffer"><tr class="sep"><td colspan="${cols.length}">The Gaffer's stats · not in the Waxy d'Or race</td></tr>${rowHtml(gaffer, "–")}</tbody>` : "");
  }
  $("#table").addEventListener("click", (e) => {
    const th = e.target.closest("th");
    if (th) {
      if (!th.dataset.k) return;
      if (sortKey === th.dataset.k) sortDir = -sortDir; else { sortKey = th.dataset.k; sortDir = th.dataset.k === "name" || th.dataset.k === "pos" ? 1 : -1; }
      return renderTable();
    }
    const tr = e.target.closest("tr.prow"); if (!tr) return;
    const bd = tr.nextElementSibling; bd.hidden = !bd.hidden; tr.classList.toggle("open", !bd.hidden);
  });
  $("#tableNote").innerHTML = `Ranked by the Waxy index: ${WaxyRanking.FACTORS.map(([k, label]) => `${label.toLowerCase()} ${C.weights[k]}`).join(", ")}. ${C.minGames} apps to qualify. <b>Tap a player</b> to see exactly where their index comes from, or read <a href="#" data-goto="rules">how it works</a>. Updated ${new Date(members.fetchedAt).toLocaleString()}.`;
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-goto]"); if (!a) return; e.preventDefault(); document.querySelector(`#tabs [data-tab="${a.dataset.goto}"]`).click(); window.scrollTo(0, 0); });
  renderTable();

  // ---------- rules ----------
  // Written from data/config.json, so the page always states the rules the table actually uses.
  const P = C.points, POS = WaxyRanking.POSITIONS, posName = { forward: "Forward", midfielder: "Midfielder", defender: "Defender", goalkeeper: "Keeper" };
  const cell = (v) => v ? `${v > 0 ? "+" : "−"}${Math.abs(v)}` : "–";
  const ptRow = (label, f) => `<tr><td class="name">${label}</td>${POS.map((p) => `<td>${cell(f(p))}</td>`).join("")}</tr>`;
  const rest = 100 - C.weights.contribution;
  $("#rules").innerHTML = `
    <div class="card"><h3>How the Waxy d'Or works</h3>
      <p class="lead">The Waxy d'Or is the Waxys Phantoms player of the season. The table ranks the squad by the <b>Waxy index</b>, a score out of 100 built from every stat EA records, so the best all-round player rises to the top, not just the top scorer. ${rest} of the 100 points have nothing to do with goals.</p>
      <ul class="rules">
        <li><b>Who's in the race:</b> every Waxys Phantoms player in an EA league or playoff match this season. The gaffer (${config.gaffer}) is shown with full stats but isn't ranked and can't win awards.</li>
        <li><b>To qualify:</b> ${C.minGames} appearances. Players on ${C.compareMinGames} to ${C.minGames - 1} apps get a provisional index, shown in grey below the qualified players. Under ${C.compareMinGames} apps there's too little to go on, so no index is shown.</li>
        <li><b>Where the stats come from:</b> straight from EA Pro Clubs. Nobody types anything in and nobody can edit a stat. The site checks EA every 20 minutes and saves every match.</li>
        <li><b>Season:</b> ${season.name}. Playoffs from ${fmt(new Date(season.playoffsStart))}, final whistle ${fmt(new Date(season.end))}.</li>
      </ul>
    </div>
    <div class="card"><h3>The Waxy index, out of 100</h3>
      <div class="note">In order of weight. In each factor, the best regular (${C.compareMinGames}+ apps) gets the full points and everyone else gets their share of it.${season.positionRelative ? ` <b>Every position can win it:</b> contribution points, man of the match and match rating are judged against an average player in the same position, so a defender who outdoes the other defenders scores as well as a striker who outdoes the other strikers. The averages come from every match the club has saved, and each match counts by the position played in it.` : ""}</div>
      <div class="table-wrap"><table class="rules-t"><thead><tr><th>#</th><th class="name">Factor</th><th>Points</th><th class="name">What it rewards</th></tr></thead><tbody>
        ${WaxyRanking.FACTORS.map(([k, label, what], i) => `<tr><td>${i + 1}</td><td class="name">${label}</td><td><b>${C.weights[k]}</b></td><td class="name wrap">${what}${k === "rating" ? ` (scored from ${C.ratingFloor.toFixed(1)} up to the best)` : k === "passAccuracy" ? ` (scored from ${C.passFloor}% up to the best, in full at ${season.passVolume ? POS.map((p, i) => `${season.passVolume[p]}+${i ? "" : " completed passes per game"} for ${posName[p].toLowerCase()}s`).join(", ") : `${C.passVolumeFull}+ completed passes per game, ${C.passVolumeFullKeeper}+ for keepers`}, and less below that)` : k === "accuracy" ? (season.keeperSaves ? ` (half each; keepers are scored on save percentage instead, from ${season.keeperSaves.floor}% up to ${season.keeperSaves.full}%)` : " (half each)") : ""}</td></tr>`).join("")}
        <tr><td>–</td><td class="name">Red cards</td><td><b>−${C.redCardPenalty}</b></td><td class="name wrap">Each one taken off the total</td></tr>
      </tbody></table></div>
    </div>
    <div class="card"><h3>Contribution points, per match</h3>
      <div class="note">Each match is scored by the position played in that match. If a midfielder plays up front one game, the goals from that game count as a forward's.</div>
      <div class="table-wrap"><table class="rules-t"><thead><tr><th class="name">Action</th>${POS.map((p) => `<th>${posName[p]}</th>`).join("")}</tr></thead><tbody>
        ${ptRow("Goal", (p) => P[p].goal)}
        ${ptRow("Assist", (p) => P[p].assist)}
        ${ptRow("Clean sheet", (p) => P[p].cleanSheet)}
        ${ptRow("Save", (p) => P[p].save)}
        ${ptRow("Tackle won", () => P.tackle)}
        ${ptRow(`Every ${P.passesPerPoint} passes completed`, () => 1)}
        ${ptRow("Shot that doesn't score", () => P.missedShot)}
        ${P.bigMiss ? ptRow("Big miss", () => P.bigMiss) : ""}
        ${P.hatTrick ? ptRow("Hat-trick bonus (on top of the goals)", () => P.hatTrick) : ""}
        ${ptRow(`Each goal conceded past ${P.concededAllowance} in a game`, (p) => P[p].conceded)}
      </tbody></table></div>
      <ul class="rules">
        <li><b>Big games:</b> the captain marks the games that mattered most, like promotion deciders${C.playoffsAreBigGames ? ", and every EA playoff match is a big game automatically" : ""}. Everything in a big game counts <b>${C.bigGameMultiplier}×</b>: goals, assists, clean sheets, saves, tackles and passes, and missed shots and heavy defeats count ${C.bigGameMultiplier}× against you too. Big games have a ★ in the match log.</li>
        <li><b>Clean sheet:</b> a match where the team conceded nothing. EA's own clean-sheet count is unreliable, so it's taken from the score.</li>
        <li><b>Missed shots</b> cost a little so random shots hurt, but a goal is worth far more than a miss costs. Shoot when it's on.</li>
        ${P.bigMiss ? `<li><b>Big misses:</b> the sitters, the open goals. EA doesn't record them, so the captain logs them after each stream and each one costs ${Math.abs(P.bigMiss)}.</li>` : ""}
        ${P.hatTrick ? `<li><b>Hat-trick:</b> three or more goals in a match earns a ${P.hatTrick}-point bonus on top of the goals, at any position.</li>` : ""}
        <li><b>Positions:</b> EA records four: forward, midfielder, defender and keeper. ST and LW are both forward; CAM and CDM are both midfielder.</li>
        <li><b>Games before matches were saved</b> (before 2 October 2026) only exist in EA's season totals. They're scored at the player's main position, the one played most in saved matches. Saves and goals conceded aren't in EA's totals, so those count from saved matches only.</li>
      </ul>
    </div>
    <div class="card"><h3>Ties and awards</h3>
      <ul class="rules">
        <li><b>Ties:</b> on the same index, more appearances ranks higher. Still level, more contribution points.</li>
        <li><b>Waxy d'Or (player of the season):</b> the top five qualified players on the index make the shortlist. Fans vote 5-3-1 on the <a href="vote.html">fan vote page</a>: log in with Twitch, one ballot per account${config.fanVote && config.fanVote.followersOnly ? ", followers only" : ""}. The captain picks the winner with the stats and the fan vote in front of him. The captain's call is final.</li>
        <li><b>Fans' Player of the Season:</b> the fan vote winner, even if the captain picks someone else.</li>
        <li><b>Automatic awards on season totals:</b> Golden Boot (goals), Playmaker (assists), Mr. Reliable (MOTM), Iron Man (appearances).</li>
        <li><b>In chat:</b> <code>!table</code> shows the top three by the Waxy index, the same as this page.</li>
      </ul>
    </div>`;

  // ---------- matches ----------
  const bigBy = new Map((config.bigGames || []).map((b) => [String(b.matchId), b.label || ""]));
  const resColor = { W: "var(--win)", L: "var(--loss)", D: "var(--draw)" };
  $("#matches").innerHTML = seasonMatches.length ? seasonMatches.map((m, i) => `
    <div class="match" data-i="${i}">
      <div class="res" style="background:${resColor[m.result]}">${m.result}</div>
      <div><div class="opp">vs ${m.opponent}</div><div class="meta">${bigBy.has(String(m.matchId)) || (C.playoffsAreBigGames && m.matchType === "playoffMatch") ? `<span class="big">★ Big game${bigBy.get(String(m.matchId)) ? " · " + bigBy.get(String(m.matchId)) : m.matchType === "playoffMatch" ? " · Playoff" : ""}</span> ` : ""}${new Date(m.date).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${m.matchType === "playoffMatch" ? "Playoff" : "League"}</div></div>
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
  $("#players").innerHTML = [...(gaffer ? [gaffer] : []), ...rows].map((r) => `
    <div class="player ${r.gaffer ? "gaffer" : ""}"><div class="n">${r.name}${r.gaffer ? ` <span class="tag">The Gaffer</span>` : ""}</div><div class="p">${r.pro || ""} · ${r.pos} · ${r.ovr || "–"} OVR${r.index != null ? ` · index ${r.index}${r.qualified || r.gaffer ? "" : " (provisional)"}` : ""}</div>
      <div class="grid"><div><b>${r.gp}</b><span>apps</span></div><div><b>${r.g}</b><span>goals</span></div><div><b>${r.a}</b><span>assists</span></div>
      <div><b>${r.rating.toFixed(1)}</b><span>rating</span></div><div><b>${r.passPct}%</b><span>pass</span></div><div><b>${r.winPct}%</b><span>win</span></div></div>
      <div class="bars">${WaxyRanking.FACTORS.map(([k, label]) => `<div class="bar"><span>${label.replace(" per game", "")}</span><i><s style="width:${100 * r.parts[k] / C.weights[k]}%"></s></i><b>${fmt1(r.parts[k])}/${C.weights[k]}</b></div>`).join("")}</div></div>`).join("");

  // ---------- live Pro Clubs queue ----------
  const QAPI = ((config.fanVote && config.fanVote.apiUrl) || "").replace(/\/$/, "");
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const qRow = (e, i, playing) => `<div class="q-row ${e.sub ? "sub" : ""}"><div class="rk">${playing ? "▶" : i + 1}</div>
    <div class="nm">${esc(e.name)}${e.sub ? '<span class="badge-sub">SUB</span>' : ""}${e.note ? `<small style="display:block;color:var(--muted);font-weight:400;font-size:12px">${esc(e.note)}</small>` : ""}</div><div class="ps">${e.pos && e.pos !== "ANY" ? esc(e.pos) : ""}</div>
    <div class="left">${playing ? `${e.matchesLeft} match${e.matchesLeft === 1 ? "" : "es"} left` : ""}</div></div>`;
  async function refreshQueue() {
    if (!QAPI) return;
    try {
      const q = await fetch(QAPI + "/api/queue").then((r) => r.json());
      const live = q.open || q.playing.length > 0;
      $("#queueLive").hidden = !q.open;
      $("#queueBanner").hidden = !q.open;
      $("#queueBanner").textContent = `Pro Clubs queue is open · ${q.waiting.length} waiting · ${q.playing.length} on the pitch · tap to see it`;
      $("#queueTitle").textContent = q.open ? "Pro Clubs queue · OPEN" : "Pro Clubs queue · closed";
      $("#queuePlaying").innerHTML = q.playing.length ? q.playing.map((e, i) => qRow(e, i, true)).join("") : `<div class="note">Nobody from the queue on the pitch.</div>`;
      $("#queueWaiting").innerHTML = q.waiting.length ? q.waiting.map((e, i) => qRow(e, i, false)).join("") : `<div class="note">${live ? "Nobody waiting." : "The queue opens on Pro Clubs streams."}</div>`;
      $("#queueUpdated").textContent = q.updatedAt ? "Updated " + new Date(q.updatedAt).toLocaleTimeString() : "";
    } catch (e) { $("#queueUpdated").textContent = "Couldn't reach the queue, retrying…"; }
  }
  refreshQueue(); setInterval(refreshQueue, 10000);

  $("#footer").textContent = `Stats from EA Sports FC Pro Clubs, refreshed every 20 minutes. ${S.matches.length} matches on record. Season windows and awards are set by the captain.`;
})();
