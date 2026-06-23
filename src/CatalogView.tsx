import { getCatalog, type CatalogPuzzle } from "./catalog";
import { solvedCount, type SolvedMap } from "./storage";

type CatalogViewProps = {
  onPick: (puzzle: CatalogPuzzle) => void;
  onRandom: () => void;
  solved: SolvedMap;
};

// The landing page: 100 puzzles, easiest first, with solved (✓) / perfect (★)
// badges, plus a "generate random" escape hatch. `getCatalog()` returns a
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
      <p className="tagline">
        Pick a puzzle — ordered easiest (1) to hardest (100).
      </p>
      <p className="catalog-progress" role="status">
        Solved {done} / {puzzles.length}
      </p>

      <ul className="catalog-grid">
        {puzzles.map((p) => {
          const rec = solved[p.id];
          const isSolved = !!rec?.solved;
          const isPerfect = !!rec?.perfect;
          const state = isPerfect ? " (perfect)" : isSolved ? " (solved)" : "";
          return (
            <li key={p.number}>
              <button
                type="button"
                className={`puzzle-tile${isSolved ? " solved" : ""}${
                  isPerfect ? " perfect" : ""
                }`}
                data-puzzle={p.number}
                onClick={() => onPick(p)}
                aria-label={`Puzzle ${p.number}, difficulty ${p.difficultyScore.toLocaleString()}${state}`}
              >
                <span className="tile-number">{p.number}</span>
                {isSolved && (
                  <span className="tile-badge" aria-hidden="true">
                    {isPerfect ? "★" : "✓"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="catalog-actions">
        <button type="button" className="btn primary" onClick={onRandom}>
          Generate random puzzle
        </button>
        <p className="catalog-foot">
          Random puzzles are just for fun — they aren&rsquo;t tracked.
        </p>
      </div>
    </section>
  );
}
