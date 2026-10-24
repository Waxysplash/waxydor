// Renders the Twitch panel headers (320x100, exported at 2x) into brand/panels/*.png.
// Run: node scripts/panels.mjs   (needs: npm install)
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
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

// Colours from the Waxys Phantoms crest: olive outline, cream lettering, brick-red shield, brass trim, gold star.
const crest = await loadImage(join(ROOT, "brand/logo.png"));

export function draw(p, dpr = 2) {
  const c = createCanvas(320 * dpr, 100 * dpr);
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  const g = x.createLinearGradient(0, 0, 320, 100); g.addColorStop(0, "#2c2a1d"); g.addColorStop(1, "#15140d"); x.fillStyle = g; x.fillRect(0, 0, 320, 100);
  const glow = x.createRadialGradient(40, 20, 0, 40, 20, 160); glow.addColorStop(0, "rgba(157,58,43,.55)"); glow.addColorStop(1, "rgba(157,58,43,0)"); x.fillStyle = glow; x.fillRect(0, 0, 320, 100);
  x.save(); x.globalAlpha = .05; x.strokeStyle = "#e9dcbb"; x.lineWidth = 2; for (let i = -100; i < 420; i += 28) { x.beginPath(); x.moveTo(i, 100); x.lineTo(i + 60, 0); x.stroke(); } x.restore();
  // the crest on the right, where the old slash was
  const ch = 80, cw = ch * crest.width / crest.height;
  x.save(); x.shadowColor = "rgba(0,0,0,.55)"; x.shadowBlur = 8; x.shadowOffsetY = 3; x.drawImage(crest, 304 - cw, 10, cw, ch); x.restore();
  x.fillStyle = "#d9a63b"; x.fillRect(16, 22, 4, 56);
  x.fillStyle = "#c9a96a"; x.font = '700 12px "Barlow"'; spaced(x, p.kicker.toUpperCase(), 30, 36, 3);
  // Shrink long titles so they stop short of the crest.
  const title = p.title.toUpperCase(), room = 304 - cw - 12 - 30;
  let size = 36;
  const width = () => [...title].reduce((t, ch) => t + x.measureText(ch).width + 0.5, 0);
  do { x.font = `800 ${size}px "Barlow Condensed"`; } while (width() > room && --size > 18);
  x.fillStyle = "#e9dcbb"; spaced(x, title, 30, 74, 0.5);
  return c;
}

const out = join(ROOT, "brand/panels"); mkdirSync(out, { recursive: true });
for (const p of PANELS) { writeFileSync(join(out, `panel-${p.id}.png`), draw(p).toBuffer("image/png")); console.log("wrote", p.id); }
