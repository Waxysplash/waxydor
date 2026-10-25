// GET /api/alerts?after=<n> — new on-stream alerts for overlays/alerts.html, which asks every few seconds.
import { cors, fail } from "../lib/shared.js";
import { alertsSince } from "../lib/alerts.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.json(await alertsSince(req.query.after));
  } catch (e) {
    return fail(res, e);
  }
}
