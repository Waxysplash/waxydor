// Renders the Twitch panel headers (320x100, exported at 2x) into brand/panels/*.png.
// Run: node scripts/panels.mjs   (needs: npm install)
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
GlobalFonts.registerFromPath(join(ROOT, "brand/fonts/BarlowCondensed-ExtraBold.ttf"), "Barlow Condensed");
GlobalFonts.registerFromPath(join(ROOT, "brand/fonts/Barlow-Bold.ttf"), "Barlow");

export const PANELS = [
  { id: "about", kicker: "Who", title: "About the captain" },
  { id: "club", kicker: "!club", title: "Join the club" },
  { id: "waxydor", kicker: "The race", title: "Waxy d'Or" },
  { id: "schedule", kicker: "When", title: "Matchdays" },
  { id: "commands", kicker: "Chat", title: "Commands" },
  { id: "rules", kicker: "Fair play", title: "House rules" },
  { id: "socials", kicker: "Off the pitch", title: "Socials" },
];

function spaced(x, text, startX, y, px) {
  // Manual letter-spacing: node canvas has no letterSpacing property on every version.
  let cx = startX;
  for (const ch of text) { x.fillText(ch, cx, y); cx += x.measureText(ch).width + px; }
}

export function draw(p, dpr = 2) {
  const c = createCanvas(320 * dpr, 100 * dpr);
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  const g = x.createLinearGradient(0, 0, 320, 100); g.addColorStop(0, "#1a1230"); g.addColorStop(1, "#0b0912"); x.fillStyle = g; x.fillRect(0, 0, 320, 100);
  const glow = x.createRadialGradient(40, 20, 0, 40, 20, 160); glow.addColorStop(0, "rgba(169,112,255,.45)"); glow.addColorStop(1, "rgba(169,112,255,0)"); x.fillStyle = glow; x.fillRect(0, 0, 320, 100);
  x.save(); x.globalAlpha = .06; x.strokeStyle = "#fff"; x.lineWidth = 2; for (let i = -100; i < 420; i += 28) { x.beginPath(); x.moveTo(i, 100); x.lineTo(i + 60, 0); x.stroke(); } x.restore();
  x.save(); x.translate(246, 0); x.beginPath(); x.moveTo(40, 0); x.lineTo(74, 0); x.lineTo(34, 100); x.lineTo(0, 100); x.closePath(); x.fillStyle = "rgba(169,112,255,.18)"; x.fill(); x.restore();
  x.fillStyle = "#f2c94c"; x.fillRect(16, 22, 4, 56);
  x.fillStyle = "#a970ff"; x.font = '700 12px "Barlow"'; spaced(x, p.kicker.toUpperCase(), 30, 36, 3);
  x.fillStyle = "#f5f1ff"; x.font = '800 36px "Barlow Condensed"'; spaced(x, p.title.toUpperCase(), 30, 74, 0.5);
  x.fillStyle = "rgba(166,151,194,.9)"; x.font = '700 10px "Barlow"';
  const tag = "WAXYS PHANTOMS"; const w = [...tag].reduce((t, ch) => t + x.measureText(ch).width + 2, 0);
  spaced(x, tag, 304 - w, 92, 2);
  return c;
}

const out = join(ROOT, "brand/panels"); mkdirSync(out, { recursive: true });
for (const p of PANELS) { writeFileSync(join(out, `panel-${p.id}.png`), draw(p).toBuffer("image/png")); console.log("wrote", p.id); }
