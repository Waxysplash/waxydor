// The site's navigation, shared by every public page so the links, their order and the "you are here" mark can never drift apart.
// Redesigned 26 Nov 2026: pages are grouped (Play / Watch / Club / Shop).
//  - Desktop: a top bar whose group buttons open a dropdown of big link cards (hover or click; Esc closes).
//  - Phones: a slim top bar plus an app-style tab bar at the bottom; a group tab slides up a sheet with its pages.
// Live touches: the Twitch pill and the Watch tab go red while Waxysplash is live, and the Play tab shows the queue count while it's open.
// It also adds a group label above each page's title, the socials at the foot, and fades sections in as you scroll (class "rv").
(function () {
  if (document.body.classList.contains("obs")) return;
  const API = "https://waxydor-vote-api.vercel.app/api/";
  const SHOP_URL = "shop.html"; // when the store opens with the supplier, point this at it (e.g. https://shop.waxysplash.com)
  const SHOP_OPEN = false;
  const here = location.pathname.split("/").pop() || "index.html";

  // Small line icons, drawn in currentColor.
  const I = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5L7 18.5M8 10L3.5 8.5"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
    crest: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 10l1.5 5 2-3.5 2 3.5 1.5-5"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    queue: '<path d="M4 6h10M4 12h10M4 18h7"/><path d="M17 15l3 3-3 3"/>',
    card: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17h8"/>',
    cam: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    clip: '<path d="M4 7h16v12H4z"/><path d="M4 7l3-4h3L7 7M11 7l3-4h3l-3 4"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    tv: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 3l4 3 4-3"/>',
    trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;

  const GROUPS = [
    { id: "play", label: "Play", ic: "ball", blurb: "Get on the pitch with the Phantoms", items: [
      { href: "queue.html", t: "Join the queue", d: "Type !join on stream and you're in line", ic: "queue", hot: true },
      { href: "card.html", t: "Player cards", d: "Every player's FC-style card. Compare any two", ic: "card" },
      { href: "photo.html", t: "Your card photo", d: "Put your face on your card", ic: "cam" },
    ] },
    { id: "watch", label: "Watch", ic: "play", blurb: "Streams, clips and the series", items: [
      { href: "https://twitch.tv/waxysplash", t: "Twitch", d: "Pro Clubs with viewers, live", ic: "tv", ext: true, id: "navTwitch" },
      { href: "clips.html", t: "Waxyclips", d: "Every clip, plus the Clip of the Week vote", ic: "clip" },
      { href: "rtg.html", t: "Road to Glory", d: "The Morocco Ultimate Team series on TikTok", ic: "film", feature: true },
    ] },
    { id: "club", label: "Club", ic: "crest", blurb: "The Waxy d'Or and the people who made the club", items: [
      { href: "./#race", t: "The Waxy d'Or", d: "The season's player race and full table", ic: "trophy", files: ["index.html"] },
      { href: "legends.html", t: "Legends", d: "The Hall of Fame", ic: "crown" },
      { href: "vote.html", t: "Fan vote", d: "You pick the Fans' Player of the Season", ic: "star" },
    ] },
  ];
  const fileOf = (it) => it.files || [it.href.split("#")[0]];
  const groupHere = GROUPS.find((g) => g.items.some((it) => !it.ext && fileOf(it).includes(here) && here !== "index.html"));
  const onShop = here === "shop.html";
  const onHome = here === "index.html";

  const item = (it) => `<a class="nv-item${it.hot ? " hot" : ""}${it.feature ? " feature" : ""}" href="${it.href}"${it.ext ? ' target="_blank" rel="noopener"' : ""}${it.id ? ` id="${it.id}"` : ""}${!it.ext && fileOf(it).includes(here) && !(onHome && it.href.includes("#")) ? ' aria-current="page"' : ""}>
      ${it.feature ? '<img class="nv-cover" alt="" loading="lazy" src="brand/rtg/ep9.jpg">' : `<span class="nv-ic">${svg(it.ic)}</span>`}
      <span class="nv-txt"><b>${it.t}${it.ext ? " ↗" : ""}</b><span>${it.d}</span></span></a>`;
  const panel = (g) => `<div class="nv-panel" id="nv-${g.id}" role="region" aria-label="${g.label}" hidden>
      <div class="nv-head"><b>${g.label}</b><span>${g.blurb}</span>${g.id === "watch" ? '<em class="nv-status" id="nvStatus">Checking Twitch…</em>' : ""}</div>
      <div class="nv-grid">${g.items.map(item).join("")}</div></div>`;

  // ---------- top bar ----------
  const bar = document.createElement("header");
  bar.className = "bar";
  bar.innerHTML = `<div class="bar-in">
      <a class="bar-home" href="./" aria-label="Waxysplash home"${onHome ? ' aria-current="page"' : ""}><img src="brand/crest.png" alt=""><b>Waxysplash</b></a>
      <nav class="nv" aria-label="Site">
        ${GROUPS.map((g) => `<div class="nv-g" data-g="${g.id}"><button class="nv-btn${groupHere === g ? " here" : ""}" aria-expanded="false" aria-controls="nv-${g.id}">${g.label}<i class="nv-dot" id="dot-${g.id}" hidden></i><svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>${panel(g)}</div>`).join("")}
        <a class="nv-btn shop${onShop ? " here" : ""}" href="${SHOP_URL}"${onShop ? ' aria-current="page"' : ""}>Shop${SHOP_OPEN ? "" : '<span class="soon">Soon</span>'}</a>
        <span class="nv-line" aria-hidden="true"></span>
      </nav>
      <a class="bar-join" href="queue.html" id="barJoin"><span>!join</span></a>
      <a class="bar-live" id="barLive" href="https://twitch.tv/waxysplash" target="_blank" rel="noopener"><i></i><span>Twitch</span></a>
    </div>`;
  document.body.prepend(bar);

  // ---------- phone tab bar + sheet ----------
  const tabs = document.createElement("nav");
  tabs.className = "tabbar";
  tabs.setAttribute("aria-label", "Site (phone)");
  tabs.innerHTML = `<a href="./" class="tb${onHome ? " here" : ""}">${svg("home")}<span>Home</span></a>
    ${GROUPS.map((g) => `<button class="tb${groupHere === g ? " here" : ""}" data-sheet="${g.id}" aria-expanded="false">${svg(g.ic)}<span>${g.label}</span><i class="tb-badge" id="tb-${g.id}" hidden></i></button>`).join("")}
    <a href="${SHOP_URL}" class="tb${onShop ? " here" : ""}">${svg("bag")}<span>Shop</span>${SHOP_OPEN ? "" : '<i class="tb-badge soon">Soon</i>'}</a>`;
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  sheet.hidden = true;
  sheet.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet-in" role="dialog" aria-modal="true" aria-label="Menu"><span class="sheet-grip" data-close></span><div class="sheet-body"></div></div>`;
  document.body.append(tabs, sheet);
  document.body.classList.add("has-tabbar");

  // ---------- behaviour: desktop dropdowns ----------
  const groups = [...bar.querySelectorAll(".nv-g")];
  const line = bar.querySelector(".nv-line");
  let openG = null, hoverT;
  const moveLine = (el) => {
    if (!el) { line.style.opacity = 0; return; }
    const r = el.getBoundingClientRect(), p = bar.querySelector(".nv").getBoundingClientRect();
    line.style.opacity = 1; line.style.width = r.width - 24 + "px"; line.style.transform = `translateX(${r.left - p.left + 12}px)`;
  };
  const restLine = () => moveLine(bar.querySelector(".nv-btn.here"));
  const setOpen = (g) => {
    groups.forEach((x) => {
      const on = x === g;
      x.querySelector(".nv-panel").hidden = !on;
      x.querySelector(".nv-btn").setAttribute("aria-expanded", on);
      x.classList.toggle("open", on);
    });
    openG = g || null;
    if (g) { moveLine(g.querySelector(".nv-btn")); loadCover(); } else restLine();
  };
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  groups.forEach((g) => {
    const btn = g.querySelector(".nv-btn");
    btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(openG === g ? null : g); });
    g.addEventListener("mouseenter", () => { if (!fine.matches) return; clearTimeout(hoverT); hoverT = setTimeout(() => setOpen(g), openG ? 0 : 90); });
    g.addEventListener("mouseleave", () => { if (!fine.matches) return; clearTimeout(hoverT); hoverT = setTimeout(() => setOpen(null), 180); });
  });
  bar.querySelectorAll("a.nv-btn").forEach((a) => {
    a.addEventListener("mouseenter", () => { if (fine.matches) { setOpen(null); moveLine(a); } });
    a.addEventListener("mouseleave", () => restLine());
  });
  document.addEventListener("click", (e) => { if (openG && !openG.contains(e.target)) setOpen(null); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (openG) { const b = openG.querySelector(".nv-btn"); setOpen(null); b.focus(); } closeSheet(); } });
  addEventListener("resize", () => (openG ? moveLine(openG.querySelector(".nv-btn")) : restLine()));
  requestAnimationFrame(restLine);
  document.fonts && document.fonts.ready.then(restLine);

  // Road to Glory card in the Watch menu shows the latest episode cover.
  let coverDone = false;
  function loadCover() {
    if (coverDone) return; coverDone = true;
    fetch("data/rtg.json").then((r) => r.json()).then((rtg) => {
      const ep = (rtg.episodes || []).filter((e) => e.cover).at(-1);
      if (ep) document.querySelectorAll(".nv-cover").forEach((im) => (im.src = ep.cover));
    }).catch(() => {});
  }

  // ---------- behaviour: phone sheet ----------
  const body = sheet.querySelector(".sheet-body");
  let sheetFor = null;
  function openSheet(id) {
    const g = GROUPS.find((x) => x.id === id);
    if (sheetFor === id) return closeSheet();
    body.innerHTML = panel(g).replace(" hidden>", ">").replace('id="nv-' + g.id + '"', "").replace('id="nvStatus"', 'id="nvStatusM"');
    syncStatus();
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add("on"));
    sheetFor = id;
    tabs.querySelectorAll("[data-sheet]").forEach((b) => { b.setAttribute("aria-expanded", b.dataset.sheet === id); b.classList.toggle("open", b.dataset.sheet === id); });
    loadCover();
  }
  function closeSheet() {
    if (!sheetFor) return;
    sheet.classList.remove("on");
    sheetFor = null;
    tabs.querySelectorAll("[data-sheet]").forEach((b) => { b.setAttribute("aria-expanded", "false"); b.classList.remove("open"); });
    setTimeout(() => { if (!sheetFor) sheet.hidden = true; }, 260);
  }
  tabs.querySelectorAll("[data-sheet]").forEach((b) => b.addEventListener("click", () => openSheet(b.dataset.sheet)));
  sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
  // swipe the sheet down to close
  let y0 = null;
  sheet.addEventListener("touchstart", (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) closeSheet(); y0 = null; }, { passive: true });

  // ---------- page header: a group label above the page title ----------
  const head = document.querySelector("header.top .brand h1, .masthead h1");
  const g = groupHere || (onShop ? { label: "Shop" } : null);
  if (head && g && !head.parentElement.querySelector(".eyebrow")) head.insertAdjacentHTML("beforebegin", `<span class="eyebrow">${g.label}</span>`);

  // ---------- footer ----------
  const links = [
    ["https://discord.gg/5Uu3nVP", "Discord"],
    ["https://twitch.tv/waxysplash", "Twitch"],
    ["https://www.tiktok.com/@waxysplash", "TikTok"],
    ["https://www.instagram.com/TTVWaxysplash", "Instagram"],
    ["https://x.com/WaxySplash", "X"],
  ].map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`).join("");
  const map = GROUPS.map((x) => `<div><b>${x.label}</b>${x.items.map((it) => `<a href="${it.href}"${it.ext ? ' target="_blank" rel="noopener"' : ""}>${it.t}</a>`).join("")}</div>`).join("")
    + `<div><b>Shop</b><a href="${SHOP_URL}">Club shop${SHOP_OPEN ? "" : " (soon)"}</a><a href="mailto:waxysplash@gmail.com">Business: waxysplash@gmail.com</a></div>`;
  const wrap = document.querySelector(".wrap") || document.body;
  wrap.insertAdjacentHTML("beforeend", `<footer class="site-map"><a class="sm-crest" href="./"><img src="brand/crest.png" alt=""><span><b>Waxysplash</b><span>Waxys Phantoms · EA FC Pro Clubs</span></span></a><div class="sm-cols">${map}</div></footer><div class="socials">${links}</div>`);

  // ---------- live status ----------
  // Is he live? The bot API knows (Twitch stream status); while it can't say, an open queue means a Pro Clubs stream is on.
  let statusText = "";
  function syncStatus() { const m = document.getElementById("nvStatusM"); if (m && statusText) { m.textContent = statusText; m.classList.toggle("on", !!window.__waxyLive); } }
  const status = fetch(API + "bot/status?channel=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const queue = fetch(API + "queue", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  window.WAXY_LIVE = Promise.all([status, queue]).then(([s, q]) => {
    const live = s.live === true || (s.live === undefined && !!(q && q.open));
    window.__waxyLive = live;
    const out = { ...s, live, queue: q };
    const pill = document.getElementById("barLive");
    const st = document.getElementById("nvStatus");
    if (live) {
      pill.classList.add("on");
      pill.querySelector("span").textContent = "Live now";
      pill.title = s.title || "Live on Twitch";
      statusText = `Live now${s.viewers ? ` · ${s.viewers} watching` : ""}`;
      document.getElementById("dot-watch").hidden = false;
      const tb = document.getElementById("tb-watch"); tb.hidden = false; tb.classList.add("live");
      const tw = document.getElementById("navTwitch"); if (tw) tw.classList.add("hot");
    } else {
      pill.querySelector("span").textContent = "Twitch";
      statusText = s.next && s.next.start ? `Next stream ${new Date(s.next.start).toLocaleDateString(undefined, { weekday: "short" })} ${new Date(s.next.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "Offline right now";
    }
    if (st) { st.textContent = statusText; st.classList.toggle("on", live); }
    syncStatus();
    if (q && q.open) {
      const n = q.waiting.length;
      document.getElementById("dot-play").hidden = false;
      const tb = document.getElementById("tb-play"); tb.hidden = false; tb.textContent = n > 99 ? "99+" : n || "!";
      const j = document.getElementById("barJoin"); j.classList.add("open"); j.querySelector("span").textContent = `!join · ${n} waiting`;
    }
    return out;
  });

  // ---------- fade-in on scroll ----------
  // Content is visible without JS or with reduced motion (see styles.css).
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" }) : null;
  window.WAXY_REVEAL = (root) => (root || document).querySelectorAll(".rv:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  window.WAXY_REVEAL();
})();
