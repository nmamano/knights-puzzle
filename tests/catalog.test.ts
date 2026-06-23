import { test, expect, describe } from "bun:test";
import {
  buildCatalog,
  getCatalog,
  catalogByNumber,
  catalogId,
  CATALOG_SIZE,
  CATALOG_VERSION,
} from "../src/catalog";
import { generatePuzzle } from "../src/engine";
import { difficultyScore } from "../src/analysis";

const catalog = buildCatalog();

describe("catalog shape", () => {
  test("has exactly CATALOG_SIZE (100) entries", () => {
    expect(CATALOG_SIZE).toBe(100);
    expect(catalog.length).toBe(CATALOG_SIZE);
  });

  test("CATALOG_VERSION is 2 (storage rescope is intentional, not accidental)", () => {
    expect(CATALOG_VERSION).toBe(2);
  });

  test("is numbered 1..100 contiguously", () => {
    expect(catalog.map((p) => p.number)).toEqual(
      Array.from({ length: CATALOG_SIZE }, (_, i) => i + 1),
    );
  });

  test("every id is unique and equals n-steps-seed", () => {
    expect(new Set(catalog.map((p) => p.id)).size).toBe(CATALOG_SIZE);
    for (const p of catalog) {
      expect(p.id).toBe(catalogId(p.n, p.steps, p.seed));
    }
  });
});

describe("catalog difficulties (unique + ascending)", () => {
  test("all 100 difficulties are unique", () => {
    expect(new Set(catalog.map((p) => p.difficultyScore)).size).toBe(
      CATALOG_SIZE,
    );
  });

  test("strictly increasing by difficulty", () => {
    for (let i = 1; i < catalog.length; i++) {
      expect(catalog[i].difficultyScore).toBeGreaterThan(
        catalog[i - 1].difficultyScore,
      );
    }
  });

  test("#1 has difficulty 1 and #2 has difficulty 2", () => {
    expect(catalog[0].difficultyScore).toBe(1);
    expect(catalog[1].difficultyScore).toBe(2);
  });

  test("#99 is easier than the pinned #100", () => {
    expect(catalog[98].difficultyScore).toBeLessThan(
      catalog[99].difficultyScore,
    );
  });

  test("all difficulties are finite", () => {
    for (const p of catalog) {
      expect(Number.isFinite(p.difficultyScore)).toBe(true);
    }
  });
});

describe("pinned #100", () => {
  test("#100 is the kept boss puzzle 7-26-2045617612", () => {
    const p = catalog[99];
    expect(p.number).toBe(100);
    expect(p.id).toBe("7-26-2045617612");
    expect(p.n).toBe(7);
    expect(p.steps).toBe(26);
    expect(p.seed).toBe(2045617612);
    expect(p.difficultyScore).toBe(2764800);
    expect(p.cells).toBe(27);
  });
});

describe("catalog determinism + regeneration", () => {
  test("buildCatalog is deterministic (deep-equal across calls)", () => {
    expect(buildCatalog()).toEqual(catalog);
  });

  test("each entry regenerates the exact puzzle (score + cells match)", () => {
    for (const p of catalog) {
      const puzzle = generatePuzzle(p.n, p.steps, p.seed);
      expect(puzzle.path.length).toBe(p.cells);
      expect(p.cells).toBeLessThanOrEqual(p.steps + 1);
      expect(difficultyScore(puzzle)).toBe(p.difficultyScore);
    }
  });
});

describe("catalog access", () => {
  test("getCatalog memoizes (same reference each call)", () => {
    expect(getCatalog()).toBe(getCatalog());
  });

  test("catalogByNumber returns the matching entry or undefined", () => {
    expect(catalogByNumber(1)?.number).toBe(1);
    expect(catalogByNumber(100)?.number).toBe(100);
    expect(catalogByNumber(0)).toBeUndefined();
    expect(catalogByNumber(101)).toBeUndefined();
  });
});
