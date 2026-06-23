// Client-side solved-tracking for catalog puzzles (localStorage, best-effort).
//
// Scoped by CATALOG_VERSION so a catalog reshuffle starts clean. Keyed by the
// stable puzzle id (n-steps-seed). A record exists only for SOLVED (won) catalog
// puzzles and keeps the BEST score so far: `{ bestScore, total }`. Perfect =
// bestScore === total. Random/custom puzzles (id null) are NEVER tracked.
// Degrades gracefully: unavailable/corrupt storage ⇒ the game stays playable,
// just untracked.

import { CATALOG_VERSION } from "./catalog";

// Per-puzzle progress: the highest coverage achieved on a winning run, and the
// puzzle's total cell count. `bestScore` is STICKY (only ever rises).
export type SolveRecord = { bestScore: number; total: number };
export type SolvedMap = Record<string, SolveRecord>;

// A minimal Storage-like surface so this unit-tests without a real localStorage.
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const STORAGE_KEY = `kp:solved:v${CATALOG_VERSION}`;

/** A solved record is "perfect" when its best run covered every square. */
export function isRecordPerfect(rec: SolveRecord): boolean {
  return rec.bestScore >= rec.total;
}

/** The ambient localStorage if it exists AND is writable; otherwise null. */
export function defaultStorage(): StorageLike | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = "__kp_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/** Read the solved map, sanitizing junk. Never throws; missing/bad ⇒ {}. */
export function loadSolved(storage: StorageLike | null): SolvedMap {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: SolvedMap = {};
    for (const [id, rec] of Object.entries(parsed as Record<string, unknown>)) {
      if (rec && typeof rec === "object") {
        const r = rec as Record<string, unknown>;
        const total = Number(r.total);
        const bestScore = Number(r.bestScore);
        // Keep only well-formed records; clamp bestScore into [1, total].
        if (
          Number.isFinite(total) &&
          total >= 1 &&
          Number.isFinite(bestScore) &&
          bestScore >= 1
        ) {
          out[id] = { bestScore: Math.min(bestScore, total), total };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(storage: StorageLike | null, map: SolvedMap): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // best-effort: a write failure must never break play
  }
}

/**
 * Record a win for a CATALOG puzzle and persist. `id` null (random/custom) is a
 * no-op. Keeps the STICKY-MAX `bestScore`; returns the SAME reference when
 * nothing changed (avoids needless writes/renders). Pure w.r.t. `current`.
 */
export function recordSolved(
  storage: StorageLike | null,
  current: SolvedMap,
  id: string | null,
  score: number,
  total: number,
): SolvedMap {
  if (!id) return current; // random/custom — never tracked
  const prev = current[id];
  const bestScore = prev ? Math.max(prev.bestScore, score) : score;
  const next: SolveRecord = { bestScore, total };
  if (prev && prev.bestScore === next.bestScore && prev.total === next.total) {
    return current; // no change
  }
  const updated: SolvedMap = { ...current, [id]: next };
  persist(storage, updated);
  return updated;
}

/** How many catalog puzzles have been solved (a record exists). */
export function solvedCount(map: SolvedMap): number {
  return Object.keys(map).length;
}

/** How many solved puzzles were solved PERFECTLY (full coverage). */
export function perfectCount(map: SolvedMap): number {
  return Object.values(map).filter(isRecordPerfect).length;
}
