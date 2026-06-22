import { test, expect, describe } from "bun:test";
import {
  PRESETS,
  DEFAULT_DIFFICULTY,
  MIN_N,
  MAX_N,
  MIN_STEPS,
  maxSteps,
  clampN,
  clampSteps,
  presetSettings,
  customSettings,
} from "../src/difficulty";

describe("difficulty presets", () => {
  test("default is medium", () => {
    expect(DEFAULT_DIFFICULTY).toBe("medium");
  });

  test("preset values match the agreed spread", () => {
    expect(PRESETS.easy).toEqual({ n: 5, steps: 8 });
    expect(PRESETS.medium).toEqual({ n: 6, steps: 14 });
    expect(PRESETS.hard).toEqual({ n: 8, steps: 24 });
  });

  test("presetSettings carries the id", () => {
    expect(presetSettings("hard")).toEqual({ id: "hard", n: 8, steps: 24 });
  });
});

describe("clamping", () => {
  test("maxSteps is n*n - 1", () => {
    expect(maxSteps(4)).toBe(15);
    expect(maxSteps(8)).toBe(63);
  });

  test("clampN bounds to [MIN_N, MAX_N]", () => {
    expect(clampN(2)).toBe(MIN_N);
    expect(clampN(99)).toBe(MAX_N);
    expect(clampN(6)).toBe(6);
  });

  test("clampSteps bounds to [MIN_STEPS, maxSteps(n)]", () => {
    expect(clampSteps(6, 0)).toBe(MIN_STEPS);
    expect(clampSteps(6, 1000)).toBe(maxSteps(6));
    expect(clampSteps(6, 14)).toBe(14);
  });
});

describe("customSettings", () => {
  test("rounds and clamps n and steps, tags id custom", () => {
    expect(customSettings(3, 100)).toEqual({ id: "custom", n: 4, steps: 15 });
    expect(customSettings(6, 2)).toEqual({ id: "custom", n: 6, steps: 3 });
    expect(customSettings(7.4, 10.9)).toEqual({
      id: "custom",
      n: 7,
      steps: 11,
    });
  });

  test("steps is re-clamped to the (possibly smaller) board", () => {
    // Asking for 60 steps on a 4×4 board clamps to 15.
    expect(customSettings(4, 60).steps).toBe(maxSteps(4));
  });
});
