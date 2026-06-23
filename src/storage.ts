// Client-side solved-tracking for catalog puzzles (localStorage, best-effort).
//
// Scoped by CATALOG_VERSION so a future catalog reshuffle starts clean. Keyed by
// the stable puzzle id (n-steps-seed). Random/custom puzzles (id null) are NEVER
// tracked. Degrades gracefully: if storage is unavailable or corrupt, the game
// stays fully playable, just untracked.

import { CATALOG_VERSION } from "./catalog";

// Per-puzzle progress. `perfect` is STICKY: once true it stays true even after a
// later imperfect win on the same puzzle.
export type SolveRecord = { solved: boolean; perfect: boolean };
export type SolvedMap = Record<string, SolveRecord>;

// A minimal Storage-like surface so this unit-tests without a real localStorage.
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const STORAGE_KEY = `kp:solved:v${CATALOG_VERSION}`;

/** The ambient localStorage if it exists AND is writable; otherwise null. */
export function defaultStorage(): StorageLike | null {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    // Probe — Safari private mode (and others) can throw on setItem.
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
        out[id] = { solved: !!r.solved, perfect: !!r.perfect };
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
 * Record a win for a CATALOG puzzle and persist. Returns the new map (the SAME
 * reference when nothing changed, to avoid needless writes/renders). A null
 * `id` (random/custom puzzle) is a no-op — those are never tracked. `perfect`
 * is sticky: a prior star is preserved on a later imperfect win. Pure w.r.t.
 * `current` (never mutates it).
 */
export function recordSolved(
  storage: StorageLike | null,
  current: SolvedMap,
  id: string | null,
  perfect: boolean,
): SolvedMap {
  if (!id) return current; // random/custom — never tracked
  const prev = current[id];
  const next: SolveRecord = {
    solved: true,
    perfect: perfect || (prev?.perfect ?? false),
  };
  if (prev && prev.solved === next.solved && prev.perfect === next.perfect) {
    return current; // no change
  }
  const updated: SolvedMap = { ...current, [id]: next };
  persist(storage, updated);
  return updated;
}

export function solvedCount(map: SolvedMap): number {
  return Object.values(map).filter((r) => r.solved).length;
}

export function perfectCount(map: SolvedMap): number {
  return Object.values(map).filter((r) => r.perfect).length;
}
