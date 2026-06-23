// Knight's Puzzle — difficulty analysis (pure, no DOM/React, witness-only).
//
// Difficulty is measured from the generator's WITNESS path (`puzzle.path`),
// which exists by construction — there is deliberately NO solver here. We walk
// the witness and, at each step, count how many legal knight moves were
// available (the player's apparent choices). The product of the genuine branch
// points (steps with >= 2 options) is the difficulty score: a measure of how
// many ways a player could diverge from the shown solution. It is NOT a claim
// about global solution uniqueness or whether other perfect paths exist.

import { legalMoves, type Cell, type Puzzle } from "./engine";
import type { GameState } from "./game";

/**
 * Per-move apparent-choice counts along the witness path.
 *
 * For each step `i` (0 .. path.length - 2): the number of legal knight moves
 * from `path[i]` given that `path[0..i]` have already been visited. That count
 * always includes the correct next cell `path[i+1]`, plus any other playable,
 * not-yet-visited knight-neighbour. The result has `path.length - 1` entries
 * (one per move); a single-cell path yields `[]`.
 *
 * EXCEPTION (the goal is not a real branch): landing on the GOAL square before
 * the final move ENDS the run early (an exit, not a genuine choice toward the
 * solution), so it does NOT count toward the branching factor. On the final move
 * — where reaching the goal IS the correct play — it counts normally.
 *
 * Pure: reads the puzzle only, never mutates it or its `path`.
 */
export function branchingProfile(puzzle: Puzzle): number[] {
  const path = puzzle.path;
  const end = path[path.length - 1];
  const profile: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    // visited = path[0..i] (includes path[i]); the correct next cell path[i+1]
    // is therefore NOT excluded, but every already-walked cell is.
    const options = legalMoves(puzzle, path[i], path.slice(0, i + 1));
    const next = path[i + 1];
    const finalMove = next.r === end.r && next.c === end.c;
    let count = options.length;
    // Drop the goal as an early-exit option on any non-final move.
    if (!finalMove && options.some((m) => m.r === end.r && m.c === end.c)) {
      count -= 1;
    }
    profile.push(count);
  }
  return profile;
}

/**
 * Difficulty score = the product of the apparent-choice counts at every genuine
 * branch point (>= 2 options) along the witness path. Steps with a single
 * forced option contribute a factor of 1; a fully forced path scores 1.
 *
 * NOTE: for long, branchy paths this can exceed `Number.MAX_SAFE_INTEGER`. That
 * is acceptable for ranking the catalog — the value stays finite and ordering
 * stays sensible. If board sizes / path lengths grow substantially later,
 * switch to a log-score or BigInt (see the standing-orders file).
 */
export function difficultyScore(puzzle: Puzzle): number {
  let product = 1;
  for (const count of branchingProfile(puzzle)) {
    if (count >= 2) product *= count;
  }
  return product;
}

/**
 * A witness-only hint for the current game (no solver):
 * - `won`     — the puzzle is finished.
 * - `prefix`  — the visited squares are a prefix of the witness path, so the
 *               correct next move is `nextCell` (the next witness cell, which is
 *               always a currently-legal move).
 * - `off_path`— the player has diverged from the WITNESS path. This does NOT
 *               claim the move is wrong in every possible solution — only that,
 *               without a solver, we can't point the way along the generated
 *               witness. The UI should phrase it that way.
 */
export type Hint =
  | { status: "won" }
  | { status: "prefix"; nextCell: Cell }
  | { status: "off_path" };

export function hint(state: GameState): Hint {
  if (state.won) return { status: "won" };
  const { path } = state.puzzle;
  const visited = state.visited;
  const onPrefix =
    visited.length < path.length &&
    visited.every((c, i) => c.r === path[i].r && c.c === path[i].c);
  if (onPrefix) {
    const next = path[visited.length];
    return { status: "prefix", nextCell: { r: next.r, c: next.c } };
  }
  return { status: "off_path" };
}
