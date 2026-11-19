import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/global.css';
import { App } from '@/app/App';
import { registerPwa } from '@/pwa';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) registerPwa();
