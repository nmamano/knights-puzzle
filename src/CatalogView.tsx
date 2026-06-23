import { getCatalog, type CatalogPuzzle } from "./catalog";
import { isRecordPerfect, solvedCount, type SolvedMap } from "./storage";
import { maxSteps, MAX_N, MIN_N, MIN_STEPS, type Settings } from "./difficulty";

type CatalogViewProps = {
  onPick: (puzzle: CatalogPuzzle) => void;
  onRandom: () => void;
  onRandomN: (n: number) => void;
  onRandomSteps: (steps: number) => void;
  randomSettings: Settings;
  solved: SolvedMap;
};

// The landing page: 100 puzzles (solved ✓ / perfect ★), plus a "random puzzle"
// section with board-size + path-length knobs. `getCatalog()` returns a memoized
// SHARED array — read only (map is fine; never mutate it in place).
export default function CatalogView({
  onPick,
  onRandom,
  onRandomN,
  onRandomSteps,
  randomSettings,
  solved,
}: CatalogViewProps) {
  const puzzles = getCatalog();
  const done = solvedCount(solved);
  return (
    <section className="catalog" aria-label="Puzzle list">
      <p className="catalog-progress" role="status">
        Solved {done} / {puzzles.length}
      </p>

      <ul className="catalog-grid">
        {puzzles.map((p) => {
          const rec = solved[p.id];
          const isPerfect = !!rec && isRecordPerfect(rec);
          const state = isPerfect
            ? " (perfect)"
            : rec
              ? ` (solved ${rec.bestScore} of ${rec.total})`
              : "";
          return (
            <li key={p.number}>
              <button
                type="button"
                className={`puzzle-tile${rec ? " solved" : ""}${
                  isPerfect ? " perfect" : ""
                }`}
                data-puzzle={p.number}
                onClick={() => onPick(p)}
                aria-label={`Puzzle ${p.number}, difficulty ${p.difficultyScore.toLocaleString()}${state}`}
              >
                <span className="tile-number">{p.number}</span>
                {isPerfect && (
                  <span className="tile-badge" aria-hidden="true">
                    ★
                  </span>
                )}
                {rec && !isPerfect && (
                  <span className="tile-score" aria-hidden="true">
                    {rec.bestScore}/{rec.total}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="random-panel">
        <h2 className="random-title">Random puzzle</h2>
        <div className="random-sliders">
          <label className="slider">
            <span>
              Board size: <strong>{randomSettings.n}</strong>
            </span>
            <input
              type="range"
              min={MIN_N}
              max={MAX_N}
              step={1}
              value={randomSettings.n}
              aria-label="Board size"
              onChange={(e) => onRandomN(Number(e.target.value))}
            />
          </label>
          <label className="slider">
            <span>
              Path length: <strong>{randomSettings.steps}</strong> (
              {randomSettings.steps + 1} cells)
            </span>
            <input
              type="range"
              min={MIN_STEPS}
              max={maxSteps(randomSettings.n)}
              step={1}
              value={randomSettings.steps}
              aria-label="Path length"
              onChange={(e) => onRandomSteps(Number(e.target.value))}
            />
          </label>
        </div>
        <button type="button" className="btn primary" onClick={onRandom}>
          Generate random puzzle
        </button>
      </div>
    </section>
  );
}
