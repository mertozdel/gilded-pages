import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/limelight/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/600.css';
import './ui/theme.css';
import './reader/reader.css';
import './ui/crew.css';
import './ui/venue.css';
import { App } from './app/App';
import { boot } from './app/boot';
import { initPixelScale } from './game/pixelScale';
import { mountGame } from './game/GameRoot';

initPixelScale();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

boot()
  .then(() => mountGame(document.getElementById('game-layer')!))
  .catch((e) => {
    console.error('[boot]', e);
    document.getElementById('root')!.textContent = 'Gilded Pages could not open its local library (IndexedDB). Is private browsing blocking storage?';
  });
