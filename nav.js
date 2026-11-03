// The site's one navigation bar, shared by every public page so the links, their order and the
// "you are here" mark can never drift apart. It goes straight under the red header.
(function () {
  const PAGES = [
    ["./", "Waxy d'Or", ["", "index.html"]],
    ["card.html", "Player cards", ["card.html"]],
    ["queue.html", "Play with us", ["queue.html"]],
    ["clips.html", "Waxyclips", ["clips.html"]],
    ["vote.html", "Fan vote", ["vote.html"]],
  ];
  const here = location.pathname.split("/").pop();
  const header = document.querySelector("header.top");
  if (!header) return;
  const nav = document.createElement("nav");
  nav.className = "site-nav";
  nav.setAttribute("aria-label", "Site");
  nav.innerHTML = PAGES.map(([href, label, files]) =>
    `<a href="${href}"${files.includes(here) ? ' aria-current="page"' : ""}${href === "queue.html" ? ' id="navQueue"' : ""}>${label}</a>`).join("") +
    `<a class="twitch" href="https://twitch.tv/waxysplash" target="_blank" rel="noopener">Watch on Twitch ↗</a>`;
  header.after(nav);
  // Socials at the foot of the page, Discord first (it's where viewers stick around between streams).
  const socials = document.createElement("div");
  socials.className = "socials";
  socials.innerHTML = [
    ["https://discord.gg/5Uu3nVP", "Discord"],
    ["https://twitch.tv/waxysplash", "Twitch"],
    ["https://www.tiktok.com/@waxysplash", "TikTok"],
    ["https://www.instagram.com/TTVWaxysplash", "Instagram"],
    ["https://x.com/WaxySplash", "X"],
  ].map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`).join("");
  (document.querySelector(".wrap") || document.body).appendChild(socials);
  // The crest and club name take you home from anywhere, the homepage included.
  for (const el of [header.querySelector(".crest"), header.querySelector(".brand h1")]) {
    if (!el || el.closest("a")) continue;
    const a = document.createElement("a");
    a.href = "./"; a.className = "home-link"; a.setAttribute("aria-label", "Waxy Splash home");
    el.replaceWith(a); a.appendChild(el);
  }
  // A small live dot on "Play with us" while the queue is open.
  fetch("https://waxydor-vote-api.vercel.app/api/queue", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((q) => { if (q && q.open) document.getElementById("navQueue").insertAdjacentHTML("beforeend", ' <span class="live">LIVE</span>'); })
    .catch(() => {});
})();
