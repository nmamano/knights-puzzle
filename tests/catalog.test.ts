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

describe("catalog ordering", () => {
  test("difficulty scores are non-decreasing (sorted ascending)", () => {
    for (let i = 1; i < catalog.length; i++) {
      expect(catalog[i].difficultyScore).toBeGreaterThanOrEqual(
        catalog[i - 1].difficultyScore,
      );
    }
  });

  test("ties break deterministically by (score, n, cells, id)", () => {
    for (let i = 1; i < catalog.length; i++) {
      const a = catalog[i - 1];
      const b = catalog[i];
      if (a.difficultyScore !== b.difficultyScore) continue;
      expect(a.n).toBeLessThanOrEqual(b.n);
      if (a.n === b.n) {
        expect(a.cells).toBeLessThanOrEqual(b.cells);
        if (a.cells === b.cells) expect(a.id <= b.id).toBe(true);
      }
    }
  });
});

describe("catalog determinism + regeneration", () => {
  test("buildCatalog is deterministic (deep-equal across calls)", () => {
    expect(buildCatalog()).toEqual(catalog);
  });

  test("each entry regenerates the exact puzzle (score + cells match)", () => {
    for (const p of catalog) {
      const puzzle = generatePuzzle(p.n, p.steps, p.seed);
      // ACTUAL cells may be < steps + 1 (a walk can dead-end early).
      expect(puzzle.path.length).toBe(p.cells);
      expect(p.cells).toBeLessThanOrEqual(p.steps + 1);
      expect(difficultyScore(puzzle)).toBe(p.difficultyScore);
      expect(Number.isFinite(p.difficultyScore)).toBe(true);
      expect(p.difficultyScore).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("catalog spread", () => {
  test("spans multiple board sizes and many distinct difficulties", () => {
    expect(new Set(catalog.map((p) => p.n)).size).toBeGreaterThanOrEqual(3);
    expect(
      new Set(catalog.map((p) => p.difficultyScore)).size,
    ).toBeGreaterThanOrEqual(10);
    expect(catalog[catalog.length - 1].difficultyScore).toBeGreaterThan(
      catalog[0].difficultyScore,
    );
    // Not "all score 1": fewer than half are trivial.
    expect(catalog.filter((p) => p.difficultyScore === 1).length).toBeLessThan(
      CATALOG_SIZE / 2,
    );
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

  test("CATALOG_VERSION is a positive integer", () => {
    expect(Number.isInteger(CATALOG_VERSION)).toBe(true);
    expect(CATALOG_VERSION).toBeGreaterThanOrEqual(1);
  });
});
