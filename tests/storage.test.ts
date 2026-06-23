import { test, expect, describe } from "bun:test";
import {
  loadSolved,
  recordSolved,
  solvedCount,
  perfectCount,
  isRecordPerfect,
  STORAGE_KEY,
  type StorageLike,
  type SolvedMap,
} from "../src/storage";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("storage: load", () => {
  test("empty storage → {}", () => {
    expect(loadSolved(fakeStorage())).toEqual({});
  });

  test("null storage (unavailable) → {}", () => {
    expect(loadSolved(null)).toEqual({});
  });

  test("corrupt JSON → {} (never throws)", () => {
    expect(loadSolved(fakeStorage({ [STORAGE_KEY]: "not json{" }))).toEqual({});
  });

  test("sanitizes: drops junk records, clamps bestScore into [1, total]", () => {
    const s = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({
        a: { bestScore: 3, total: 5 },
        b: { bestScore: 99, total: 5 }, // clamp to 5
        c: { bestScore: "x", total: 5 }, // drop (NaN)
        d: 7, // drop (not an object)
      }),
    });
    expect(loadSolved(s)).toEqual({
      a: { bestScore: 3, total: 5 },
      b: { bestScore: 5, total: 5 },
    });
  });
});

describe("storage: record", () => {
  test("records a win as { bestScore, total } and persists", () => {
    const s = fakeStorage();
    const m = recordSolved(s, {}, "4-6-1", 3, 5);
    expect(m["4-6-1"]).toEqual({ bestScore: 3, total: 5 });
    expect(loadSolved(s)).toEqual(m);
  });

  test("random/custom (id null) is never tracked", () => {
    const s = fakeStorage();
    expect(recordSolved(s, {}, null, 5, 5)).toEqual({});
    expect(s.data[STORAGE_KEY]).toBeUndefined();
  });

  test("bestScore is sticky-MAX across a later lower-coverage win", () => {
    const s = fakeStorage();
    let m = recordSolved(s, {}, "x", 5, 5); // perfect
    m = recordSolved(s, m, "x", 2, 5); // later worse run
    expect(m["x"]).toEqual({ bestScore: 5, total: 5 });
  });

  test("bestScore rises on a better run", () => {
    const s = fakeStorage();
    let m = recordSolved(s, {}, "x", 2, 5);
    expect(m["x"].bestScore).toBe(2);
    m = recordSolved(s, m, "x", 4, 5);
    expect(m["x"].bestScore).toBe(4);
  });

  test("no-op (equal or lower score) returns the SAME map reference", () => {
    const s = fakeStorage();
    const m1 = recordSolved(s, {}, "x", 5, 5);
    expect(recordSolved(s, m1, "x", 5, 5)).toBe(m1);
    expect(recordSolved(s, m1, "x", 3, 5)).toBe(m1); // sticky: no change
  });

  test("does not mutate the input map", () => {
    const input: SolvedMap = {};
    recordSolved(fakeStorage(), input, "x", 3, 5);
    expect(input).toEqual({});
  });

  test("a setItem failure does not throw (best-effort)", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => recordSolved(throwing, {}, "x", 3, 5)).not.toThrow();
  });

  test("a null storage still updates the in-memory map", () => {
    expect(recordSolved(null, {}, "x", 3, 5)["x"]).toEqual({
      bestScore: 3,
      total: 5,
    });
  });
});

describe("storage: perfect + counts", () => {
  test("isRecordPerfect", () => {
    expect(isRecordPerfect({ bestScore: 5, total: 5 })).toBe(true);
    expect(isRecordPerfect({ bestScore: 3, total: 5 })).toBe(false);
  });

  test("solvedCount / perfectCount", () => {
    const m: SolvedMap = {
      a: { bestScore: 5, total: 5 },
      b: { bestScore: 3, total: 5 },
    };
    expect(solvedCount(m)).toBe(2);
    expect(perfectCount(m)).toBe(1);
  });
});
