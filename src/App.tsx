import { useCallback, useEffect, useMemo, useState } from "react";
import type { Cell } from "./engine";
import {
  currentLegalMoves,
  newGame,
  resetGame,
  tryMove,
  undoMove,
  type GameState,
} from "./game";

// Evidence surface: the smoke gate asserts against window.__KP__, never pixels.
declare global {
  interface Window {
    __KP__?: Record<string, unknown>;
  }
}

const N = 6;
const STEPS = 12;

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
  const [game, setGame] = useState<GameState>(() =>
    newGame(N, STEPS, randomSeed()),
  );

  const legal = useMemo(() => currentLegalMoves(game), [game]);
  const totalCells = game.puzzle.path.length;
  const canUndo = game.visited.length > 1;

  // Publish serializable CLONES of authoritative state so external code (the
  // smoke gate) cannot mutate live React/game state by reference.
  useEffect(() => {
    window.__KP__ = {
      ready: true,
      seed: game.puzzle.seed,
      n: game.puzzle.n,
      start: cloneCell(game.puzzle.start),
      end: cloneCell(game.puzzle.end),
      knight: cloneCell(game.knight),
      visited: game.visited.map(cloneCell),
      visitedCount: game.visited.length,
      totalCells,
      legalMoves: legal.map(cloneCell),
      solution: game.puzzle.path.map(cloneCell),
      won: game.won,
    };
  }, [game, legal, totalCells]);

  const handleCellClick = useCallback((cell: Cell) => {
    setGame((g) => tryMove(g, cell));
  }, []);

  const handleNewPuzzle = useCallback(() => {
    setGame(newGame(N, STEPS, randomSeed()));
  }, []);

  const handleRetry = useCallback(() => {
    setGame((g) => resetGame(g));
  }, []);

  const handleUndo = useCallback(() => {
    setGame((g) => undoMove(g));
  }, []);

  const legalKeys = useMemo(
    () => new Set(legal.map((m) => `${m.r}-${m.c}`)),
    [legal],
  );
  const visitedKeys = useMemo(
    () => new Set(game.visited.map((v) => `${v.r}-${v.c}`)),
    [game.visited],
  );

  const { puzzle, knight, won, visited } = game;

  return (
    <main>
      <h1>Knight&rsquo;s Puzzle</h1>
      <p className="tagline">
        Hop the knight onto every square and finish on the flag.
      </p>

      <p className="status" role="status">
        {won ? "Solved it!" : `Visited ${visited.length} / ${totalCells}`}
      </p>

      <div className="board-wrap">
        <div
          className="board"
          style={{ gridTemplateColumns: `repeat(${puzzle.n}, var(--cell))` }}
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
            🎉 Solved! 🎉
          </div>
        )}
      </div>

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
