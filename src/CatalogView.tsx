import { getCatalog, type CatalogPuzzle } from "./catalog";

type CatalogViewProps = {
  onPick: (puzzle: CatalogPuzzle) => void;
  onRandom: () => void;
};

// The landing page: 100 puzzles, easiest first, plus a "generate random" escape
// hatch. `getCatalog()` returns a memoized SHARED array — read only (map is
// fine; never sort/reverse/mutate it in place).
export default function CatalogView({ onPick, onRandom }: CatalogViewProps) {
  const puzzles = getCatalog();
  return (
    <section className="catalog" aria-label="Puzzle list">
      <p className="tagline">
        Pick a puzzle — ordered easiest (1) to hardest (100).
      </p>

      <ul className="catalog-grid">
        {puzzles.map((p) => (
          <li key={p.number}>
            <button
              type="button"
              className="puzzle-tile"
              data-puzzle={p.number}
              onClick={() => onPick(p)}
              aria-label={`Puzzle ${p.number}, difficulty ${p.difficultyScore.toLocaleString()}`}
            >
              <span className="tile-number">{p.number}</span>
            </button>
          </li>
        ))}
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
