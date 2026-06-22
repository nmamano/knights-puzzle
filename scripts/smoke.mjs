// Real-browser smoke gate.
// Drives the REAL app in headless system Chrome (channel: "chrome") and judges
// by the evidence surface (window.__KP__), never by pixels/DOM appearance.
//
// Reserved port: 4317 (strictPort — fails loudly if taken, never clobbers a
// live dev server). Self-contained: starts its own Vite dev server, runs the
// checks, tears everything down.
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

  // Load the real app.
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Judge via evidence surface, not pixels.
  await page.waitForFunction(
    () => window.__KP__ && window.__KP__.ready === true,
    {
      timeout: 10000,
    },
  );

  const title = await page.title();
  const heading = await page.locator("h1").first().innerText();

  if (pageErrors.length) {
    throw new Error("pageerrors: " + pageErrors.join("; "));
  }

  console.log(
    JSON.stringify(
      { ok: true, title, heading, chrome: browser.version() },
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
