// GET /api/queue — the live Pro Clubs queue for the site's queue page and OBS. Twitch names, EA names and
// positions only; nothing private.
import { cors } from "../lib/shared.js";
import { load, publicView } from "../lib/queue.js";

let cfg = { at: 0, rules: {} };
async function rules() {
  if (Date.now() - cfg.at > 60_000) {
    const r = await fetch("https://raw.githubusercontent.com/Waxysplash/waxydor/main/data/config.json?t=" + Math.floor(Date.now() / 60_000));
    if (r.ok) cfg = { at: Date.now(), rules: (await r.json()).queue || {} };
  }
  return cfg.rules;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const [s, r] = await Promise.all([load(), rules()]);
  res.setHeader("Cache-Control", "no-store");
  return res.json(publicView(s, r));
}
