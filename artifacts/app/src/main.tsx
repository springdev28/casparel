import { createRoot } from 'react-dom/client';

import App from './App';
import { watchInstallPrompt } from './lib/install-prompt';
import { registerServiceWorker } from './lib/service-worker';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

registerServiceWorker();
// Before the first render finishes, not when /download opens: the browser
// offers to install once, whenever it decides to, and an offer nobody was
// listening for is not repeated.
watchInstallPrompt();
