// Knight's Puzzle — difficulty analysis (pure, no DOM/React, witness-only).
//
// Difficulty is measured from the generator's WITNESS path (`puzzle.path`),
// which exists by construction — there is deliberately NO solver here. We walk
// the witness and, at each step, count how many legal knight moves were
// available (the player's apparent choices). The product of the genuine branch
// points (steps with >= 2 options) is the difficulty score: a measure of how
// many ways a player could diverge from the shown solution. It is NOT a claim
// about global solution uniqueness or whether other perfect paths exist.

import { legalMoves, type Puzzle } from "./engine";

/**
 * Per-move apparent-choice counts along the witness path.
 *
 * For each step `i` (0 .. path.length - 2): the number of legal knight moves
 * from `path[i]` given that `path[0..i]` have already been visited. That count
 * always includes the correct next cell `path[i+1]`, plus any other playable,
 * not-yet-visited knight-neighbour. The result has `path.length - 1` entries
 * (one per move); a single-cell path yields `[]`.
 *
 * Pure: reads the puzzle only, never mutates it or its `path`.
 */
export function branchingProfile(puzzle: Puzzle): number[] {
  const path = puzzle.path;
  const profile: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    // visited = path[0..i] (includes path[i]); the correct next cell path[i+1]
    // is therefore NOT excluded, but every already-walked cell is.
    const options = legalMoves(puzzle, path[i], path.slice(0, i + 1));
    profile.push(options.length);
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
