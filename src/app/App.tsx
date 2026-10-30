import { useEffect } from 'react';
import { useStore } from '../store';
import { CafeScreen } from '../screens/CafeScreen';
import { CharacterSelectScreen } from '../screens/CharacterSelectScreen';
import { VenueScreen } from '../screens/VenueScreen';
import { ChartEditorScreen } from '../screens/dev/ChartEditorScreen';
import { RhythmTestScreen } from '../screens/dev/RhythmTestScreen';
import { TravelCutscene } from '../ui/TravelCutscene';
import { RouteFade } from '../ui/RouteFade';
import { MuseumScreen } from '../screens/MuseumScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { WorldMapScreen } from '../screens/WorldMapScreen';
import { ApartmentScreen } from '../screens/ApartmentScreen';
import { LedgerScreen } from '../screens/LedgerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Toasts } from '../ui/Toasts';
import { HelpOverlay } from '../ui/HelpOverlay';
import { isTypingTarget } from '../ui/keys';

/**
 * The React UI. The Phaser game is NOT in this tree: it lives in #game-layer, mounted once
 * in main.tsx, so no route change can ever remount Roxy.
 */
export function App() {
  const booted = useStore((s) => s.booted);
  const route = useStore((s) => s.route);
  const mode = useStore((s) => s.settings.readingMode);
  const night = useStore((s) => s.settings.nightMode);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setHelpOpen]);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    document.documentElement.dataset.night = String(night);
  }, [mode, night]);

  if (!booted) {
    return (
      <div className="splash" role="status">
        <span className="sunburst-spinner" />
        <p>Unlocking Café Machorn…</p>
      </div>
    );
  }

  let screen;
  switch (route.name) {
    case 'reader':
      screen = <ReaderScreen key={route.bookId} bookId={route.bookId} />;
      break;
    case 'map':
      screen = <WorldMapScreen />;
      break;
    case 'museum':
      screen = <MuseumScreen key={route.museumId} museumId={route.museumId} />;
      break;
    case 'apartment':
      screen = <ApartmentScreen />;
      break;
    case 'ledger':
      screen = <LedgerScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
    case 'select':
      screen = <CharacterSelectScreen />;
      break;
    case 'venue':
      screen = <VenueScreen key={route.venue} venue={route.venue} />;
      break;
    case 'dev':
      screen = route.tool === 'chart-editor' ? <ChartEditorScreen /> : <RhythmTestScreen />;
      break;
    default:
      screen = <CafeScreen />;
  }

  return (
    <>
      <ErrorBoundary key={route.name}>{screen}</ErrorBoundary>
      <Toasts />
      <HelpOverlay />
      <TravelCutscene />
      <RouteFade />
    </>
  );
}
