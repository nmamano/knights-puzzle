import { useEffect } from "react";

// Evidence surface: the smoke test asserts against window.__KP__, never pixels.
declare global {
  interface Window {
    __KP__?: Record<string, unknown>;
  }
}

export default function App() {
  useEffect(() => {
    window.__KP__ = { ready: true };
  }, []);

  return (
    <main>
      <h1>Knight's Puzzle</h1>
      <p>Skeleton ready — the game lands in the next slices.</p>
    </main>
  );
}
