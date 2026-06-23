import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {/* Vercel Web Analytics — only mounted in the production build, so it is
        fully inert in local dev / the smoke gate. Collects on the Vercel
        deployment (the dashboard toggle is enabled). No PII, no cookies. */}
    {import.meta.env.PROD && <Analytics />}
  </StrictMode>,
);
