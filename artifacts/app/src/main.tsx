import { createRoot } from 'react-dom/client';

import App from './App';
import { registerServiceWorker } from './lib/service-worker';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

registerServiceWorker();
