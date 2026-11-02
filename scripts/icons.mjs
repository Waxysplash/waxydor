// Builds the site's small crest, browser icons and link-preview image from brand/logo.png.
// Run: node scripts/icons.mjs   (writes brand/crest.png, brand/icon-*.png, favicon.ico, brand/og.png)
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
GlobalFonts.registerFromPath(join(ROOT, "brand/fonts/BarlowCondensed-ExtraBold.ttf"), "Barlow Condensed");
GlobalFonts.registerFromPath(join(ROOT, "brand/fonts/Barlow-Bold.ttf"), "Barlow");
const C = { cream: "#e9dcbb", olive: "#2a2a1e", brass: "#b9985a", red: "#9d3a2b", gold: "#d9a63b" };
const crest = await loadImage(join(ROOT, "brand/logo.png"));
const out = (p, canvas) => writeFileSync(join(ROOT, p), canvas.toBuffer("image/png"));

// Crest scaled to fit a box, centred.
function draw(ctx, x, y, w, h) {
  const s = Math.min(w / crest.width, h / crest.height);
  ctx.drawImage(crest, x + (w - crest.width * s) / 2, y + (h - crest.height * s) / 2, crest.width * s, crest.height * s);
}

// 1. The crest the pages show (72 px tall, so 360 px covers high-DPI screens and the player-card watermark).
{
  const h = 360, w = Math.round((crest.width / crest.height) * h);
  const c = createCanvas(w, h); draw(c.getContext("2d"), 0, 0, w, h); out("brand/crest.png", c);
}

// 2. Square icons: transparent for the tab, cream tile for phones' home screens.
const square = (size, bg) => {
  const c = createCanvas(size, size), ctx = c.getContext("2d");
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
  const pad = bg ? size * 0.1 : 0;
  draw(ctx, pad, pad, size - 2 * pad, size - 2 * pad);
  return c;
};
out("brand/icon-32.png", square(32));
out("brand/icon-192.png", square(192, C.cream));
out("brand/apple-touch-icon.png", square(180, C.cream));
// favicon.ico holding one 32 px PNG (ICO allows PNG payloads), for browsers and crawlers that ask for /favicon.ico.
{
  const png = square(32).toBuffer("image/png");
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  writeFileSync(join(ROOT, "favicon.ico"), Buffer.concat([head, png]));
}

// 3. Link preview (Discord, X, iMessage, WhatsApp): 1200x630, olive with the crest and the club line.
{
  const c = createCanvas(1200, 630), ctx = c.getContext("2d");
  ctx.fillStyle = C.olive; ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = C.brass; ctx.lineWidth = 6; ctx.strokeRect(24, 24, 1152, 582);
  draw(ctx, 80, 95, 330, 440);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.gold; ctx.font = "34px Barlow"; ctx.fillText("WAXY SPLASH · EA FC PRO CLUBS", 470, 230);
  ctx.fillStyle = C.cream; ctx.font = "96px 'Barlow Condensed'"; ctx.fillText("WAXYS PHANTOMS", 468, 335);
  ctx.fillStyle = C.brass; ctx.font = "34px Barlow";
  ctx.fillText("Live on Twitch. Type !join and play with us.", 470, 420);
  ctx.fillText("Season table, awards and player cards.", 470, 468);
  out("brand/og.png", c);
}
console.log("crest, icons, favicon.ico and og.png written");
