import { test, expect, describe } from "bun:test";
import {
  loadSolved,
  recordSolved,
  solvedCount,
  perfectCount,
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

  test("sanitizes records (coerces to booleans, drops junk)", () => {
    const s = fakeStorage({
      [STORAGE_KEY]: JSON.stringify({
        "4-6-1": { solved: 1, perfect: 0 },
        junk: 5,
      }),
    });
    expect(loadSolved(s)).toEqual({
      "4-6-1": { solved: true, perfect: false },
    });
  });
});

describe("storage: record", () => {
  test("records a catalog win and persists it", () => {
    const s = fakeStorage();
    const m = recordSolved(s, {}, "4-6-1", false);
    expect(m["4-6-1"]).toEqual({ solved: true, perfect: false });
    expect(loadSolved(s)).toEqual(m); // round-trips through storage
  });

  test("random/custom (id null) is never tracked", () => {
    const s = fakeStorage();
    const m = recordSolved(s, {}, null, true);
    expect(m).toEqual({});
    expect(s.data[STORAGE_KEY]).toBeUndefined(); // nothing written
  });

  test("perfect is sticky across a later imperfect win", () => {
    const s = fakeStorage();
    let m = recordSolved(s, {}, "5-8-2", true); // perfect first
    expect(m["5-8-2"]).toEqual({ solved: true, perfect: true });
    m = recordSolved(s, m, "5-8-2", false); // later imperfect win
    expect(m["5-8-2"]).toEqual({ solved: true, perfect: true }); // star kept
  });

  test("upgrades to perfect on a later perfect win", () => {
    const s = fakeStorage();
    let m = recordSolved(s, {}, "5-8-2", false);
    expect(m["5-8-2"].perfect).toBe(false);
    m = recordSolved(s, m, "5-8-2", true);
    expect(m["5-8-2"].perfect).toBe(true);
  });

  test("no-op returns the SAME map reference (no needless write)", () => {
    const s = fakeStorage();
    const m1 = recordSolved(s, {}, "4-6-1", true);
    const m2 = recordSolved(s, m1, "4-6-1", true);
    expect(m2).toBe(m1);
  });

  test("does not mutate the input map", () => {
    const input: SolvedMap = {};
    recordSolved(fakeStorage(), input, "4-6-1", true);
    expect(input).toEqual({});
  });

  test("a setItem failure does not throw (best-effort)", () => {
    const throwing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => recordSolved(throwing, {}, "4-6-1", true)).not.toThrow();
  });

  test("a null storage still updates the in-memory map", () => {
    const m = recordSolved(null, {}, "4-6-1", true);
    expect(m["4-6-1"]).toEqual({ solved: true, perfect: true });
  });
});

describe("storage: counts", () => {
  test("solvedCount / perfectCount", () => {
    const m: SolvedMap = {
      a: { solved: true, perfect: true },
      b: { solved: true, perfect: false },
      c: { solved: false, perfect: false },
    };
    expect(solvedCount(m)).toBe(2);
    expect(perfectCount(m)).toBe(1);
  });
});
