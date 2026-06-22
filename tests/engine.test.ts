import { test, expect, describe } from "bun:test";
import {
  knightMoves,
  makeRng,
  generatePuzzle,
  legalMoves,
  isWin,
  type Cell,
  type Puzzle,
} from "../src/engine";

function isKnightStep(a: Cell, b: Cell): boolean {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
}

// Hand-built 4-cell puzzle on a 5×5 board with a known witness path.
// A(0,0) -> B(1,2) -> C(2,0) -> D(0,1), all valid knight steps, all distinct.
function manualPuzzle(): Puzzle {
  const path: Cell[] = [
    { r: 0, c: 0 },
    { r: 1, c: 2 },
    { r: 2, c: 0 },
    { r: 0, c: 1 },
  ];
  const n = 5;
  const available = Array.from({ length: n }, () =>
    new Array<boolean>(n).fill(false),
  );
  for (const cell of path) available[cell.r][cell.c] = true;
  return { n, available, start: path[0], end: path[3], path, seed: 0 };
}

describe("knightMoves", () => {
  test("corner has 2 moves", () => {
    expect(knightMoves({ r: 0, c: 0 }, 8)).toHaveLength(2);
  });

  test("center has 8 moves", () => {
    expect(knightMoves({ r: 4, c: 4 }, 8)).toHaveLength(8);
  });

  test("edge cell (0,1) has 3 moves", () => {
    expect(knightMoves({ r: 0, c: 1 }, 8)).toHaveLength(3);
  });

  test("all moves stay in-bounds", () => {
    for (const m of knightMoves({ r: 1, c: 1 }, 5)) {
      expect(m.r).toBeGreaterThanOrEqual(0);
      expect(m.r).toBeLessThan(5);
      expect(m.c).toBeGreaterThanOrEqual(0);
      expect(m.c).toBeLessThan(5);
    }
  });
});

describe("makeRng", () => {
  test("same seed → identical stream, values in [0, 1)", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(b()).toBe(v);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("different seeds → different streams", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const sameForAll = Array.from({ length: 10 }, () => a() === b()).every(
      Boolean,
    );
    expect(sameForAll).toBe(false);
  });
});

describe("generatePuzzle", () => {
  const cases: Array<[number, number, number]> = [
    [6, 14, 7],
    [5, 8, 3],
    [8, 22, 99],
  ];

  for (const [n, steps, seed] of cases) {
    test(`structure is valid for n=${n}, steps=${steps}, seed=${seed}`, () => {
      const p = generatePuzzle(n, steps, seed);

      // available is exactly n×n.
      expect(p.available).toHaveLength(n);
      for (const row of p.available) expect(row).toHaveLength(n);

      // length bounds.
      expect(p.path.length).toBeGreaterThanOrEqual(2);
      expect(p.path.length).toBeLessThanOrEqual(Math.min(steps + 1, n * n));

      // every cell in-bounds, distinct, available, knight steps between them.
      const seen = new Set<string>();
      for (let i = 0; i < p.path.length; i++) {
        const cell = p.path[i];
        expect(cell.r).toBeGreaterThanOrEqual(0);
        expect(cell.r).toBeLessThan(n);
        expect(cell.c).toBeGreaterThanOrEqual(0);
        expect(cell.c).toBeLessThan(n);
        expect(p.available[cell.r][cell.c]).toBe(true);
        const k = `${cell.r},${cell.c}`;
        expect(seen.has(k)).toBe(false); // no revisits
        seen.add(k);
        if (i > 0) expect(isKnightStep(p.path[i - 1], cell)).toBe(true);
      }

      // every true cell corresponds to exactly one witness path cell.
      let trueCells = 0;
      for (const row of p.available) for (const v of row) if (v) trueCells++;
      expect(trueCells).toBe(p.path.length);

      // start/end line up with the path ends, and the witness solves it.
      expect(p.start).toEqual(p.path[0]);
      expect(p.end).toEqual(p.path[p.path.length - 1]);
      expect(isWin(p, p.path)).toBe(true);
    });
  }

  test("clamps steps to n*n - 1 (path never exceeds the board)", () => {
    const p = generatePuzzle(5, 1000, 3);
    expect(p.path.length).toBeLessThanOrEqual(25);
  });

  test("deterministic: same (n, steps, seed) → deep-equal puzzle", () => {
    expect(generatePuzzle(6, 14, 42)).toEqual(generatePuzzle(6, 14, 42));
  });

  test("different seeds → more than one distinct puzzle", () => {
    const shapes = new Set<string>();
    for (let seed = 1; seed <= 6; seed++) {
      shapes.add(JSON.stringify(generatePuzzle(6, 14, seed).path));
    }
    expect(shapes.size).toBeGreaterThan(1);
  });

  describe("invalid inputs throw", () => {
    test("n < 3", () => expect(() => generatePuzzle(2, 5, 1)).toThrow());
    test("steps < 1", () => expect(() => generatePuzzle(5, 0, 1)).toThrow());
    test("non-integer n", () =>
      expect(() => generatePuzzle(5.5, 5, 1)).toThrow());
    test("non-integer seed", () =>
      expect(() => generatePuzzle(5, 5, 1.5)).toThrow());
  });
});

