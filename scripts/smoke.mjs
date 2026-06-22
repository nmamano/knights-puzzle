// Real-browser smoke gate — SOLVE-AND-JUDGE.
//
// Drives the REAL game in headless system Chrome (channel: "chrome"): it reads
// the witness solution from the evidence surface (window.__KP__.solution),
// then SOLVES the puzzle by real clicks on [data-cell="r-c"] buttons, polling
// window.__KP__.knight after each click (click-and-verify — clicks race
// re-renders). The verdict comes from window.__KP__ (won / counts), never from
// pixels. Fails on any page error.
//
// Reserved port: 4317 (strictPort — never clobbers a live dev server).
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 4317;
const URL = `http://localhost:${PORT}`;

function startServer() {
  const child = spawn(
    "./node_modules/.bin/vite",
    ["--port", String(PORT), "--strictPort"],
    { stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  child.on("exit", (code) => {
    if (code && code !== 0 && code !== null) {
      console.error("vite exited early:", code, stderr);
    }
  });
  return child;
}

async function waitForServer(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(URL);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("vite dev server did not come up on " + URL);
}

let server;
let browser;
let failed = false;
try {
  server = startServer();
  await waitForServer();

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // about:blank probe (proves the browser channel launches).
  await page.goto("about:blank");

  // Load the real app and wait for the evidence surface.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__KP__ && window.__KP__.ready === true,
    { timeout: 10000 },
  );

  const startState = await page.evaluate(() => window.__KP__);
  if (startState.won) throw new Error("game started already won");
  if (!Array.isArray(startState.solution) || startState.solution.length < 2) {
    throw new Error("no witness solution exposed on __KP__");
  }
  if (
    startState.knight.r !== startState.start.r ||
    startState.knight.c !== startState.start.c
  ) {
    throw new Error("knight did not begin on the start square");
  }

  const solution = startState.solution;

  // Undo round-trip: make the first move, Undo it, and confirm we are back at
  // the start (knight + visitedCount) before solving for real.
  const first = solution[1];
  await page.click(`[data-cell="${first.r}-${first.c}"]`);
  await page.waitForFunction(
    (t) => {
      const s = window.__KP__;
      return (
        s && s.knight.r === t.r && s.knight.c === t.c && s.visitedCount === 2
      );
    },
    first,
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(
    (st) => {
      const s = window.__KP__;
      return (
        s && s.knight.r === st.r && s.knight.c === st.c && s.visitedCount === 1
      );
    },
    startState.start,
    { timeout: 5000 },
  );

  // Solve by real clicks, verifying each move against the evidence surface.
  for (let i = 1; i < solution.length; i++) {
    const { r, c } = solution[i];
    await page.click(`[data-cell="${r}-${c}"]`);
    await page.waitForFunction(
      (target) => {
        const k = window.__KP__ && window.__KP__.knight;
        return k && k.r === target.r && k.c === target.c;
      },
      { r, c },
      { timeout: 5000 },
    );
  }

  const final = await page.evaluate(() => window.__KP__);
  if (pageErrors.length) {
    throw new Error("pageerrors: " + pageErrors.join("; "));
  }
  if (!final.won) throw new Error("did not win after following the solution");
  if (final.visitedCount !== final.totalCells) {
    throw new Error(`covered ${final.visitedCount}/${final.totalCells} cells`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        seed: final.seed,
        solvedCells: final.visitedCount,
        totalCells: final.totalCells,
        won: final.won,
        chrome: browser.version(),
      },
      null,
      2,
    ),
  );
} catch (err) {
  failed = true;
  console.error("SMOKE FAILED:", err?.message || err);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill("SIGTERM");
}
process.exit(failed ? 1 : 0);
