import { test, expect, describe } from "bun:test";
import { newGame, tryMove, currentLegalMoves } from "../src/game";

describe("game state", () => {
  test("newGame places the knight on the start square", () => {
    const g = newGame(6, 12, 7);
    expect(g.knight).toEqual(g.puzzle.start);
    expect(g.visited).toEqual([g.puzzle.start]);
    expect(g.won).toBe(false);
  });

  test("an illegal move is a no-op (same reference)", () => {
    const g = newGame(6, 12, 7);
    // The start square is never a legal move — the knight cannot stay put.
    expect(tryMove(g, g.puzzle.start)).toBe(g);
  });

  test("a legal move advances and records the knight", () => {
    const g = newGame(6, 12, 7);
    const next = g.puzzle.path[1];
    const after = tryMove(g, next);
    expect(after.knight).toEqual(next);
    expect(after.visited).toEqual([g.puzzle.start, next]);
    expect(after.won).toBe(g.puzzle.path.length === 2);
  });

  test("tryMove does not mutate the previous state's visited array", () => {
    const g = newGame(6, 12, 7);
    const before = g.visited.length;
    tryMove(g, g.puzzle.path[1]);
    expect(g.visited).toHaveLength(before);
  });

  test("following the witness solution wins and clears legal moves", () => {
    let g = newGame(6, 12, 7);
    for (let i = 1; i < g.puzzle.path.length; i++) {
      g = tryMove(g, g.puzzle.path[i]);
    }
    expect(g.won).toBe(true);
    expect(currentLegalMoves(g)).toEqual([]);
  });

  test("tryMove is a no-op once won", () => {
    let g = newGame(6, 12, 7);
    for (let i = 1; i < g.puzzle.path.length; i++) {
      g = tryMove(g, g.puzzle.path[i]);
    }
    expect(g.won).toBe(true);
    // Even a geometric knight move does nothing after the puzzle is solved.
    const knightish = { r: g.knight.r + 1, c: g.knight.c + 2 };
    expect(tryMove(g, knightish)).toBe(g);
  });
});
