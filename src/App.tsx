import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function App() {
  const [settings, setSettings] = useState<Settings>(() =>
    presetSettings("medium"),
  );
  const [game, setGame] = useState<GameState>(() => {
    const s = presetSettings("medium");
    return newGame(s.n, s.steps, randomSeed());
  });

  const legal = useMemo(() => currentLegalMoves(game), [game]);
  const totalCells = game.puzzle.path.length;
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
      perfect,
      stuck,
      legalMoves: legal.map(cloneCell),
      solution: game.puzzle.path.map(cloneCell),
      won: game.won,
    };
  }, [game, legal, totalCells, settings, scoreVal, perfect, stuck]);

  // Apply new settings AND regenerate a puzzle with a fresh seed.
  const regenerate = useCallback((s: Settings) => {
    setSettings(s);
    setGame(newGame(s.n, s.steps, randomSeed()));
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
  }, [settings.n, settings.steps]);

  const handleRetry = useCallback(() => setGame((g) => resetGame(g)), []);
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
              const isKnight = sameCell(knight, cell);
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
              const glyph = isKnight ? "♞" : isEnd ? "🏁" : isStart ? "◎" : "";
              return (
                <button
                  key={k}
                  type="button"
                  data-cell={k}
                  className={className}
                  onClick={() => handleCellClick(cell)}
                  aria-label={`square ${r},${c}${isEnd ? " (goal)" : isStart ? " (start)" : ""}`}
                >
                  <span className="glyph">{glyph}</span>
                </button>
              );
            }),
          )}
        </div>

        {won && (
          <div className="win-banner" role="alert">
            <div className="win-text">
              {perfect
                ? `Perfect! ${scoreVal}/${totalCells} 🎉`
                : `Reached the goal! ${scoreVal}/${totalCells}`}
            </div>
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
      </div>

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
