import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Cell } from "./engine";
import {
  currentLegalMoves,
  isPerfect,
  newGame,
  resetGame,
  score,
  tryMove,
  undoMove,
  type GameState,
} from "./game";
import { customSettings, type Settings } from "./difficulty";
import { difficultyScore, hint } from "./analysis";
import { CATALOG_SIZE, getCatalog, type CatalogPuzzle } from "./catalog";
import CatalogView from "./CatalogView";
import {
  defaultStorage,
  loadSolved,
  perfectCount,
  recordSolved,
  solvedCount,
  type SolvedMap,
} from "./storage";

// Evidence surface: the smoke gate asserts against window.__KP__, never pixels.
declare global {
  interface Window {
    __KP__?: Record<string, unknown>;
  }
}

// Desktop sizing — the board width is capped here and shrinks to fit narrow
// screens via min(92vw, …); cells are fluid (1fr + aspect-ratio), so the board
// scales with the chosen board size and never overflows.
const DESK_CELL = 56;
const GAP = 5;
const PAD = 12;
const SLIDE_MS = 180; // keep in sync with the .piece transition duration
const STEP_MS = 240; // View-Solution playback cadence (> SLIDE_MS so each slide settles)

type View = "catalog" | "play";

// How the active game was started: a catalog puzzle (number + stable id, which
// solved-tracking keys on) or a one-off random puzzle (number/id null → never
// tracked).
type Source = {
  n: number;
  steps: number;
  seed: number;
  number: number | null;
  id: string | null;
};

function sameCell(a: Cell, b: Cell): boolean {
  return a.r === b.r && a.c === b.c;
}

function cloneCell(c: Cell): Cell {
  return { r: c.r, c: c.c };
}

// App-side randomness only — the engine stays pure.
function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

function sourceFromCatalog(p: CatalogPuzzle): Source {
  return { n: p.n, steps: p.steps, seed: p.seed, number: p.number, id: p.id };
}

// A one-off random puzzle (the old "custom" path): the player's chosen board
// size + path length, a fresh random seed. Untracked (number/id null).
function randomSource(settings: Settings): Source {
  return {
    n: settings.n,
    steps: settings.steps,
    seed: randomSeed(),
    number: null,
    id: null,
  };
}

// The trail's single animating segment: "draw" (a move) grows it from `from` to
// `to`; "erase" (an undo) retracts it the same way, both synced to the slide.
type ActiveSeg = { from: Cell; to: Cell; dir: "draw" | "erase"; id: number };

