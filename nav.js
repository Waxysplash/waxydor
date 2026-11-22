// The site's top bar, shared by every public page so the links, their order and the "you are here" mark can never drift apart.
// Crest + name on the left, the pages, and a live pill on the right that turns red while Waxysplash is live on Twitch.
// It also puts the socials at the foot of the page and fades sections in as you scroll (anything with class "rv").
(function () {
  const PAGES = [
    ["./", "Waxy d'Or", ["", "index.html"]],
    ["card.html", "Player cards", ["card.html"]],
    ["legends.html", "Legends", ["legends.html"]],
    ["rtg.html", "Road to Glory", ["rtg.html"]],
    ["queue.html", "Play with us", ["queue.html"]],
    ["clips.html", "Waxyclips", ["clips.html"]],
    ["vote.html", "Fan vote", ["vote.html"]],
  ];
  const API = "https://waxydor-vote-api.vercel.app/api/";
  const here = location.pathname.split("/").pop();
  if (document.body.classList.contains("obs")) return;

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.innerHTML = `<div class="bar-in">
      <a class="bar-home" href="./" aria-label="Waxysplash home"><img src="brand/crest.png" alt=""><b>Waxys Phantoms</b></a>
      <nav aria-label="Site">${PAGES.map(([href, label, files]) =>
        `<a href="${href}"${files.includes(here) ? ' aria-current="page"' : ""}${href === "queue.html" ? ' id="navQueue"' : ""}>${label}</a>`).join("")}</nav>
      <a class="bar-live" id="barLive" href="https://twitch.tv/waxysplash" target="_blank" rel="noopener"><i></i><span>Twitch</span></a>
    </div>`;
  document.body.prepend(bar);

  // Socials at the foot of every page, Discord first (it's where viewers stick around between streams).
  const links = [
    ["https://discord.gg/5Uu3nVP", "Discord"],
    ["https://twitch.tv/waxysplash", "Twitch"],
    ["https://www.tiktok.com/@waxysplash", "TikTok"],
    ["https://www.instagram.com/TTVWaxysplash", "Instagram"],
    ["https://x.com/WaxySplash", "X"],
  ].map(([href, label]) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`).join("");
  const wrap = document.querySelector(".wrap") || document.body;
  wrap.insertAdjacentHTML("beforeend", `<div class="socials">${links}</div><div class="site-foot">Waxysplash · Waxys Phantoms · EA FC Pro Clubs</div>`);

  // Is he live? The bot API knows (Twitch stream status); while it can't say, an open queue means a Pro Clubs stream is on.
  const status = fetch(API + "bot/status?channel=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const queue = fetch(API + "queue", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  window.WAXY_LIVE = Promise.all([status, queue]).then(([s, q]) => {
    const live = s.live === true || (s.live === undefined && !!(q && q.open));
    const out = { ...s, live, queue: q };
    const pill = document.getElementById("barLive");
    if (live) {
      pill.classList.add("on");
      pill.querySelector("span").textContent = "Live now";
      pill.title = s.title || "Live on Twitch";
    } else pill.querySelector("span").textContent = "Twitch";
    if (q && q.open) document.getElementById("navQueue")?.insertAdjacentHTML("beforeend", '<span class="live" title="Queue open"></span>');
    return out;
  });

  // Fade-in on scroll. Content is visible without JS or with reduced motion (see styles.css).
  const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -8% 0px" }) : null;
  window.WAXY_REVEAL = (root) => (root || document).querySelectorAll(".rv:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));
  window.WAXY_REVEAL();
})();
