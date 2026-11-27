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
  const legends = R.legends || [];
  S.rows = rows;
  const C = config.index;
  // This season's weights and the factors that count in it (a factor with weight 0 isn't shown).
  const SW = WaxyRanking.weightsFor(config, season), SF = WaxyRanking.factorsFor(config, season);
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

  // ---------- best bits: the captain's hand-picked clips (config.brand.featuredClips) ----------
  // Thumbnails only until tapped, so the page stays light; a tap swaps in the Twitch player.
  const feat = (config.brand && config.brand.featuredClips) || [];
  if (feat.length) {
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
    $("#featured").innerHTML = `<div class="sr-head"><h3>Best bits</h3><a href="clips.html">All clips →</a></div>
      <div class="feat-grid">${feat.map((c) => `<button class="feat" data-id="${esc(c.id)}" aria-label="Play: ${esc(c.title)}">
        <span class="feat-media"><img src="${esc(c.thumb)}" alt="" loading="lazy"><span class="feat-play" aria-hidden="true">▶</span></span>
        <span class="feat-t">${esc(c.title)}</span></button>`).join("")}</div>`;
    $("#featured").hidden = false;
    $("#featured").addEventListener("click", (e) => {
      const b = e.target.closest("button.feat");
      if (!b || b.classList.contains("playing")) return;
      b.classList.add("playing");
      b.querySelector(".feat-media").innerHTML = `<iframe src="https://clips.twitch.tv/embed?clip=${encodeURIComponent(b.dataset.id)}&parent=${location.hostname}&autoplay=true" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    });
  }

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
    // Each tab has its own address (./#awards), so a tab can be shared or bookmarked.
    history.replaceState(null, "", b.dataset.tab === "table" ? location.pathname : "#" + b.dataset.tab);
  });
  // A tab in the address wins; otherwise the tab you were last on.
  const openTab = (t) => { const btn = t && document.querySelector(`#tabs [data-tab="${t}"]`); if (btn) btn.click(); return !!btn; };
  let saved = null;
  try { saved = localStorage.getItem("waxy.tab"); } catch (e) {}
  // The old Players and Queue tabs are pages of their own now.
  const moved = { players: "card.html", queue: "queue.html" }[location.hash.slice(1)];
  if (moved) location.replace(moved);
  openTab(location.hash.slice(1)) || openTab(saved);
  addEventListener("hashchange", () => openTab(location.hash.slice(1) || "table"));

  // ---------- the last stream, and how the race moved because of it ----------
  // A stream is a run of matches with no gap over 3 hours. Ranking again without them gives "before the last stream".
  const byTime = [...S.matches].sort((a, b) => b.timestamp - a.timestamp);
  const lastStream = [];
  for (const m of byTime) { if (lastStream.length && lastStream.at(-1).timestamp - m.timestamp > 3 * 3600) break; lastStream.push(m); }
  const streamStart = lastStream.length ? lastStream.at(-1).timestamp : Infinity;
  const qualifiedRank = (list) => new Map(list.filter((r) => r.qualified).map((r, i) => [r.name, i + 1]));
  const nowRank = qualifiedRank(rows);
  let prevRank = new Map();
  try { prevRank = qualifiedRank(WaxyRanking.rank({ config, members, matches: S.matches.filter((m) => m.timestamp < streamStart), snapshot, season }).rows); } catch (e) {}
  const moveTag = (r) => {
    if (!r.qualified || !prevRank.size) return "";
    const a = nowRank.get(r.name), b = prevRank.get(r.name);
    if (!b) return `<span class="mv nw" title="New in the race since the last stream">NEW</span>`;
    return a < b ? `<span class="mv up" title="Up ${b - a} since the last stream">▲${b - a}</span>` : a > b ? `<span class="mv dn" title="Down ${a - b} since the last stream">▼${a - b}</span>` : "";
  };

  // ---------- hero: live stream, or the countdown to the next one ----------
  const esc2 = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const W2 = lastStream.filter((m) => m.result === "W").length, D2 = lastStream.filter((m) => m.result === "D").length, L2 = lastStream.filter((m) => m.result === "L").length;
  $("#lastStrip").innerHTML = lastStream.length ? lastStream.slice(0, 5).map((m) => `<div class="res"><span class="r ${m.result}">${m.result}</span><b>${m.goalsFor}–${m.goalsAgainst}</b><span>${esc2(m.opponent)}</span></div>`).join("") + (lastStream.length > 5 ? `<a class="res more" href="#tabs" id="moreRes"><b>+${lastStream.length - 5}</b><span>more games</span></a>` : "")
    : `<div class="note">No games yet.</div>`;
  const GF2 = lastStream.reduce((s, m) => s + (+m.goalsFor || 0), 0);
  const scorers = new Map();
  for (const m of lastStream) for (const p of m.players) if (+p.goals) scorers.set(p.name, (scorers.get(p.name) || 0) + +p.goals);
  const topS = [...scorers].sort((a, b) => b[1] - a[1])[0];
  (window.WAXY_LIVE || Promise.resolve({})).then((L) => {
    const q = L.queue;
    if (q) $("#doQueue").textContent = q.open ? `Open now · ${q.waiting.length} waiting · ${q.playing.length} playing` : "Opens when the stream starts. Type !join in chat";
    const hero = $("#heroIn");
    const lastLine = lastStream.length ? `Last stream: <b>${W2}W ${D2}D ${L2}L</b> in ${lastStream.length} games, ${new Date(lastStream[0].timestamp * 1000).toLocaleDateString(undefined, { weekday: "long" })}.` : "";
    if (L.live) {
      const mins = L.startedAt ? Math.round((Date.now() - new Date(L.startedAt)) / 6e4) : null;
      hero.innerHTML = `<span class="kicker live"><i></i>Live now${L.viewers ? ` · ${L.viewers} watching` : ""}${mins != null ? ` · ${mins >= 60 ? Math.floor(mins / 60) + "h " : ""}${mins % 60}m` : ""}</span>
        <h2>${esc2(L.title || "Waxysplash is live")}</h2>
        <div class="player-box"><iframe src="https://player.twitch.tv/?channel=waxysplash&parent=${location.hostname}&muted=true" allowfullscreen title="Waxysplash live on Twitch"></iframe></div>
        <div class="cta-row"><a class="cta gold" href="queue.html">Join the queue${q && q.open ? ` <small>${q.waiting.length} waiting</small>` : ""}</a><a class="cta" href="https://twitch.tv/waxysplash" target="_blank" rel="noopener">Watch on Twitch ↗</a></div>`;
      return;
    }
    const next = L.next && new Date(L.next.start);
    hero.innerHTML = `<span class="kicker">${next ? "Next stream" : "Offline right now"}</span>
      <h2>${next ? `${next.toLocaleDateString(undefined, { weekday: "long" })} <em>${next.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</em>` : `Pro Clubs <em>with viewers.</em>`}</h2>
      ${next ? `<div class="cd" id="nextCd"></div>` : ""}
      <p class="lede">${next && L.next.title ? esc2(L.next.title) + ". " : ""}Type <b>!join</b> in Twitch chat when the queue opens and you could be on the pitch.</p>
      ${lastStream.length ? `<div class="hs"><div><b>${lastStream.length}</b><span>games last stream</span></div><div><b>${W2}-${D2}-${L2}</b><span>W-D-L</span></div><div><b>${GF2}</b><span>goals scored</span></div>${topS ? `<div class="fitbox"><b style="font-size:min(28px, ${(190 / topS[0].length).toFixed(1)}cqi)">${esc2(topS[0])}</b><span>top scorer · ${topS[1]} goals</span></div>` : ""}</div>` : ""}
      <div class="cta-row"><a class="cta red" href="https://twitch.tv/waxysplash" target="_blank" rel="noopener">Follow on Twitch ↗</a>${L.broadcasterId ? `<a class="cta" href="https://api.twitch.tv/helix/schedule/icalendar?broadcaster_id=${L.broadcasterId}">Add streams to calendar</a>` : `<a class="cta" href="https://discord.gg/5Uu3nVP" target="_blank" rel="noopener">Get pinged on Discord ↗</a>`}</div>`;
    if (next) {
      const cdTick = () => {
        const ms = Math.max(0, next - new Date());
        const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, mi = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
        $("#nextCd").innerHTML = [[d, "days"], [h, "hrs"], [mi, "min"], [s, "sec"]].map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`).join("");
      };
      cdTick(); setInterval(cdTick, 1000);
    }
  });

  // ---------- podium: the top three in the race ----------
  const top3 = rows.filter((r) => r.qualified).slice(0, 3);
  // Each of the top three is drawn as a small FC-style card: rank and index top left, crest top right, name, then a stat row.
  const fit = (n, base, at) => (base * Math.min(1, at / Math.max(at, n.length))).toFixed(2);
  $("#podium").innerHTML = top3.map((r, i) => `<a class="pod p${i + 1}" href="card.html?p=${encodeURIComponent(r.name)}" aria-label="${esc2(r.name)}, number ${i + 1} in the race">
      <div class="pin"><img class="pwm" src="brand/crest.png" alt="">
        <div class="ptop"><div><b class="pix" data-count="${r.index}">${r.index}</b><span>Index</span><em>${posShort[r.pos] || ""}</em></div><img src="brand/crest.png" alt=""></div>
        <div class="pnm"><b style="font-size:${fit(r.name, 1.7, 12)}em">${esc2(r.name)}</b><span>${esc2(r.pro || "")}${r.ovr ? ` · ${r.ovr} OVR` : ""} ${moveTag(r)}</span></div>
        <div class="pst"><div><b>${r.gp}</b><span>APP</span></div><div><b>${r.g}</b><span>GLS</span></div><div><b>${r.a}</b><span>AST</span></div><div><b>${r.mom}</b><span>MOTM</span></div><div><b>${r.rating.toFixed(1)}</b><span>RAT</span></div></div>
        <div class="ptag">#${i + 1} in the Waxy d'Or race</div>
      </div></a>`).join("");
  // Approved card photos go on the podium cards too (loaded after, so a slow API never holds the page up).
  const PAPI = ((config.fanVote && config.fanVote.apiUrl) || "").replace(/\/$/, "");
  if (PAPI) fetch(PAPI + "/api/photo").then((r) => r.json()).then(({ photos = {} }) => {
    document.querySelectorAll("#podium .pod").forEach((el, i) => {
      const n = top3[i] && top3[i].name; if (!n || !photos[n]) return;
      el.classList.add("has-ph");
      el.querySelector(".pin").insertAdjacentHTML("afterbegin", `<img class="pimg" src="${PAPI}/api/photo?p=${encodeURIComponent(n)}&v=${photos[n]}" alt="">`);
    });
  }).catch(() => {});
  const more = $("#moreRes"); if (more) more.addEventListener("click", (e) => { e.preventDefault(); document.querySelector('#tabs [data-tab="matches"]').click(); $("#tabs").scrollIntoView({ behavior: "smooth" }); });
  $("#toTable").addEventListener("click", (e) => { e.preventDefault(); document.querySelector('#tabs [data-tab="table"]').click(); $("#tabs").scrollIntoView({ behavior: "smooth" }); });

  // ---------- Road to Glory teaser: the latest episode ----------
  load("rtg.json").then((rtg) => {
    const eps = (rtg.episodes || []).filter((e) => e.cover);
    const ep = eps.at(-1); if (!ep) return;
    $("#rtgImg").src = ep.cover;
    $("#rtgLine").innerHTML = `Latest: <b>Episode ${ep.n}, ${esc2(ep.title)}</b>. ${esc2(ep.line || "")}`;
  }).catch(() => {});

  // numbers count up the first time they scroll into view
  const countUp = (el) => {
    const raw = (el.childNodes[0]?.nodeValue || "").trim(); if (!/^\d+(\.\d+)?$/.test(raw)) return;
    const to = parseFloat(raw);
    const dec = (raw.split(".")[1] || "").length, t0 = performance.now(), dur = 900;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - k, 3)); el.childNodes[0].nodeValue = v.toFixed(dec); if (k < 1) requestAnimationFrame(step); };
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(step);
  };
  const cio = "IntersectionObserver" in window && new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); } }));
  if (cio) document.querySelectorAll(".pod .ix, .sr-grid b").forEach((el) => cio.observe(el));

  // ---------- table ----------
  const cols = [
    ["#", null], ["Player", "name"], ["Pos", "pos"], ["Apps", "gp"], ["G", "g"], ["A", "a"], ["Rating", "rating"], ["MOTM", "mom"],
    ["Win%", "winPct"], ["Pass%", "passPct"], ["Passes", "passes"], ["Shot%", "shotPct"], ["Tackle%", "tacklePct"], ["Tackles", "tackles"],
    ["Pts/game", "ppg"], ["Form", null], ["Waxy index", "index"],
  ];
  let sortKey = "index", sortDir = -1;
  const idxCell = (r) => r.index == null ? `<span class="idx" style="opacity:.5">–</span>`
    : `<span class="idx${r.qualified || r.gaffer || r.legend ? "" : " prov"}" title="${r.qualified || r.gaffer || r.legend ? "" : "Provisional: needs " + C.minGames + " apps"}">${r.index}</span>`;
  const breakdownHtml = (r) => {
    const parts = SF.map(([k, label]) => `<span><b>${fmt1(r.parts[k])}</b>/${SW[k]} ${label}</span>`).join("");
    const b = r.breakdown, lbl = { goals: "goals", assists: "assists", cleanSheets: "clean sheets", saves: "saves", tackles: "tackles", passes: "passes", missedShots: "missed shots", bigMisses: "big misses", penSaves: "penalty saves", penMisses: "missed penalties", streamMotm: "Man of the Stream", hatTricks: "hat-tricks", conceded: "goals conceded", bigGames: "big-game bonus" };
    const pts = WaxyRanking.BREAKDOWN.filter((k) => b[k]).map((k) => `${b[k] > 0 ? "+" : ""}${fmt1(b[k])} ${lbl[k]}`).join(" · ");
    const left = C.minGames - r.gp;
    const status = r.gaffer ? "The gaffer · not in the race" : r.legend ? "Club legend · not in the race" : r.qualified ? "Qualified" : `Provisional · ${left} more app${left === 1 ? "" : "s"} to qualify`;
    const v = r.vsPos;
    const vs = v ? `<div class="bd-pts">Against an average player in the same position: <b>${v.points.toFixed(2)}×</b> the contribution points, <b>${v.motm.toFixed(2)}×</b> the MOTMs, match rating <b>${v.rating >= 0 ? "+" : "−"}${Math.abs(v.rating).toFixed(2)}</b></div>` : "";
    return `<div class="bd-parts">${parts}${r.penalty ? `<span class="neg"><b>−${r.penalty}</b> red cards</span>` : ""}</div>
      <div class="bd-pts"><b>${fmt1(r.points)} contribution points</b> in ${r.gp} apps (${fmt1(r.ppg)} per game, main position ${r.pos}): ${pts || "none yet"}</div>${vs}
      <div class="bd-st">${status}${r.index != null ? ` · index ${r.index}` : ` · index shown from ${C.compareMinGames} apps`}</div>`;
  };
  const rowHtml = (r, i) => `<tr class="${r.qualified || r.gaffer || r.legend ? "" : "unq"} rank-${i} prow">
        <td>${i}</td><td class="name">${r.name}${typeof i === "number" && sortKey === "index" && sortDir < 0 ? moveTag(r) : ""}<small>${r.pro || ""} · ${r.ovr || ""} OVR</small></td><td>${posShort[r.pos] || ""}</td>
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
      (legends.length ? `<tbody class="gaffer"><tr class="sep"><td colspan="${cols.length}">Club legends · stats kept, not in the Waxy d'Or race · <a href="legends.html">See the legends ›</a></td></tr>${legends.map((r) => rowHtml(r, "★")).join("")}</tbody>` : "") +
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
  $("#tableNote").innerHTML = `Ranked by the Waxy index: ${SF.map(([k, label]) => `${label.toLowerCase()} ${SW[k]}`).join(", ")}. ${C.minGames} apps to qualify. <b>Tap a player</b> to see exactly where their index comes from, or read <a href="#" data-goto="rules">how it works</a>. Updated ${new Date(members.fetchedAt).toLocaleString()}.`;
  document.addEventListener("click", (e) => { const a = e.target.closest("[data-goto]"); if (!a) return; e.preventDefault(); document.querySelector(`#tabs [data-tab="${a.dataset.goto}"]`).click(); window.scrollTo(0, 0); });
  renderTable();

  // ---------- rules ----------
  // Written from data/config.json, so the page always states the rules the table actually uses.
  const P = C.points, POS = WaxyRanking.POSITIONS, posName = { forward: "Forward", midfielder: "Midfielder", defender: "Defender", goalkeeper: "Keeper" };
  const cell = (v) => v ? `${v > 0 ? "+" : "−"}${Math.abs(v)}` : "–";
  const ptRow = (label, f) => `<tr><td class="name">${label}</td>${POS.map((p) => `<td>${cell(f(p))}</td>`).join("")}</tr>`;
  const rest = 100 - SW.contribution;
  $("#rules").innerHTML = `
    <div class="card"><h3>How the Waxy d'Or works</h3>
      <p class="lead">The Waxy d'Or is the Waxys Phantoms player of the season. The table ranks the squad by the <b>Waxy index</b>, a score out of 100 built from every stat EA records, so the best all-round player rises to the top, not just the top scorer. ${rest} of the 100 points have nothing to do with goals.</p>
      <ul class="rules">
        <li><b>Who's in the race:</b> every Waxys Phantoms player in an EA league or playoff match this season. The gaffer (${config.gaffer}) is shown with full stats but isn't ranked and can't win awards.${legends.length ? ` Club legends (${legends.map((r) => r.name).join(", ")}) are the same: stats shown, never in the race.` : ""}</li>
        <li><b>To qualify:</b> ${C.minGames} appearances. Players on ${C.compareMinGames} to ${C.minGames - 1} apps get a provisional index, shown in grey below the qualified players. Under ${C.compareMinGames} apps there's too little to go on, so no index is shown.</li>
        <li><b>Where the stats come from:</b> straight from EA Pro Clubs. Nobody types anything in and nobody can edit a stat. The site checks EA every 20 minutes and saves every match.</li>
        <li><b>Season:</b> ${season.name}. Playoffs from ${fmt(new Date(season.playoffsStart))}, final whistle ${fmt(new Date(season.end))}.</li>
      </ul>
    </div>
    <div class="card"><h3>The Waxy index, out of 100</h3>
      <div class="note">In order of weight. In each factor, the best regular (${season.barMinGames || C.compareMinGames}+ apps) gets the full points and everyone else gets their share of it.${season.positionRelative ? ` <b>Every position can win it:</b> contribution points, man of the match and match rating are judged against an average player in the same position, so a defender who outdoes the other defenders scores as well as a striker who outdoes the other strikers. The averages come from every match the club has saved, and each match counts by the position played in it.` : ""}</div>
      <div class="table-wrap"><table class="rules-t"><thead><tr><th>#</th><th class="name">Factor</th><th>Points</th><th class="name">What it rewards</th></tr></thead><tbody>
        ${SF.map(([k, label, what], i) => `<tr><td>${i + 1}</td><td class="name">${label}</td><td><b>${SW[k]}</b></td><td class="name wrap">${what}${k === "rating" ? ` (scored from ${C.ratingFloor.toFixed(1)} up to the best)` : k === "passAccuracy" ? ` (scored from ${C.passFloor}% up to the best, in full at ${season.passVolume ? POS.map((p, i) => `${season.passVolume[p]}+${i ? "" : " completed passes per game"} for ${posName[p].toLowerCase()}s`).join(", ") : `${C.passVolumeFull}+ completed passes per game, ${C.passVolumeFullKeeper}+ for keepers`}, and less below that)` : k === "accuracy" ? (season.keeperSaves ? ` (half each; keepers are scored on save percentage instead, from ${season.keeperSaves.floor}% up to ${season.keeperSaves.full}%)` : " (half each)") : ""}</td></tr>`).join("")}
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
        ${P.penSave ? ptRow("Penalty saved", () => P.penSave) : ""}
        ${P.penMiss ? ptRow("Missed penalty", () => P.penMiss) : ""}
        ${P.streamMotm ? ptRow("Man of the Stream (captain's pick)", () => P.streamMotm) : ""}
        ${P.hatTrick ? ptRow("Hat-trick bonus (on top of the goals)", () => P.hatTrick) : ""}
        ${ptRow(`Each goal conceded past ${P.concededAllowance} in a game`, (p) => P[p].conceded)}
      </tbody></table></div>
      <ul class="rules">
        <li><b>Big games:</b> the captain marks the games that mattered most, like promotion deciders${C.playoffsAreBigGames ? ", and every EA playoff match is a big game automatically" : ""}. Everything in a big game counts <b>${C.bigGameMultiplier}×</b>: goals, assists, clean sheets, saves, tackles and passes, and missed shots and heavy defeats count ${C.bigGameMultiplier}× against you too. Big games have a ★ in the match log.</li>
        <li><b>Clean sheet:</b> a match where the team conceded nothing. EA's own clean-sheet count is unreliable, so it's taken from the score.</li>
        <li><b>Missed shots</b> cost a little so random shots hurt, but a goal is worth far more than a miss costs. Shoot when it's on.</li>
        ${P.bigMiss ? `<li><b>Big misses:</b> the sitters, the open goals. EA doesn't record them, so the captain logs them after each stream and each one costs ${Math.abs(P.bigMiss)}.</li>` : ""}
        ${P.penSave ? `<li><b>Penalty saves:</b> EA doesn't record them either, so the captain logs them and each one is worth ${P.penSave}.</li>` : ""}
        ${P.penMiss ? `<li><b>Missed penalties:</b> logged by the captain like big misses, and they hurt more: each one costs ${Math.abs(P.penMiss)}.</li>` : ""}
        ${P.streamMotm ? `<li><b>Man of the Stream:</b> after each stream the captain picks the player of the whole stream. It's worth ${P.streamMotm}, and a big game doesn't multiply it.</li>` : ""}
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
  for (const m of seasonMatches) { const w = WaxyRanking.bigWindow(config, m); if (w && !bigBy.has(String(m.matchId))) bigBy.set(String(m.matchId), w.label || ""); }
  const resColor = { W: "var(--win)", L: "var(--loss)", D: "var(--draw)" };
  $("#matches").innerHTML = seasonMatches.length ? seasonMatches.map((m, i) => `
    <div class="match" data-i="${i}">
      <div class="res ${m.result}">${m.result === "W" ? "WON" : m.result === "L" ? "LOST" : "DRAW"}</div>
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

  // ---------- live Pro Clubs queue: the banner and the LIVE tag (the queue itself is queue.html) ----------
  const QAPI = ((config.fanVote && config.fanVote.apiUrl) || "").replace(/\/$/, "");
  async function refreshQueue() {
    if (!QAPI) return;
    try {
      const q = await fetch(QAPI + "/api/queue").then((r) => r.json());
      $("#queueLive").hidden = !q.open;
      $("#queueBanner").hidden = !q.open;
      $("#queueBanner").textContent = `Pro Clubs queue is open · ${q.waiting.length} waiting · ${q.playing.length} on the pitch · tap to join`;
    } catch (e) { /* try again next round */ }
  }
  refreshQueue(); setInterval(refreshQueue, 10000);

  // ---------- hall of fame ----------
  // Legends are inducted by hand (data/legends.json). Career numbers come from EA's running totals.
  let legendsData = { legends: [] };
  try { legendsData = await load("legends.json"); } catch (e) {}
  const career = new Map(members.members.map((m) => [m.name.toLowerCase(), m]));
  const hofEsc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  $("#legends").innerHTML = (legendsData.legends || []).length ? legendsData.legends.map((l) => {
    const m = career.get(String(l.name).toLowerCase());
    const stats = m ? `<div class="legend-stats"><div><b>${m.gamesPlayed}</b><span>apps</span></div><div><b>${m.goals}</b><span>goals</span></div><div><b>${m.assists}</b><span>assists</span></div><div><b>${m.manOfTheMatch}</b><span>MOTM</span></div></div>` : "";
    return `<article class="legend"><div class="legend-star">★</div>
      <h4>${hofEsc(l.name)}</h4>${l.title ? `<div class="legend-title">${hofEsc(l.title)}</div>` : ""}
      ${l.citation ? `<p>${hofEsc(l.citation)}</p>` : ""}${stats}
      <div class="legend-date">Inducted ${l.inducted ? new Date(l.inducted + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : ""}${m ? " · career with the Phantoms" : ""}</div></article>`;
  }).join("") : `<div class="card"><div class="note">No legends yet. The captain inducts the first one.</div></div>`;

  $("#footer").textContent = `Stats from EA Sports FC Pro Clubs, refreshed every 20 minutes. ${S.matches.length} matches on record. Season windows and awards are set by the captain.`;
})();
