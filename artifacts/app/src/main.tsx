/**
 * @fileOverview Web runtime role: creates the React root and installs global providers for the browser application.
 * System connection: renders App.tsx, which owns routing and lazy page composition.
 */
import { createRoot } from 'react-dom/client';

import App from './App';
import { recoverStaleChunk } from './lib/chunk-recovery';

import './index.css';

// Vite emits this before a stale lazy import becomes a render error. It most
// often means a new deployment replaced hashed chunks while the tab still has
// the previous HTML/module graph. Refresh once to load the new graph; the
// helper prevents a broken deployment from trapping the user in a reload loop.
window.addEventListener('vite:preloadError', (event) => {
  if (recoverStaleChunk(window.sessionStorage, () => window.location.reload())) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
