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
import {
  customSettings,
  maxSteps,
  MAX_N,
  MIN_N,
  MIN_STEPS,
  presetSettings,
  type DifficultyId,
  type Settings,
} from "./difficulty";
import { difficultyScore } from "./analysis";

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

const DIFFICULTIES: { id: DifficultyId; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "custom", label: "Custom" },
];

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

// The single trail segment currently animating: "draw" (a move) grows it from
// `from` to `to`; "erase" (an undo) retracts it the same way, both synced to
// the knight's slide.
type ActiveSeg = { from: Cell; to: Cell; dir: "draw" | "erase"; id: number };

export default function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    presetSettings("medium"),
  );
  const [game, setGame] = useState<GameState>(() => {
    const s = presetSettings("medium");
    return newGame(s.n, s.steps, randomSeed());
  });
  // Bumped on "jump" actions (new puzzle / retry / difficulty) to re-key the
  // piece so it SNAPS to the start instead of sliding. Moves/undo keep the same
  // gen, so the piece slides.
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

  // Publish serializable CLONES of authoritative state so external code (the
  // smoke gate) cannot mutate live React/game state by reference.
  useEffect(() => {
    window.__KP__ = {
      ready: true,
      seed: game.puzzle.seed,
      n: game.puzzle.n,
      steps: settings.steps,
      difficulty: { id: settings.id, n: settings.n, steps: settings.steps },
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
  }, [game, legal, totalCells, settings, scoreVal, diffScore, perfect, stuck]);

  // Apply new settings AND regenerate a puzzle with a fresh seed (snap, no slide).
  const regenerate = useCallback((s: Settings) => {
    setSettings(s);
    setGame(newGame(s.n, s.steps, randomSeed()));
    setGen((g) => g + 1);
  }, []);

  const handleDifficulty = useCallback(
    (id: DifficultyId) => {
      if (id === "custom") {
        regenerate(customSettings(settings.n, settings.steps));
      } else {
        regenerate(presetSettings(id));
      }
    },
    [regenerate, settings.n, settings.steps],
  );

  const handleCustomN = useCallback(
    (n: number) => regenerate(customSettings(n, settings.steps)),
    [regenerate, settings.steps],
  );

  const handleCustomSteps = useCallback(
    (steps: number) => regenerate(customSettings(settings.n, steps)),
    [regenerate, settings.n],
  );

  const handleNewPuzzle = useCallback(() => {
    setGame(newGame(settings.n, settings.steps, randomSeed()));
    setGen((g) => g + 1);
  }, [settings.n, settings.steps]);

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

  return (
    <main>
      <h1>Knight&rsquo;s Puzzle</h1>
      <p className="tagline">
        Hop the knight onto every square and finish on the flag.
      </p>

      <div className="difficulty" role="group" aria-label="Difficulty">
        {DIFFICULTIES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`chip ${settings.id === id ? "active" : ""}`}
            aria-pressed={settings.id === id}
            onClick={() => handleDifficulty(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {settings.id === "custom" && (
        <div className="custom-controls">
          <label className="slider">
            <span>
              Board size: <strong>{settings.n}</strong>
            </span>
            <input
              type="range"
              min={MIN_N}
              max={MAX_N}
              step={1}
              value={settings.n}
              aria-label="Board size"
              onChange={(e) => handleCustomN(Number(e.target.value))}
            />
          </label>
          <label className="slider">
            <span>
              Path length: <strong>{settings.steps}</strong> (
              {settings.steps + 1} cells)
            </span>
            <input
              type="range"
              min={MIN_STEPS}
              max={maxSteps(settings.n)}
              step={1}
              value={settings.steps}
              aria-label="Path length"
              onChange={(e) => handleCustomSteps(Number(e.target.value))}
            />
          </label>
        </div>
      )}

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
            <button type="button" className="btn primary" onClick={handleRetry}>
              Retry for a better score
            </button>
          )}
        </div>
      )}

      {stuck && (
        <p className="stuck-note" role="status">
          No moves left — <strong>Retry</strong> this board or get a{" "}
          <strong>New puzzle</strong>.
        </p>
      )}

      <div className="controls">
        <button type="button" className="btn primary" onClick={handleNewPuzzle}>
          New puzzle
        </button>
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
        square it hasn&rsquo;t visited yet. Stuck? <strong>Undo</strong> a step,{" "}
        <strong>Retry</strong> the board, or get a <strong>New puzzle</strong>.
      </p>
    </main>
  );
}