export default function App() {
  const [view, setView] = useState<View>("catalog");
  const [source, setSource] = useState<Source>(() =>
    sourceFromCatalog(getCatalog()[0]),
  );
  const [game, setGame] = useState<GameState>(() => {
    const s = getCatalog()[0];
    return newGame(s.n, s.steps, s.seed);
  });
  // Bumped on "jump" actions (load puzzle / retry) to re-key the piece so it
  // SNAPS to the start instead of sliding. Moves/undo keep the same gen, so the
  // piece slides.
  const [gen, setGen] = useState(0);

  // Solved-tracking (localStorage, best-effort). Probed once; if unavailable the
  // game stays fully playable, just untracked. Random puzzles are never saved.
  const storage = useMemo(() => defaultStorage(), []);
  const [solved, setSolved] = useState<SolvedMap>(() => loadSolved(storage));

  // "View Solution" playback: solutionShown = preview active (board inert);
  // solving = the step timers are still running. Recording lives in the click
  // handler, so playback NEVER marks the puzzle solved.
  const [solutionShown, setSolutionShown] = useState(false);
  const [solving, setSolving] = useState(false);
  // Whether the player has asked for a hint on the current position.
  const [hintShown, setHintShown] = useState(false);
  // Board-size + path-length knobs for the "Generate random puzzle" option,
  // remembered so the play-view "New random puzzle" reuses them.
  const [randomSettings, setRandomSettings] = useState<Settings>(() =>
    customSettings(6, 12),
  );
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearPlayback = useCallback(() => {
    for (const id of playTimers.current) clearTimeout(id);
    playTimers.current = [];
  }, []);
  useEffect(() => clearPlayback, [clearPlayback]); // clear pending timers on unmount

  // The trail is split into a SETTLED polyline (fully drawn) plus one ACTIVE
  // segment that animates in sync with the knight's slide: a move DRAWS the new
  // segment, an undo ERASES the removed one. A snap (gen change) updates
  // instantly with no animation.
  const [settledVisited, setSettledVisited] = useState<Cell[]>(
    () => game.visited,
  );
  const [active, setActive] = useState<ActiveSeg | null>(null);
  const prevVisited = useRef<Cell[]>(game.visited);
  const prevGen = useRef(gen);
  const activeId = useRef(0);
  useEffect(() => {
    const cur = game.visited;
    const prev = prevVisited.current;
    const genChanged = gen !== prevGen.current;
    prevVisited.current = cur;
    prevGen.current = gen;

    if (genChanged) {
      setSettledVisited(cur);
      setActive(null);
      return;
    }
    if (cur.length > prev.length) {
      // move: settled stays behind; the new segment draws out to the knight.
      const id = ++activeId.current;
      setSettledVisited(prev);
      setActive({
        from: prev[prev.length - 1],
        to: cur[cur.length - 1],
        dir: "draw",
        id,
      });
      const t = setTimeout(() => {
        setSettledVisited(cur);
        setActive((a) => (a && a.id === id ? null : a));
      }, SLIDE_MS);
      return () => clearTimeout(t);
    }
    if (cur.length < prev.length) {
      // undo: settled drops immediately; the removed segment erases back.
      const id = ++activeId.current;
      setSettledVisited(cur);
      setActive({
        from: cur[cur.length - 1],
        to: prev[prev.length - 1],
        dir: "erase",
        id,
      });
      const t = setTimeout(() => {
        setActive((a) => (a && a.id === id ? null : a));
      }, SLIDE_MS);
      return () => clearTimeout(t);
    }
    setSettledVisited(cur);
    setActive(null);
  }, [game.visited, gen]);

  const legal = useMemo(() => currentLegalMoves(game), [game]);
  const totalCells = game.puzzle.path.length;
  // Witness-path branchiness (pure, no solver) — see src/analysis.ts.
  const diffScore = useMemo(() => difficultyScore(game.puzzle), [game.puzzle]);
  // The witness-only hint for the current position (always computed for the
  // evidence surface; only DISPLAYED when the player asks + not previewing).
  const currentHint = useMemo(() => hint(game), [game]);
  const canUndo = game.visited.length > 1;
  const scoreVal = score(game);
  const perfect = isPerfect(game);
  const stuck = !game.won && legal.length === 0;

  // Static, lightweight catalog summary for the evidence surface (computed once).
  const catalogSummary = useMemo(
    () =>
      getCatalog().map((p) => ({
        number: p.number,
        id: p.id,
        n: p.n,
        cells: p.cells,
        difficultyScore: p.difficultyScore,
      })),
    [],
  );

  // Publish serializable CLONES of authoritative state so external code (the
  // smoke gate) cannot mutate live React/game state by reference.
  useEffect(() => {
    window.__KP__ = {
      ready: true,
      view,
      catalogSize: CATALOG_SIZE,
      catalog: catalogSummary,
      puzzleNumber: source.number,
      puzzleId: source.id,
      seed: game.puzzle.seed,
      n: game.puzzle.n,
      steps: source.steps,
      start: cloneCell(game.puzzle.start),
      end: cloneCell(game.puzzle.end),
      knight: cloneCell(game.knight),
      visited: game.visited.map(cloneCell),
      visitedCount: game.visited.length,
      totalCells,
      total: totalCells,
      score: scoreVal,
      difficultyScore: diffScore,
      perfect,
      stuck,
      legalMoves: legal.map(cloneCell),
      solution: game.puzzle.path.map(cloneCell),
      won: game.won,
      solved: { ...solved },
      solvedCount: solvedCount(solved),
      perfectCount: perfectCount(solved),
      solutionShown,
      solving,
      hint: currentHint,
      hintShown,
      randomSettings: { n: randomSettings.n, steps: randomSettings.steps },
    };
  }, [
    view,
    source,
    game,
    legal,
    totalCells,
    scoreVal,
    diffScore,
    perfect,
    stuck,
    catalogSummary,
    solved,
    solutionShown,
    solving,
    currentHint,
    hintShown,
    randomSettings,
  ]);

  // Start a game from a source (catalog or random) and switch to the play view.
  const startSource = useCallback(
    (s: Source) => {
      clearPlayback();
      setSolutionShown(false);
      setSolving(false);
      setHintShown(false);
      setSource(s);
      setGame(newGame(s.n, s.steps, s.seed));
      setGen((g) => g + 1);
      setView("play");
    },
    [clearPlayback],
  );

  const handlePick = useCallback(
    (p: CatalogPuzzle) => startSource(sourceFromCatalog(p)),
    [startSource],
  );
  const handleRandom = useCallback(
    () => startSource(randomSource(randomSettings)),
    [startSource, randomSettings],
  );
  // Slider changes update the remembered random settings only (customSettings
  // clamps n into [MIN_N,MAX_N] and steps into [MIN_STEPS, maxSteps(n)], so
  // changing n re-clamps steps); they do NOT start a puzzle.
  const handleRandomN = useCallback(
    (n: number) => setRandomSettings((s) => customSettings(n, s.steps)),
    [],
  );
  const handleRandomSteps = useCallback(
    (steps: number) => setRandomSettings((s) => customSettings(s.n, steps)),
    [],
  );
  const handleBack = useCallback(() => {
    clearPlayback();
    setSolutionShown(false);
    setSolving(false);
    setHintShown(false);
    setView("catalog");
  }, [clearPlayback]);

  // Retry snaps the piece back to start (re-key), so it does NOT slide. Also
  // exits a solution preview back to normal play.
  const handleRetry = useCallback(() => {
    clearPlayback();
    setSolutionShown(false);
    setSolving(false);
    setHintShown(false);
    setGame((g) => resetGame(g));
    setGen((g) => g + 1);
  }, [clearPlayback]);
  // Undo keeps the same gen, so the piece slides back one step.
  const handleUndo = useCallback(() => {
    setHintShown(false);
    setGame((g) => undoMove(g));
  }, []);
  // Reveal the hint for the current position (cleared by any move/undo/etc.).
  const handleHint = useCallback(() => setHintShown(true), []);

  // Reveal the witness solution: reset to the start, then step the knight along
  // puzzle.path on a timer (the existing slide animates each hop). The board is
  // inert while shown, and because this never goes through handleCellClick the
  // puzzle is NOT marked solved.
  const handleViewSolution = useCallback(() => {
    clearPlayback();
    const path = game.puzzle.path;
    setHintShown(false);
    setSolutionShown(true);
    setSolving(true);
    setGame((g) => resetGame(g));
    setGen((g) => g + 1);
    for (let i = 1; i < path.length; i++) {
      const id = setTimeout(() => {
        setGame((g) => tryMove(g, path[i]));
      }, i * STEP_MS);
      playTimers.current.push(id);
    }
    const doneId = setTimeout(
      () => setSolving(false),
      path.length * STEP_MS + 60,
    );
    playTimers.current.push(doneId);
  }, [game.puzzle, clearPlayback]);
  // A move is the ONLY way to win, so record a catalog win right here (sticky
  // perfect). Random puzzles (source.id null) are a no-op inside recordSolved.
  // Keeping this out of the play loop also means "View Solution" playback (6e)
  // can advance the board WITHOUT marking the puzzle solved.
  const handleCellClick = useCallback(
    (cell: Cell) => {
      if (solutionShown) return; // board inert while previewing the solution
      const next = tryMove(game, cell);
      if (next === game) return; // illegal / no-op
      setHintShown(false); // a move answers the current hint
      setGame(next);
      if (next.won && source.id) {
        setSolved((cur) =>
          recordSolved(storage, cur, source.id, isPerfect(next)),
        );
      }
    },
    [game, source, storage, solutionShown],
  );

  const legalKeys = useMemo(
    () =>
      solutionShown
        ? new Set<string>()
        : new Set(legal.map((m) => `${m.r}-${m.c}`)),
    [legal, solutionShown],
  );

  // The hint is only DISPLAYED when asked and not while previewing a solution.
  const activeHint = hintShown && !solutionShown ? currentHint : null;
  const hintKey =
    activeHint?.status === "prefix"
      ? `${activeHint.nextCell.r}-${activeHint.nextCell.c}`
      : null;
  const visitedKeys = useMemo(
    () => new Set(game.visited.map((v) => `${v.r}-${v.c}`)),
    [game.visited],
  );

  const { puzzle, knight, won } = game;
  const maxBoardPx = puzzle.n * DESK_CELL + (puzzle.n - 1) * GAP + 2 * PAD;
  const isRandom = source.number == null;

  return (
    <main>
      <h1>Knight&rsquo;s Puzzle</h1>

      {view === "catalog" ? (
        <CatalogView
          onPick={handlePick}
          onRandom={handleRandom}
          onRandomN={handleRandomN}
          onRandomSteps={handleRandomSteps}
          randomSettings={randomSettings}
          solved={solved}
        />
      ) : (
        <>
          <div className="play-head">
            <button type="button" className="btn back" onClick={handleBack}>
              ← All puzzles
            </button>
            <span className="puzzle-label">
              {isRandom ? "Random puzzle" : `Puzzle #${source.number}`}
            </span>
          </div>

          <p className="status" role="status">
            Score {scoreVal} / {totalCells}
            <span className="status-sep" aria-hidden="true">
              ·
            </span>
            <span className="diff-score">
              Difficulty {diffScore.toLocaleString()}
            </span>
          </p>

          <div className="board-wrap">
            <div
              className={`board${solutionShown ? " inert" : ""}`}
              style={{
                gridTemplateColumns: `repeat(${puzzle.n}, 1fr)`,
                width: `min(92vw, ${maxBoardPx}px)`,
              }}
            >
              {puzzle.available.flatMap((row, r) =>
                row.map((avail, c) => {
                  const k = `${r}-${c}`;
                  const dark = (r + c) % 2 === 1;

                  // Blocked squares keep the checkerboard pattern but are dimmed
                  // and inert — availability stays the dominant signal.
                  if (!avail) {
                    return (
                      <div
                        key={k}
                        className={`cell sq ${dark ? "dark" : "light"} blocked`}
                        aria-hidden="true"
                      />
                    );
                  }

                  const cell = { r, c };
                  const isStart = sameCell(puzzle.start, cell);
                  const isEnd = sameCell(puzzle.end, cell);
                  const isLegal = legalKeys.has(k);
                  const isVisited = visitedKeys.has(k);
                  const className = [
                    "cell",
                    "sq",
                    dark ? "dark" : "light",
                    "open",
                    isVisited ? "visited" : "",
                    isLegal ? "legal" : "",
                    isEnd ? "goal" : "",
                    k === hintKey ? "hinted" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={k}
                      type="button"
                      data-cell={k}
                      className={className}
                      onClick={() => handleCellClick(cell)}
                      aria-label={`square ${r},${c}${isEnd ? " (goal)" : isStart ? " (start)" : ""}`}
                    >
                      <span className="glyph">
                        {isEnd ? "🏁" : isStart ? "◎" : ""}
                      </span>
                    </button>
                  );
                }),
              )}
            </div>

            {/* Edges tracing the knight's route so far. */}
            <svg
              className="trail"
              viewBox={`0 0 ${puzzle.n} ${puzzle.n}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {settledVisited.length > 1 && (
                <polyline
                  className="trail-line"
                  points={settledVisited
                    .map((v) => `${v.c + 0.5},${v.r + 0.5}`)
                    .join(" ")}
                />
              )}
              {active && (
                <line
                  key={active.id}
                  className={`trail-line trail-${active.dir}`}
                  pathLength={1}
                  x1={active.from.c + 0.5}
                  y1={active.from.r + 0.5}
                  x2={active.to.c + 0.5}
                  y2={active.to.r + 0.5}
                />
              )}
            </svg>

            {/* The knight, as a single overlay piece that SLIDES between squares. */}
            <div
              className="piece-layer"
              style={{ "--n": puzzle.n } as React.CSSProperties}
              aria-hidden="true"
            >
              <span
                key={gen}
                className="piece"
                style={{
                  left: `${((knight.c + 0.5) / puzzle.n) * 100}%`,
                  top: `${((knight.r + 0.5) / puzzle.n) * 100}%`,
                }}
              >
                ♞
              </span>
            </div>
          </div>

          {won && !solutionShown && (
            <div className="win-panel" role="status">
              <span className="win-text">
                {perfect
                  ? `Perfect! ${scoreVal}/${totalCells} 🎉`
                  : `Reached the goal! ${scoreVal}/${totalCells}`}
              </span>
              {!perfect && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleRetry}
                >
                  Retry for a better score
                </button>
              )}
            </div>
          )}

          {solutionShown && (
            <p className="solution-note" role="status">
              {solving
                ? "Playing the solution…"
                : "That’s the full solution — Retry to play it yourself."}
            </p>
          )}

          {activeHint && (
            <p
              className={`hint-note${activeHint.status === "off_path" ? " off" : ""}`}
              role="status"
            >
              {activeHint.status === "prefix"
                ? "Hint: hop to the glowing square."
                : "You’ve strayed from the solution this puzzle was built around — Undo or Retry to get back on it."}
            </p>
          )}

          {stuck && (
            <p className="stuck-note" role="status">
              No moves left — <strong>Undo</strong> a step,{" "}
              <strong>Retry</strong> this board, or pick another puzzle.
            </p>
          )}

          <div className="controls">
            {isRandom && (
              <button
                type="button"
                className="btn primary"
                onClick={handleRandom}
              >
                New random puzzle
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={handleHint}
              disabled={won || solutionShown}
            >
              Hint
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleViewSolution}
              disabled={solutionShown}
            >
              View solution
            </button>
            <button type="button" className="btn" onClick={handleRetry}>
              Retry
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleUndo}
              disabled={!canUndo || solutionShown}
            >
              Undo
            </button>
          </div>

          <p className="hint">
            Click a highlighted square to move the knight. It can only land on a
            square it hasn&rsquo;t visited yet. Stuck? <strong>Undo</strong> a
            step, <strong>Retry</strong> the board, or go back to the list.
          </p>
        </>
      )}
    </main>
  );
}
