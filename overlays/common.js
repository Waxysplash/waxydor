// Shared data loader for the stream scenes. Reads ../data/*.json and computes the season table
// exactly the way the site and the leaderboard overlay do.
window.Waxy = (function () {
  const q = new URLSearchParams(location.search);
  const param = (k, d) => (q.has(k) ? q.get(k) : d);
  const n = (v) => +v || 0;

  async function load() {
    const bust = "?t=" + Math.floor(Date.now() / 60000);
    const j = (f) => fetch("../data/" + f + bust).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });
    if (!window.WaxyRanking) await new Promise((res, rej) => { const t = document.createElement("script"); t.src = "../ranking.js" + bust; t.onload = res; t.onerror = rej; document.head.appendChild(t); });
    const [config, members, club, store] = await Promise.all([j("config.json"), j("members.json"), j("club.json"), j("matches.json")]);
    const now = new Date();
    const season = config.seasons.find((s) => new Date(s.start) <= now && now <= new Date(s.end)) || config.seasons.at(-1);
    let snap = { members: [] }; try { snap = await j("snapshots/" + season.id + "-start.json"); } catch (e) {}
    const R = WaxyRanking.rank({ config, members, matches: store.matches, snapshot: snap, season });
    const gaffer = R.gaffer;
    const players = R.rows;
    // Overlays show the qualified race; the ticker etc. read r.idx.
    for (const r of [...players, ...(gaffer ? [gaffer] : [])]) r.idx = r.index;
    const rows = R.ranked, unq = R.provisional;
    const po = new Date(season.playoffsStart), end = new Date(season.end);
    const phase = now < po ? "league" : now <= end ? "playoffs" : "over";
    const target = phase === "league" ? po : end;
    const daysTo = Math.max(0, Math.ceil((target - now) / 864e5));
    const o = club.overall;
    const record = `${o.wins}W ${o.ties}D ${o.losses}L`;
    const topScorer = [...players].sort((x, y) => y.g - x.g)[0] || null;
    const topAssist = [...players].sort((x, y) => y.a - x.a)[0] || null;
    return { config, club, season, rows, unq, gaffer, phase, daysTo, record, topScorer, topAssist, brand: config.brand || {} };
  }

  function socialsHtml(brand) {
    const s = brand.socials || {};
    const items = [["Twitch", "twitch.tv/waxysplash"], ["X", s.x], ["TikTok", s.tiktok], ["Instagram", s.instagram], ["Discord", s.discord]].filter(([, v]) => v);
    return items.map(([k, v]) => `<span>${k}<b>${v}</b></span>`).join("");
  }

  function tickerHtml(d) {
    const parts = d.rows.map((r, i) => `<span><b>${i + 1}</b>${r.name} <i>${r.g}G ${r.a}A · ${r.rating.toFixed(1)} · idx ${r.idx}</i></span>`);
    if (d.gaffer) parts.push(`<span class="g"><b>G</b>${d.gaffer.name} <i>${d.gaffer.g}G ${d.gaffer.a}A · ${d.gaffer.rating.toFixed(1)}</i></span>`);
    parts.push(`<span><b>${d.club.name}</b><i>Division ${d.club.division || "–"} · ${d.record}</i></span>`);
    parts.push(`<span><b>${d.season.name}</b><i>${d.phase === "league" ? d.daysTo + " days to playoffs" : d.phase === "playoffs" ? d.daysTo + " days to the final whistle" : "season over"}</i></span>`);
    parts.push(`<span><b>!club</b><i>to join the Phantoms</i></span><span><b>!waxydor</b><i>full table and every match</i></span>`);
    return parts.join("");
  }

  // Countdown to a clock time today (HH:MM, viewer's local time). Returns ms remaining.
  function msUntil(hhmm) {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    const t = new Date(); t.setHours(h, m || 0, 0, 0);
    if (t < new Date()) t.setDate(t.getDate() + 1);
    return t - new Date();
  }
  const pad = (v) => String(v).padStart(2, "0");
  function clock(ms) { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60; return (h ? pad(h) + ":" : "") + pad(m) + ":" + pad(sec); }

  return { param, load, socialsHtml, tickerHtml, msUntil, clock };
})();
