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
  // The crest and club name take you home from anywhere.
  const crest = header.querySelector(".crest");
  if (crest && here !== "" && here !== "index.html") {
    const a = document.createElement("a");
    a.href = "./"; a.setAttribute("aria-label", "Waxy d'Or home");
    crest.replaceWith(a); a.appendChild(crest);
  }
  // A small live dot on "Play with us" while the queue is open.
  fetch("https://waxydor-vote-api.vercel.app/api/queue", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((q) => { if (q && q.open) document.getElementById("navQueue").insertAdjacentHTML("beforeend", ' <span class="live">LIVE</span>'); })
    .catch(() => {});
})();
