/**
 * @fileOverview Web runtime role: creates the React root and installs global providers for the browser application.
 * System connection: renders App.tsx, which owns routing and lazy page composition.
 */
import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);
