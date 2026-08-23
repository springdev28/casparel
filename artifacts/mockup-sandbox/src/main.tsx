/**
 * @fileOverview Repository role: implements or configures Main.
 * System connection: see docs/codebase-guide.md and docs/source-file-index.md for its package boundary and consumers.
 */
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
