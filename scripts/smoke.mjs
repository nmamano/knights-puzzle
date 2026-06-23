// Real-browser smoke gate — SOLVE-AND-JUDGE.
//
// Drives the REAL game in headless system Chrome (channel: "chrome"): it opens
// the catalog landing page, enters a puzzle, reads the witness solution from the
// evidence surface (window.__KP__.solution), then SOLVES by real clicks on
// [data-cell="r-c"] buttons, polling window.__KP__ after each click
// (click-and-verify — clicks race re-renders). Also exercises navigation back to
// the catalog and the "Generate random puzzle" path. The verdict comes from
// window.__KP__ (view / won / counts / puzzleNumber), never from pixels. Fails
// on any page error.
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

  // Load the real app and wait for the evidence surface on the CATALOG view.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => window.__KP__ && window.__KP__.ready === true,
    { timeout: 10000 },
  );

  const landing = await page.evaluate(() => window.__KP__);
  if (landing.view !== "catalog") {
    throw new Error(
      `expected to land on the catalog, got view=${landing.view}`,
    );
  }
  if (landing.catalogSize !== 99 || landing.catalog.length !== 99) {
    throw new Error(
      `catalog should have 99 entries, got ${landing.catalogSize}`,
    );
  }
  if (landing.solvedCount !== 0) {
    throw new Error(
      `expected 0 solved on a fresh load, got ${landing.solvedCount}`,
    );
  }

  // View Solution: enter a non-trivial puzzle, reveal the witness, and confirm
  // it plays all the way to the goal WITHOUT marking the puzzle solved.
  await page.click('[data-puzzle="50"]');
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return s && s.view === "play" && s.puzzleNumber === 50;
    },
    { timeout: 8000 },
  );
  await page.getByRole("button", { name: /view solution/i }).click();
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return (
        s &&
        s.solutionShown === true &&
        s.solving === false &&
        s.visitedCount === s.totalCells &&
        s.knight.r === s.end.r &&
        s.knight.c === s.end.c
      );
    },
    { timeout: 20000 },
  );
  const shown = await page.evaluate(() => window.__KP__);
  if (shown.solvedCount !== 0) {
    throw new Error("View Solution must NOT mark the puzzle solved");
  }
  // Retry exits the preview back to a fresh, playable board.
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return s && s.solutionShown === false && s.visitedCount === 1 && !s.won;
    },
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: /all puzzles/i }).click();
  await page.waitForFunction(
    () =>
      window.__KP__ &&
      window.__KP__.view === "catalog" &&
      window.__KP__.solvedCount === 0,
    { timeout: 5000 },
  );

  // Hint: on the witness prefix it points at the correct next cell; after a
  // wrong (off-witness) but legal move it reports off_path; Undo restores it.
  await page.click('[data-puzzle="5"]');
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return s && s.view === "play" && s.puzzleNumber === 5;
    },
    { timeout: 8000 },
  );
  const hStart = await page.evaluate(() => window.__KP__);
  if (!hStart.hint || hStart.hint.status !== "prefix") {
    throw new Error(
      `expected a prefix hint at the start, got ${hStart.hint && hStart.hint.status}`,
    );
  }
  if (
    hStart.hint.nextCell.r !== hStart.solution[1].r ||
    hStart.hint.nextCell.c !== hStart.solution[1].c
  ) {
    throw new Error("prefix hint did not point at the next witness cell");
  }
  // The Hint button reveals it (visual state on the surface).
  await page.getByRole("button", { name: "Hint", exact: true }).click();
  await page.waitForFunction(
    () => window.__KP__ && window.__KP__.hintShown === true,
    { timeout: 5000 },
  );
  // Make a wrong (off-witness) but legal move; the hint must flip to off_path.
  const wrong = hStart.legalMoves.find(
    (m) => m.r !== hStart.solution[1].r || m.c !== hStart.solution[1].c,
  );
  if (!wrong) throw new Error("puzzle #5 should branch at the start");
  await page.click(`[data-cell="${wrong.r}-${wrong.c}"]`);
  await page.waitForFunction(
    (t) => {
      const s = window.__KP__;
      return (
        s &&
        s.knight.r === t.r &&
        s.knight.c === t.c &&
        s.hint &&
        s.hint.status === "off_path"
      );
    },
    wrong,
    { timeout: 5000 },
  );
  // Undo restores the prefix hint.
  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return s && s.visitedCount === 1 && s.hint && s.hint.status === "prefix";
    },
    { timeout: 5000 },
  );
  await page.getByRole("button", { name: /all puzzles/i }).click();
  await page.waitForFunction(
    () =>
      window.__KP__ &&
      window.__KP__.view === "catalog" &&
      window.__KP__.solvedCount === 0,
    { timeout: 5000 },
  );

  // Enter catalog puzzle #1 (the easiest) and assert the play view loaded it.
  await page.click('[data-puzzle="1"]');
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return s && s.view === "play" && s.puzzleNumber === 1;
    },
    { timeout: 8000 },
  );

  const startState = await page.evaluate(() => window.__KP__);
  if (startState.won) throw new Error("puzzle started already won");
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

  // The win must be RECORDED for this catalog puzzle: wait for the solved count.
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return s && s.won && s.perfect && s.solvedCount === 1;
    },
    { timeout: 5000 },
  );
  const solved = await page.evaluate(() => window.__KP__);
  if (solved.score !== solved.total) {
    throw new Error(`covered ${solved.score}/${solved.total} squares`);
  }
  const solvedId = solved.puzzleId;
  const rec = solved.solved[solvedId];
  if (!rec || rec.bestScore !== solved.total || rec.total !== solved.total) {
    throw new Error(
      `catalog win not recorded with full best score: ${JSON.stringify(rec)}`,
    );
  }
  if (solved.perfectCount !== 1) {
    throw new Error(`expected perfectCount 1, got ${solved.perfectCount}`);
  }

  // "Next puzzle →" loads #N+1 (here #2) as a fresh game.
  await page.getByRole("button", { name: /next puzzle/i }).click();
  await page.waitForFunction(
    () => {
      const s = window.__KP__;
      return (
        s &&
        s.view === "play" &&
        s.puzzleNumber === 2 &&
        s.visitedCount === 1 &&
        !s.won
      );
    },
    { timeout: 8000 },
  );

  // Navigate back to the catalog; the solved count carries over.
  await page.getByRole("button", { name: /all puzzles/i }).click();
  await page.waitForFunction(
    () =>
      window.__KP__ &&
      window.__KP__.view === "catalog" &&
      window.__KP__.solvedCount === 1,
    { timeout: 5000 },
  );

  // Persistence: reload; localStorage must restore the solved state.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      window.__KP__ &&
      window.__KP__.ready === true &&
      window.__KP__.view === "catalog",
    { timeout: 10000 },
  );
  const reloaded = await page.evaluate(() => window.__KP__);
  if (reloaded.solvedCount !== 1) {
    throw new Error("solved state did not persist across reload");
  }
  const rrec = reloaded.solved[solvedId];
  if (!rrec || rrec.bestScore !== rrec.total) {
    throw new Error("perfect best-score did not persist across reload");
  }

  // Random-puzzle KNOBS: move the board-size slider to its max and confirm the
  // remembered random settings update (from the default 6).
  await page.getByLabel("Board size").focus();
  await page.keyboard.press("End");
  await page.waitForFunction(
    () =>
      window.__KP__ &&
      window.__KP__.randomSettings &&
      window.__KP__.randomSettings.n > 6,
    { timeout: 5000 },
  );
  const knob = await page.evaluate(() => window.__KP__.randomSettings);

  // "Generate random puzzle" loads an UNTRACKED random puzzle AT THE CHOSEN SIZE;
  // winning it must NOT change the solved count.
  await page.getByRole("button", { name: /generate random puzzle/i }).click();
  await page.waitForFunction(
    (k) => {
      const s = window.__KP__;
      return s && s.view === "play" && s.puzzleNumber === null && s.n === k.n;
    },
    knob,
    { timeout: 8000 },
  );
  const random = await page.evaluate(() => window.__KP__);
  if (random.puzzleId !== null) {
    throw new Error("random puzzle must have a null puzzleId (untracked)");
  }
  if (random.n !== knob.n || random.steps !== knob.steps) {
    throw new Error(
      `random puzzle ignored the knobs (got n=${random.n} steps=${random.steps}, want n=${knob.n} steps=${knob.steps})`,
    );
  }
  if (!Array.isArray(random.solution) || random.solution.length < 2) {
    throw new Error("random puzzle exposed no witness solution");
  }
  if (random.won) throw new Error("random puzzle started already won");

  // Solve the random puzzle via its witness, then confirm it stayed untracked.
  for (let i = 1; i < random.solution.length; i++) {
    const { r, c } = random.solution[i];
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
  await page.waitForFunction(
    () => window.__KP__ && window.__KP__.won === true,
    {
      timeout: 5000,
    },
  );
  await page.getByRole("button", { name: /all puzzles/i }).click();
  await page.waitForFunction(
    () => window.__KP__ && window.__KP__.view === "catalog",
    { timeout: 5000 },
  );
  const afterRandom = await page.evaluate(() => window.__KP__);
  if (afterRandom.solvedCount !== 1) {
    throw new Error(
      `random win must not be tracked (solvedCount=${afterRandom.solvedCount})`,
    );
  }

  if (pageErrors.length) {
    throw new Error("pageerrors: " + pageErrors.join("; "));
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        solvedPuzzle: solved.puzzleNumber,
        solvedId,
        score: solved.score,
        total: solved.total,
        perfect: solved.perfect,
        difficultyScore: solved.difficultyScore,
        persistedSolvedCount: reloaded.solvedCount,
        afterRandomSolvedCount: afterRandom.solvedCount,
        random: { puzzleNumber: random.puzzleNumber, n: random.n },
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
