import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './styles/global.css';
import { App } from './App';
import { applyDom, getSettings } from './stores/settings';

applyDom(getSettings());

export const P2P = import.meta.env.VITE_P2P === '1';

async function start() {
  if (P2P) {
    const { bootP2P } = await import('./local/boot');
    await bootP2P();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}
void start();
