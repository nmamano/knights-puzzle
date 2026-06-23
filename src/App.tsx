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
import { maxSteps, MAX_N, MIN_N, MIN_STEPS } from "./difficulty";
import { difficultyScore } from "./analysis";
import { CATALOG_SIZE, getCatalog, type CatalogPuzzle } from "./catalog";
import CatalogView from "./CatalogView";

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

// A one-off random puzzle (the old "custom" path): random board size + path
// length, kept playable by hand. Untracked.
function randomSource(): Source {
  const n = MIN_N + Math.floor(Math.random() * (MAX_N - MIN_N + 1)); // 4..9
  const hi = maxSteps(n);
  const lo = Math.max(MIN_STEPS, n);
  const top = Math.max(lo, Math.min(hi, 30));
  const steps = lo + Math.floor(Math.random() * (top - lo + 1));
  return { n, steps, seed: randomSeed(), number: null, id: null };
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
  ]);

  // Start a game from a source (catalog or random) and switch to the play view.
  const startSource = useCallback((s: Source) => {
    setSource(s);
    setGame(newGame(s.n, s.steps, s.seed));
    setGen((g) => g + 1);
    setView("play");
  }, []);

  const handlePick = useCallback(
    (p: CatalogPuzzle) => startSource(sourceFromCatalog(p)),
    [startSource],
  );
  const handleRandom = useCallback(
    () => startSource(randomSource()),
    [startSource],
  );
  const handleBack = useCallback(() => setView("catalog"), []);

  // Retry snaps the piece back to start (re-key), so it does NOT slide.
  const handleRetry = useCallback(() => {
    setGame((g) => resetGame(g));
    setGen((g) => g + 1);
  }, []);
  // Undo keeps the same gen, so the piece slides back one step.
  const handleUndo = useCallback(() => setGame((g) => undoMove(g)), []);
  const handleCellClick = useCallback(
    (cell: Cell) => setGame((g) => tryMove(g, cell)),
    [],
  );

  const legalKeys = useMemo(
    () => new Set(legal.map((m) => `${m.r}-${m.c}`)),
    [legal],
  );
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
        <CatalogView onPick={handlePick} onRandom={handleRandom} />
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
              className="board"
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

          {won && (
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
            <button type="button" className="btn" onClick={handleRetry}>
              Retry
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleUndo}
              disabled={!canUndo}
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
