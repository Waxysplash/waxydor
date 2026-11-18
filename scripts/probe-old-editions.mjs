// One-off: does EA's Pro Clubs service still answer for older editions (FC 26 and before)?
// Looks up "Waxys Phantoms" under each address and platform, and prints what comes back.
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", Accept: "application/json", Referer: "https://www.ea.com/" };
const name = encodeURIComponent("Waxys Phantoms");
const bases = ["fc", "fc26", "fc25", "fc24", "fifa", "fifa23", "fifa22"];
const platforms = ["common-gen5", "common-gen4", "ps5", "ps4", "xbox-series-xs", "xboxone", "pc", "nx"];
async function get(url) {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(15000) });
    const t = await r.text();
    return { status: r.status, body: t };
  } catch (e) { return { status: "ERR", body: String(e.message) }; }
}
for (const b of bases) {
  for (const p of platforms) {
    for (const path of [`allTimeLeaderboard/search?platform=${p}&clubName=${name}`, `clubs/search?platform=${p}&clubName=${name}`]) {
      const { status, body } = await get(`https://proclubs.ea.com/api/${b}/${path}`);
      let short = body.replace(/\s+/g, " ").slice(0, 400);
      if (/Access Denied/.test(body)) short = "Access Denied";
      console.log(`[${b}] ${path.split("?")[0]} ${p} -> ${status} ${short}`);
    }
  }
}
// The FC 27 club's own record, for comparison.
const cur = await get(`https://proclubs.ea.com/api/fc/clubs/info?platform=common-gen5&clubIds=392152`);
console.log(`[fc] clubs/info 392152 -> ${cur.status} ${cur.body.slice(0, 300)}`);