describe("legalMoves", () => {
  test("only available, unvisited, knight-reachable cells", () => {
    const p = manualPuzzle();
    const moves = legalMoves(p, p.start, [p.start]);
    // From A(0,0): knight cells are (1,2) and (2,1); only (1,2) is available.
    expect(moves).toEqual([{ r: 1, c: 2 }]);
  });

  test("excludes already-visited cells", () => {
    const p = manualPuzzle();
    const moves = legalMoves(p, { r: 1, c: 2 }, [
      { r: 0, c: 0 },
      { r: 1, c: 2 },
      { r: 2, c: 0 },
    ]);
    // From B(1,2): available neighbours are A and C, both visited → none left.
    expect(moves).toEqual([]);
  });

  test("does not mutate the provided visited collection", () => {
    const p = manualPuzzle();
    const visited: Cell[] = [{ r: 0, c: 0 }];
    legalMoves(p, p.start, visited);
    expect(visited).toEqual([{ r: 0, c: 0 }]);
    expect(visited).toHaveLength(1);
  });
});

describe("isWin", () => {
  const p = manualPuzzle();
  const win: Cell[] = p.path;

  test("true for the witness path", () => {
    expect(isWin(p, win)).toBe(true);
  });

  test("false for a partial path", () => {
    expect(isWin(p, win.slice(0, 3))).toBe(false);
  });

  test("false when it does not start/end correctly (reversed)", () => {
    expect(isWin(p, [...win].reverse())).toBe(false);
  });

  test("false on a non-knight step (covers all cells, right ends)", () => {
    // Swap B and C: covers all, distinct, A..D, but A->C is not a knight move.
    expect(
      isWin(p, [
        { r: 0, c: 0 },
        { r: 2, c: 0 },
        { r: 1, c: 2 },
        { r: 0, c: 1 },
      ]),
    ).toBe(false);
  });

  test("false on a duplicate visit (length & ends look plausible)", () => {
    // Right length (4), right start/end, but B repeated and C missing.
    expect(
      isWin(p, [
        { r: 0, c: 0 },
        { r: 1, c: 2 },
        { r: 1, c: 2 },
        { r: 0, c: 1 },
      ]),
    ).toBe(false);
  });

  test("false when the path includes an unavailable cell", () => {
    expect(
      isWin(p, [
        { r: 0, c: 0 },
        { r: 1, c: 2 },
        { r: 4, c: 4 }, // in-bounds but not part of the puzzle
        { r: 0, c: 1 },
      ]),
    ).toBe(false);
  });
});
