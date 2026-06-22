// Knight's Puzzle — game state (pure, no DOM/React/Math.random/Date).
// Wraps the engine into a playable session. All transitions return NEW state
// and never mutate caller-owned arrays.

import {
  generatePuzzle,
  isWin,
  legalMoves,
  type Cell,
  type Puzzle,
} from "./engine";

export type GameState = {
  puzzle: Puzzle;
  /** Knight's current square. */
  knight: Cell;
  /** Ordered squares visited so far, including the start. */
  visited: Cell[];
  won: boolean;
};

function sameCell(a: Cell, b: Cell): boolean {
  return a.r === b.r && a.c === b.c;
}

/** Start a fresh session on a newly generated puzzle. */
export function newGame(n: number, steps: number, seed: number): GameState {
  const puzzle = generatePuzzle(n, steps, seed);
  return {
    puzzle,
    knight: { r: puzzle.start.r, c: puzzle.start.c },
    visited: [{ r: puzzle.start.r, c: puzzle.start.c }],
    won: false,
  };
}

/** Squares the knight may legally move to next. Empty once the puzzle is won. */
export function currentLegalMoves(state: GameState): Cell[] {
  if (state.won) return [];
  return legalMoves(state.puzzle, state.knight, state.visited);
}

/**
 * Attempt to move the knight to `cell`. Returns the SAME state reference (a
 * no-op) if the puzzle is already won or the move is not currently legal;
 * otherwise returns a new state with the knight advanced and `won` recomputed.
 */
export function tryMove(state: GameState, cell: Cell): GameState {
  if (state.won) return state;
  const isLegal = currentLegalMoves(state).some((m) => sameCell(m, cell));
  if (!isLegal) return state;

  const next: Cell = { r: cell.r, c: cell.c };
  const visited = [...state.visited, next];
  // Softer win model: reaching the GOAL square wins (coverage is the score).
  return {
    puzzle: state.puzzle,
    knight: next,
    visited,
    won: sameCell(next, state.puzzle.end),
  };
}

/** Squares visited so far (the score). */
export function score(state: GameState): number {
  return state.visited.length;
}

/** Total playable squares (a perfect score). */
export function total(state: GameState): number {
  return state.puzzle.path.length;
}

/** A perfect run: reached the goal AND covered every square (engine isWin). */
export function isPerfect(state: GameState): boolean {
  return state.won && isWin(state.puzzle, state.visited);
}

/** Stuck: not won and no legal move remains (stranded off the goal). */
export function isStuck(state: GameState): boolean {
  return !state.won && currentLegalMoves(state).length === 0;
}

/**
 * Step the knight back one square. Returns the SAME reference at the start
 * boundary (only the start square visited); otherwise a new state on the same
 * puzzle with `won` cleared. Works after a win (steps back off the end).
 */
export function undoMove(state: GameState): GameState {
  if (state.visited.length <= 1) return state;
  const visited = state.visited.slice(0, -1).map((c) => ({ r: c.r, c: c.c }));
  const last = visited[visited.length - 1];
  return {
    puzzle: state.puzzle,
    knight: { r: last.r, c: last.c },
    visited,
    won: false,
  };
}

/**
 * Restart the CURRENT puzzle: same puzzle/seed, knight back on start, only the
 * start visited, not won. Always returns a new state (never mutates).
 */
export function resetGame(state: GameState): GameState {
  const start = state.puzzle.start;
  return {
    puzzle: state.puzzle,
    knight: { r: start.r, c: start.c },
    visited: [{ r: start.r, c: start.c }],
    won: false,
  };
}
