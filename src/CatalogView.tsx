import { getCatalog, type CatalogPuzzle } from "./catalog";
import { isRecordPerfect, solvedCount, type SolvedMap } from "./storage";

type CatalogViewProps = {
  onPick: (puzzle: CatalogPuzzle) => void;
  onRandom: () => void;
  solved: SolvedMap;
};

// The landing page: the 99-puzzle grid (solved ✓ / perfect ★ / score) plus a
// "Generate random puzzle" button. The random board-size / path-length knobs
// live in the random gameplay screen, NOT here. `getCatalog()` returns a
// memoized SHARED array — read only (map is fine; never mutate it in place).
export default function CatalogView({
  onPick,
  onRandom,
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
        <button type="button" className="btn primary" onClick={onRandom}>
          Generate random puzzle
        </button>
      </div>
    </section>
  );
}
