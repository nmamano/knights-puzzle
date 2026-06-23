import { test, expect, describe } from "bun:test";
import { branchingProfile, difficultyScore, hint } from "../src/analysis";
import { generatePuzzle, type Cell, type Puzzle } from "../src/engine";
import { newGame, tryMove, type GameState } from "../src/game";

// Build a puzzle from an explicit witness `path` plus optional `decoys` — extra
// playable cells that are NOT on the path but exist to inflate a step's legal
// option count in a controlled way. Everything else on the n×n board is blocked.
function buildPuzzle(n: number, path: Cell[], decoys: Cell[] = []): Puzzle {
  const available = Array.from({ length: n }, () =>
    new Array<boolean>(n).fill(false),
  );
  for (const c of [...path, ...decoys]) available[c.r][c.c] = true;
  return {
    n,
    available,
    start: path[0],
    end: path[path.length - 1],
    path,
    seed: 0,
  };
}

describe("branchingProfile", () => {
  test("a fully forced path has no branch points (all 1s)", () => {
    // (0,0)->(2,1)->(0,2): only the path cells are playable, so at every step
    // the only available, unvisited knight-neighbour is the next path cell.
    const p = buildPuzzle(5, [
      { r: 0, c: 0 },
      { r: 2, c: 1 },
      { r: 0, c: 2 },
    ]);
    expect(branchingProfile(p)).toEqual([1, 1]);
  });

  test("counts the correct next cell PLUS available decoys at each step", () => {
    // Path (0,0)->(1,2)->(2,4)->(3,6) on 8×8 with decoys chosen so the profile
    // is exactly [2, 3, 4] (verified against the geometry, no contamination).
    const path: Cell[] = [
      { r: 0, c: 0 },
      { r: 1, c: 2 },
      { r: 2, c: 4 },
      { r: 3, c: 6 },
    ];
    const decoys: Cell[] = [
      { r: 2, c: 1 }, // extra neighbour of (0,0) -> step 0 has 2 options
      { r: 0, c: 4 }, // extra neighbours of (1,2) -> step 1 has 3 options
      { r: 2, c: 0 },
      { r: 0, c: 3 }, // extra neighbours of (2,4) -> step 2 has 4 options
      { r: 0, c: 5 },
      { r: 1, c: 6 },
    ];
    expect(branchingProfile(buildPuzzle(8, path, decoys))).toEqual([2, 3, 4]);
  });

  test("the profile has one entry per move", () => {
    const p = generatePuzzle(6, 14, 7);
    expect(branchingProfile(p).length).toBe(p.path.length - 1);
  });
});

describe("difficultyScore", () => {
  test("a fully forced path scores 1", () => {
    const p = buildPuzzle(5, [
      { r: 0, c: 0 },
      { r: 2, c: 1 },
      { r: 0, c: 2 },
    ]);
    expect(difficultyScore(p)).toBe(1);
  });

  test("branch counts [2,3,4] multiply to 24", () => {
    const path: Cell[] = [
      { r: 0, c: 0 },
      { r: 1, c: 2 },
      { r: 2, c: 4 },
      { r: 3, c: 6 },
    ];
    const decoys: Cell[] = [
      { r: 2, c: 1 },
      { r: 0, c: 4 },
      { r: 2, c: 0 },
      { r: 0, c: 3 },
      { r: 0, c: 5 },
      { r: 1, c: 6 },
    ];
    expect(difficultyScore(buildPuzzle(8, path, decoys))).toBe(24);
  });

  test("forced single-option steps (factor 1) are ignored", () => {
    // Profile [1, 2]: a forced first move, then a real branch -> score 2.
    const p = buildPuzzle(
      5,
      [
        { r: 0, c: 0 },
        { r: 2, c: 1 },
        { r: 0, c: 2 },
      ],
      [{ r: 1, c: 3 }], // extra neighbour of (2,1) -> step 1 has 2 options
    );
    expect(branchingProfile(p)).toEqual([1, 2]);
    expect(difficultyScore(p)).toBe(2);
  });

  test("equals the product of the >=2 branch factors of a generated puzzle", () => {
    const p = generatePuzzle(6, 14, 7);
    const expected = branchingProfile(p)
      .filter((x) => x >= 2)
      .reduce((a, b) => a * b, 1);
    const s = difficultyScore(p);
    expect(s).toBe(expected);
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(1);
  });

  test("is deterministic for the same puzzle params", () => {
    expect(difficultyScore(generatePuzzle(6, 14, 7))).toBe(
      difficultyScore(generatePuzzle(6, 14, 7)),
    );
  });

  test("does not mutate the puzzle or its path", () => {
    const path: Cell[] = [
      { r: 0, c: 0 },
      { r: 1, c: 2 },
      { r: 2, c: 4 },
    ];
    const p = buildPuzzle(8, path, [{ r: 2, c: 1 }]);
    const pathSnapshot = p.path.map((c) => ({ ...c }));
    const availSnapshot = p.available.map((row) => [...row]);
    branchingProfile(p);
    difficultyScore(p);
    expect(p.path).toEqual(pathSnapshot);
    expect(p.available).toEqual(availSnapshot);
  });
});

describe("hint", () => {
  test("a finished game → status won", () => {
    let g = newGame(6, 12, 7);
    for (let i = 1; i < g.puzzle.path.length; i++) {
      g = tryMove(g, g.puzzle.path[i]);
    }
    expect(g.won).toBe(true);
    expect(hint(g).status).toBe("won");
  });

  test("at the start, the prefix hint is the next witness cell", () => {
    const g = newGame(6, 12, 7);
    const h = hint(g);
    expect(h.status).toBe("prefix");
    if (h.status === "prefix") expect(h.nextCell).toEqual(g.puzzle.path[1]);
  });

  test("following the witness keeps pointing at the next cell", () => {
    let g = newGame(6, 12, 7);
    g = tryMove(g, g.puzzle.path[1]);
    const h = hint(g);
    expect(h.status).toBe("prefix");
    if (h.status === "prefix") expect(h.nextCell).toEqual(g.puzzle.path[2]);
  });

  test("a legal move OFF the witness path → off_path (start still prefix)", () => {
    // Start (0,0) branches to B=(1,2) [the witness next] OR D=(2,1) [a decoy].
    const puzzle = buildPuzzle(
      4,
      [
        { r: 0, c: 0 },
        { r: 1, c: 2 },
        { r: 3, c: 3 },
      ],
      [{ r: 2, c: 1 }],
    );
    const start: GameState = {
      puzzle,
      knight: { r: 0, c: 0 },
      visited: [{ r: 0, c: 0 }],
      won: false,
    };
    const atStart = hint(start);
    expect(atStart.status).toBe("prefix");
    if (atStart.status === "prefix") {
      expect(atStart.nextCell).toEqual({ r: 1, c: 2 });
    }
    // Step onto the decoy D=(2,1): legal, but off the witness → off_path.
    const off = tryMove(start, { r: 2, c: 1 });
    expect(off.visited).toHaveLength(2);
    expect(hint(off).status).toBe("off_path");
  });
});
