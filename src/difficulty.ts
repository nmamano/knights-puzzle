// Difficulty settings (pure — no DOM/React/engine rules). Difficulty only
// chooses board size + path length; it never leaks into game rules.

export type DifficultyId = "easy" | "medium" | "hard" | "custom";

export type Settings = {
  id: DifficultyId;
  /** Board side length. */
  n: number;
  /** Knight moves to walk; cell count target is steps + 1. */
  steps: number;
};

export const MIN_N = 4;
export const MAX_N = 9;
export const MIN_STEPS = 3;

export const DEFAULT_DIFFICULTY: DifficultyId = "medium";

export const PRESETS: Record<
  Exclude<DifficultyId, "custom">,
  { n: number; steps: number }
> = {
  easy: { n: 5, steps: 8 },
  medium: { n: 6, steps: 14 },
  hard: { n: 8, steps: 24 },
};

/** Largest legal path length (knight moves) on an n×n board. */
export function maxSteps(n: number): number {
  return n * n - 1;
}

/** Clamp board size into [MIN_N, MAX_N]. */
export function clampN(n: number): number {
  if (n < MIN_N) return MIN_N;
  if (n > MAX_N) return MAX_N;
  return n;
}

/** Clamp path length into [MIN_STEPS, maxSteps(n)]. */
export function clampSteps(n: number, steps: number): number {
  const hi = maxSteps(n);
  if (steps < MIN_STEPS) return MIN_STEPS;
  if (steps > hi) return hi;
  return steps;
}

/** Settings for a named preset. */
export function presetSettings(id: Exclude<DifficultyId, "custom">): Settings {
  const p = PRESETS[id];
  return { id, n: p.n, steps: p.steps };
}

/** Custom settings from raw inputs — rounded, clamped, and self-consistent. */
export function customSettings(n: number, steps: number): Settings {
  const cn = clampN(Math.round(n));
  return { id: "custom", n: cn, steps: clampSteps(cn, Math.round(steps)) };
}
