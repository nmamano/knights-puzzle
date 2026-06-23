// Knight's Puzzle — the 99-puzzle catalog (pure, deterministic).
//
// A fixed, reproducible set of 99 puzzles. #1..#98 are harvested so that EVERY
// difficulty is unique — the 98 SMALLEST distinct difficulty scores, ascending
// (so #1 = difficulty 1, #2 = difficulty 2, then unique upward). #99 is a
// PINNED hard "boss" (the landmark final puzzle). The whole catalog is a pure
// function of CATALOG_MASTER_SEED + the pinned params, so every player sees the
// same list. There is NO solver: each puzzle is a generated witness walk and
// difficulty is witness-path branchiness (see analysis.ts).

import { generatePuzzle, makeRng } from "./engine";
import { difficultyScore } from "./analysis";
import { maxSteps, MIN_N, MIN_STEPS } from "./difficulty";

export const CATALOG_SIZE = 99;

// Bump CATALOG_VERSION whenever generation, the master seed, the pinned puzzle,
// the parameter ranges, the id scheme, OR the difficulty formula change — it
// scopes saved progress (storage key kp:solved:v${CATALOG_VERSION}). v4: the
// difficulty formula stopped counting an early hop to the goal as a branch,
// which reshuffles #1..#98.
export const CATALOG_VERSION = 4;

// The harvest is a pure function of this seed; changing it reshuffles #1..#98.
export const CATALOG_MASTER_SEED = 0x6b6e6967; // "knig"

// The pinned final puzzle (#99): the hard landmark kept by request. Its
// difficulty (2,764,800) is reserved — never reused by #1..#98.
const PINNED_BOSS = { n: 7, steps: 26, seed: 2045617612 } as const;

// Largest board #1..#98 draw (keeps difficulty human-scale + the board
// mobile-friendly). MIN_N (4) is the smallest.
const MAX_CATALOG_N = 8;
// Upper bounds on path length so candidate difficulties stay human-scale.
const STEPS_FRACTION_CAP = 0.7;
const MAX_CATALOG_STEPS = 26;
// Deterministic candidate pool size. Empirically yields ~280 distinct
// difficulties — far more than the 98 needed — so the smallest 98 are stable.
const HARVEST_ATTEMPTS = 8000;

export type CatalogPuzzle = {
  /** 1..99, assigned after ranking (#1 easiest … #98, then pinned #99). */
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

type Candidate = Omit<CatalogPuzzle, "number">;

export function catalogId(n: number, steps: number, seed: number): string {
  return `${n}-${steps}-${seed}`;
}

function makeEntry(n: number, steps: number, seed: number): Candidate {
  const puzzle = generatePuzzle(n, steps, seed);
  return {
    id: catalogId(n, steps, seed),
    n,
    steps,
    seed,
    difficultyScore: difficultyScore(puzzle),
    cells: puzzle.path.length,
  };
}

// Deterministic (n, steps, seed) draw for one raw candidate.
function drawParams(rng: () => number): {
  n: number;
  steps: number;
  seed: number;
} {
  const n = MIN_N + Math.floor(rng() * (MAX_CATALOG_N - MIN_N + 1)); // 4..8
  const hi = maxSteps(n);
  const lo = Math.min(hi, Math.max(MIN_STEPS, n + 1));
  const top = Math.max(
    lo,
    Math.min(hi, Math.round(hi * STEPS_FRACTION_CAP), MAX_CATALOG_STEPS),
  );
  const steps = lo + Math.floor(rng() * (top - lo + 1));
  const seed = 1 + Math.floor(rng() * 0x7ffffffe);
  return { n, steps, seed };
}

// Ascending difficulty, then a deterministic tie-break (n, cells, id). When two
// candidates share a difficulty, this decides which one OWNS that score.
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.difficultyScore !== b.difficultyScore)
    return a.difficultyScore - b.difficultyScore;
  if (a.n !== b.n) return a.n - b.n;
  if (a.cells !== b.cells) return a.cells - b.cells;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build the catalog: 99 deterministic puzzles with UNIQUE difficulties. #1..#98
 * are the 98 smallest distinct difficulty scores (ascending); #99 is the pinned
 * boss. Pure — same output on every call.
 */
export function buildCatalog(): CatalogPuzzle[] {
  const boss = makeEntry(PINNED_BOSS.n, PINNED_BOSS.steps, PINNED_BOSS.seed);

  // Harvest ONE representative per distinct difficulty from a deterministic
  // pool; the pinned difficulty is reserved for #99, so it never appears below.
  const rng = makeRng(CATALOG_MASTER_SEED);
  const byDifficulty = new Map<number, Candidate>();
  for (let i = 0; i < HARVEST_ATTEMPTS; i++) {
    const { n, steps, seed } = drawParams(rng);
    const cand = makeEntry(n, steps, seed);
    if (cand.difficultyScore === boss.difficultyScore) continue; // → #99 only
    const prev = byDifficulty.get(cand.difficultyScore);
    if (!prev || compareCandidates(cand, prev) < 0) {
      byDifficulty.set(cand.difficultyScore, cand);
    }
  }

  // The 98 SMALLEST distinct difficulties, ascending → #1..#98; pin #99.
  const ranked = [...byDifficulty.values()].sort(compareCandidates);
  if (ranked.length < CATALOG_SIZE - 1) {
    throw new Error(
      `catalog harvest found ${ranked.length} distinct difficulties (need ${CATALOG_SIZE - 1})`,
    );
  }
  const catalog: CatalogPuzzle[] = ranked
    .slice(0, CATALOG_SIZE - 1)
    .map((c, i) => ({ ...c, number: i + 1 }));
  catalog.push({ ...boss, number: CATALOG_SIZE });
  return catalog;
}

let cached: CatalogPuzzle[] | null = null;

/** The catalog, built once and memoized (it is invariant). */
export function getCatalog(): CatalogPuzzle[] {
  if (!cached) cached = buildCatalog();
  return cached;
}

/** Look up a catalog puzzle by its 1..99 number. */
export function catalogByNumber(n: number): CatalogPuzzle | undefined {
  return getCatalog().find((p) => p.number === n);
}
