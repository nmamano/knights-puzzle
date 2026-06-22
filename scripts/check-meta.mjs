// Meta / social-asset probe (diff-gate evidence). Separate from the gameplay
// smoke. Verifies index.html has the required tags and that the promo images
// have the right pixel dimensions (parsed from the PNG header, not file size).
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");

// Substrings chosen to survive prettier's attribute-per-line wrapping.
const required = [
  "<title>Knight's Puzzle</title>",
  'name="theme-color"',
  "#86c46a",
  'rel="icon"',
  "/favicon.svg",
  "/favicon-64.png",
  'rel="apple-touch-icon"',
  "/apple-touch-icon.png",
  'property="og:title"',
  'property="og:type"',
  'content="https://knight.nilmamano.com"',
  'content="https://knight.nilmamano.com/og.png"',
  'property="og:image:width"',
  'name="twitter:card"',
  "summary_large_image",
];

let ok = true;
for (const s of required) {
  if (!html.includes(s)) {
    console.error("MISSING in index.html:", s);
    ok = false;
  }
}

function pngDims(path) {
  const d = readFileSync(path);
  if (d.toString("ascii", 1, 4) !== "PNG") throw new Error(path + " not a PNG");
  return [d.readUInt32BE(16), d.readUInt32BE(20)];
}

const images = [
  ["public/og.png", 1200, 630],
  ["public/games-card.png", 2400, 1260],
  ["public/favicon-64.png", 64, 64],
  ["public/apple-touch-icon.png", 180, 180],
];
const dims = {};
for (const [path, w, h] of images) {
  try {
    const [aw, ah] = pngDims(path);
    dims[path] = `${aw}x${ah}`;
    if (aw !== w || ah !== h) {
      console.error(`DIMS ${path}: ${aw}x${ah}, expected ${w}x${h}`);
      ok = false;
    }
  } catch (e) {
    console.error(e.message);
    ok = false;
  }
}

// favicon.svg must exist too.
try {
  readFileSync("public/favicon.svg");
} catch {
  console.error("MISSING file: public/favicon.svg");
  ok = false;
}

if (ok) console.log(JSON.stringify({ ok: true, dims }, null, 2));
else console.error("META CHECK FAILED");
process.exit(ok ? 0 : 1);
