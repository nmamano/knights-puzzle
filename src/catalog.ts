// Knight's Puzzle — the 100-puzzle catalog (pure, deterministic).
//
// A fixed, reproducible set of 100 puzzles spanning a range of board sizes and
// path lengths, RANKED by difficultyScore (ascending) and numbered 1..100. The
// whole catalog is a pure function of CATALOG_MASTER_SEED, so every player sees
// the SAME #1..#100 — which is what makes the numbering and solved-tracking
// meaningful. There is NO solver: each puzzle is a generated witness walk.

import { generatePuzzle, makeRng } from "./engine";
import { difficultyScore } from "./analysis";
import { maxSteps, MIN_N, MIN_STEPS } from "./difficulty";

export const CATALOG_SIZE = 100;

// Bump CATALOG_VERSION whenever generation, the master seed, the parameter
// ranges, or the id scheme change — it scopes saved progress (see slice 6d).
export const CATALOG_VERSION = 1;

// The whole catalog is a pure function of this seed; changing it reshuffles all
// 100 puzzles, so treat it as part of CATALOG_VERSION's contract.
export const CATALOG_MASTER_SEED = 0x6b6e6967; // "knig"

// Largest board the catalog draws (keeps difficulty scores human-scale and the
// board mobile-friendly). MIN_N (4) is the smallest.
const MAX_CATALOG_N = 8;
// Upper bound on path length as a fraction of the full board, so the hardest
// puzzles stay challenging without astronomically large difficulty numbers.
const STEPS_FRACTION_CAP = 0.7;
// Absolute ceiling on path length: keeps even the hardest catalog puzzles
// playable by hand (not an endurance test) and difficulty scores human-scale.
const MAX_CATALOG_STEPS = 26;

export type CatalogPuzzle = {
  /** 1..100, assigned AFTER sorting by difficulty (ascending). */
  number: number;
  /** Stable id `${n}-${steps}-${seed}` — regenerates the exact puzzle. */
  id: string;
  n: number;
  /** Requested knight moves (for regeneration). */
  steps: number;
  seed: number;
  /** Witness-path difficulty (a ranking/display heuristic, see analysis.ts). */
  difficultyScore: number;
  /** ACTUAL playable cells (puzzle.path.length) — may be < steps + 1. */
  cells: number;
};

export function catalogId(n: number, steps: number, seed: number): string {
  return `${n}-${steps}-${seed}`;
}

// Deterministic (n, steps, seed) draw for one raw candidate.
function drawParams(rng: () => number): {
  n: number;
  steps: number;
  seed: number;
} {
  const n = MIN_N + Math.floor(rng() * (MAX_CATALOG_N - MIN_N + 1)); // 4..8
  const hi = maxSteps(n);
  // Floor grows with n so bigger boards aren't trivially short.
  const lo = Math.min(hi, Math.max(MIN_STEPS, n + 1));
  const top = Math.max(
    lo,
    Math.min(hi, Math.round(hi * STEPS_FRACTION_CAP), MAX_CATALOG_STEPS),
  );
  const steps = lo + Math.floor(rng() * (top - lo + 1));
  const seed = 1 + Math.floor(rng() * 0x7ffffffe);
  return { n, steps, seed };
}

function buildRaw(): CatalogPuzzle[] {
  const rng = makeRng(CATALOG_MASTER_SEED);
  const out: CatalogPuzzle[] = [];
  for (let i = 0; i < CATALOG_SIZE; i++) {
    const { n, steps, seed } = drawParams(rng);
    const puzzle = generatePuzzle(n, steps, seed);
    out.push({
      number: 0, // filled in after the sort
      id: catalogId(n, steps, seed),
      n,
      steps,
      seed,
      difficultyScore: difficultyScore(puzzle),
      cells: puzzle.path.length,
    });
  }
  return out;
}

// Ascending difficulty, with deterministic tie-breakers so the order is stable
// and intentional (reviewer note): score, then n, then cells, then id.
function compareByDifficulty(a: CatalogPuzzle, b: CatalogPuzzle): number {
  if (a.difficultyScore !== b.difficultyScore)
    return a.difficultyScore - b.difficultyScore;
  if (a.n !== b.n) return a.n - b.n;
  if (a.cells !== b.cells) return a.cells - b.cells;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build the full catalog: 100 deterministic puzzles, sorted by ascending
 * difficulty and numbered 1..100. Pure — same output on every call.
 */
export function buildCatalog(): CatalogPuzzle[] {
  return buildRaw()
    .sort(compareByDifficulty)
    .map((p, i) => ({ ...p, number: i + 1 }));
}

let cached: CatalogPuzzle[] | null = null;

/** The catalog, built once and memoized (it is invariant). */
export function getCatalog(): CatalogPuzzle[] {
  if (!cached) cached = buildCatalog();
  return cached;
}

/** Look up a catalog puzzle by its 1..100 number. */
export function catalogByNumber(n: number): CatalogPuzzle | undefined {
  return getCatalog().find((p) => p.number === n);
}
