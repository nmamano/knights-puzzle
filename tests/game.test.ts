import { test, expect, describe } from "bun:test";
import {
  newGame,
  tryMove,
  currentLegalMoves,
  undoMove,
  resetGame,
} from "../src/game";

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

describe("undo and reset", () => {
  test("undoMove is a no-op at the start boundary (same reference)", () => {
    const g = newGame(6, 12, 7);
    expect(undoMove(g)).toBe(g);
  });

  test("undoMove steps back one and clears won", () => {
    const g0 = newGame(6, 12, 7);
    const g1 = tryMove(g0, g0.puzzle.path[1]);
    const back = undoMove(g1);
    expect(back.knight).toEqual(g0.puzzle.start);
    expect(back.visited).toEqual([g0.puzzle.start]);
    expect(back.won).toBe(false);
  });

  test("undoMove works after a win (steps back off the end)", () => {
    let g = newGame(6, 12, 7);
    for (let i = 1; i < g.puzzle.path.length; i++) {
      g = tryMove(g, g.puzzle.path[i]);
    }
    expect(g.won).toBe(true);
    const back = undoMove(g);
    expect(back.won).toBe(false);
    expect(back.visited).toHaveLength(g.puzzle.path.length - 1);
    expect(back.knight).toEqual(g.puzzle.path[g.puzzle.path.length - 2]);
  });

  test("undoMove does not mutate the previous state", () => {
    const g0 = newGame(6, 12, 7);
    const g1 = tryMove(g0, g0.puzzle.path[1]);
    const before = g1.visited.length;
    undoMove(g1);
    expect(g1.visited).toHaveLength(before);
  });

  test("resetGame keeps the same puzzle and returns to start", () => {
    let g = newGame(6, 12, 7);
    const puzzleRef = g.puzzle;
    g = tryMove(g, g.puzzle.path[1]);
    g = tryMove(g, g.puzzle.path[2]);
    const r = resetGame(g);
    expect(r.puzzle).toBe(puzzleRef); // same puzzle / seed retained
    expect(r.knight).toEqual(puzzleRef.start);
    expect(r.visited).toEqual([puzzleRef.start]);
    expect(r.won).toBe(false);
  });

  test("resetGame after a win clears won and returns to start", () => {
    let g = newGame(6, 12, 7);
    for (let i = 1; i < g.puzzle.path.length; i++) {
      g = tryMove(g, g.puzzle.path[i]);
    }
    expect(g.won).toBe(true);
    const r = resetGame(g);
    expect(r.won).toBe(false);
    expect(r.visited).toEqual([g.puzzle.start]);
  });

  test("resetGame does not mutate the previous state", () => {
    let g = newGame(6, 12, 7);
    g = tryMove(g, g.puzzle.path[1]);
    const before = g.visited.length;
    resetGame(g);
    expect(g.visited).toHaveLength(before);
  });
});
