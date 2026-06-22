// Off-runtime asset generator (dev only — NOT shipped in the bundle).
// Renders the OG/social promo card + favicon PNGs with Playwright so they use
// the real Patrick Hand font + the game's palette. Outputs to OUT (default /tmp
// for iteration; pass "public" to write into public/).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const OUT = process.argv[2] === "public" ? "public" : "/tmp";
const fontB64 = readFileSync("public/fonts/PatrickHand-Regular.woff2").toString(
  "base64",
);

const PAL = {
  grass: "#86c46a",
  grassDk: "#79b85f",
  hedge: "#38492f",
  path: "#e8c892",
  ink: "#2b2640",
  accent: "#6c5cff",
};

// A hand-laid 5x5 mini board: which cells are playable (1) and the trail order.
const N = 5;
const blocked = new Set(["0-0", "0-4", "1-3", "3-0", "4-1", "4-4", "2-2"]);
const trail = [
  [3, 3],
  [1, 2],
  [0, 0 + 3],
  [2, 4],
  [4, 3],
  [3, 1],
  [1, 0],
];
const knight = trail[trail.length - 1];

function miniBoard() {
  let cells = "";
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const dark = (r + c) % 2 === 1;
      const isBlocked = blocked.has(`${r}-${c}`);
      const bg = isBlocked ? PAL.hedge : dark ? PAL.grassDk : PAL.grass;
      const onTrail = trail.some(([tr, tc]) => tr === r && tc === c);
      cells += `<div style="background:${bg};${
        isBlocked ? "box-shadow:inset 0 3px 7px rgba(0,0,0,.4);" : ""
      }${onTrail && !isBlocked ? `background:${PAL.path};` : ""}"></div>`;
    }
  }
  const pts = trail.map(([r, c]) => `${c + 0.5},${r + 0.5}`).join(" ");
  return `
    <div class="board">
      <div class="grid">${cells}</div>
      <svg class="trail" viewBox="0 0 ${N} ${N}" preserveAspectRatio="none">
        <polyline points="${pts}" fill="none" stroke="#fff" stroke-width="0.1"
          stroke-linejoin="round" stroke-linecap="round"
          style="filter:drop-shadow(0 0 1.2px rgba(20,28,14,.7))"/>
      </svg>
      <div class="knight" style="left:${((knight[1] + 0.5) / N) * 100}%;top:${
        ((knight[0] + 0.5) / N) * 100
      }%">♞</div>
    </div>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  @font-face{font-family:"Patrick Hand";src:url(data:font/woff2;base64,${fontB64}) format("woff2");font-weight:400;}
  *{box-sizing:border-box;margin:0;}
  .card{width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:72px;
    background:radial-gradient(1200px 700px at 18% -20%, #9bd472 0%, #7cbf5e 55%, #62a64c 100%);
    color:${PAL.ink};font-family:system-ui,sans-serif;}
  .left{flex:1;}
  .kicker{display:inline-block;background:${PAL.accent};color:#fff;font-weight:700;
    font-size:24px;padding:8px 18px;border-radius:999px;margin-bottom:22px;}
  h1{font-family:"Patrick Hand",cursive;font-size:108px;line-height:1;color:#28324a;margin-bottom:18px;}
  .tag{font-family:"Patrick Hand",cursive;font-size:40px;color:#33402a;max-width:520px;}
  .right{flex:0 0 auto;}
  .board{position:relative;width:340px;height:340px;padding:10px;background:#3d5a32;
    border:6px solid #2f4827;border-radius:18px;box-shadow:0 16px 36px rgba(20,40,15,.4);}
  .grid{display:grid;grid-template-columns:repeat(${N},1fr);grid-template-rows:repeat(${N},1fr);
    gap:2px;width:100%;height:100%;border-radius:10px;overflow:hidden;}
  .trail{position:absolute;inset:10px;width:calc(100% - 20px);height:calc(100% - 20px);}
  .knight{position:absolute;transform:translate(-50%,-55%);font-size:66px;color:#fff;
    -webkit-text-stroke:3px ${PAL.ink};text-shadow:0 2px 2px rgba(0,0,0,.35);}
</style></head>
<body><div class="card">
  <div class="left">
    <div class="kicker">knight.nilmamano.com</div>
    <h1>Knight&rsquo;s&nbsp;Puzzle</h1>
    <div class="tag">Hop the knight onto every square and finish on the flag.</div>
  </div>
  <div class="right">${miniBoard()}</div>
</div></body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
async function shot(file, scale) {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: scale,
  });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(150);
  await page.locator(".card").screenshot({ path: file });
  await page.close();
}
await shot(`${OUT}/og.png`, 1); // 1200x630 OG
await shot(`${OUT}/games-card.png`, 2); // 2400x1260 for the /games grid

// Favicon PNGs rasterized from favicon.svg.
const favSvg = readFileSync("public/favicon.svg", "utf8");
async function favicon(file, size) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0">${favSvg.replace("<svg", `<svg width="${size}" height="${size}"`)}</body>`,
    { waitUntil: "load" },
  );
  await page.waitForTimeout(60);
  await page.locator("svg").screenshot({ path: file, omitBackground: true });
  await page.close();
}
await favicon(`${OUT}/favicon-64.png`, 64);
await favicon(`${OUT}/apple-touch-icon.png`, 180);

await browser.close();
console.log("assets ->", OUT);
