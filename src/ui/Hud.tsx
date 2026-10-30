import { useEffect, useRef, useState } from 'react';
import { CURRENCIES, characterById, hasFeature, type Feature } from '../content/characters';
import { saveSettings } from '../db/queries';
import { touchProfile } from '../db/profiles';
import { RecordPlayerPanel } from '../screens/cafe/RecordPlayerPanel';
import { useStore, type Route } from '../store';
import { DecoPanel } from './DecoPanel';
import { lampGlow, STREAK_MIN_PAGES } from '../rules/streak';
import { levelForXp } from '../rules/xp';
import { PixelIcon, type IconName } from './PixelIcon';

/** The navigation; an entry with a feature shows only for characters who have it. */
const NAV: { route: Route; icon: IconName; label: string; feature?: Feature }[] = [
  { route: { name: 'cafe' }, icon: 'home', label: 'Café' },
  { route: { name: 'map' }, icon: 'map', label: 'Map', feature: 'worldMap' },
  { route: { name: 'apartment' }, icon: 'blouse', label: 'Wardrobe', feature: 'wardrobe' },
  { route: { name: 'ledger' }, icon: 'ledger', label: 'Ledger', feature: 'reading' },
  { route: { name: 'settings' }, icon: 'gear', label: 'Settings' },
];

/**
 * The persistent HUD: the player's currency (Roxy's Gilt and green-light streak lamp, or a
 * crew member's Tips / Fans / Applause), navigation, the character's café action, music,
 * Switch character and help. What shows follows the character's feature flags. Same on
 * every screen; on a phone the navigation becomes the bottom tab bar (theme.css).
 */
export function Hud() {
  const player = useStore((s) => s.player);
  const route = useStore((s) => s.route);
  const navigate = useStore((s) => s.navigate);
  const setHelpOpen = useStore((s) => s.setHelpOpen);
  const character = characterById(useStore((s) => s.character));
  const profile = useStore((s) => s.profiles[s.character]);
  const setProfile = useStore((s) => s.setProfile);
  const requestCafeAction = useStore((s) => s.requestCafeAction);
  const glow = lampGlow(player.streakDays);
  const level = levelForXp(player.xp);
  const gilt = character.currency === 'gilt';
  const currency = CURRENCIES[character.currency];

  const [music, setMusic] = useState(false);
  // Bump the counter when it changes.
  const amount = gilt ? player.gilt : profile.currency;
  const [bump, setBump] = useState(false);
  const prev = useRef(amount);
  useEffect(() => {
    if (amount > prev.current) {
      setBump(true);
      const t = window.setTimeout(() => setBump(false), 450);
      prev.current = amount;
      return () => window.clearTimeout(t);
    }
    prev.current = amount;
  }, [amount]);

  /** Saves, then back to the character select screen. */
  const switchCharacter = async () => {
    const st = useStore.getState();
    await saveSettings(st.settings);
    setProfile(await touchProfile(st.character));
    navigate({ name: 'select' });
  };

  return (
    <div className="hud">
      {gilt ? (
        <span className={`hud-gilt ${bump ? 'bump' : ''}`} title={`${level.title} · ${player.xp} XP`}>
          <PixelIcon name="coin" scale={2} />
          <span className="hud-num" aria-label={`${player.gilt} Gilt`}>
            {player.gilt}
          </span>
        </span>
      ) : (
        <span className={`hud-gilt hud-currency ${bump ? 'bump' : ''}`} title={`${character.name}'s ${currency.name}`} data-testid="hud-currency">
          <span className="hud-currency-icon" aria-hidden="true">
            {currency.icon}
          </span>
          <span className="hud-num" aria-label={`${profile.currency} ${currency.name}`}>
            {profile.currency}
          </span>
        </span>
      )}
      {hasFeature(character, 'reading') && (
        <span
          className="hud-lamp"
          style={{ ['--glow' as string]: glow }}
          title={`Green light: ${player.streakDays}-day streak · ${Math.min(player.pagesToday, STREAK_MIN_PAGES)}/${STREAK_MIN_PAGES} pages today`}
        >
          <PixelIcon name="lamp" scale={2} />
          <span className="hud-num">{player.streakDays}</span>
        </span>
      )}
      <span className="hud-sep" aria-hidden="true" />
      <nav className="hud-nav" aria-label="Main">
        {NAV.filter((n) => !n.feature || hasFeature(character, n.feature)).map((n) => (
          <button
            key={n.route.name}
            className={`hud-btn ${route.name === n.route.name ? 'active' : ''}`}
            onClick={() => navigate(n.route)}
            aria-current={route.name === n.route.name ? 'page' : undefined}
            title={n.label}
          >
            <PixelIcon name={n.icon} scale={2} />
            <span className="hud-label">{n.label}</span>
          </button>
        ))}
      </nav>
      {character.action && route.name === 'cafe' && (
        <button className="hud-btn hud-action" onClick={requestCafeAction} title={character.action}>
          <PixelIcon name={hasFeature(character, 'latteArt') ? 'cup' : 'star'} scale={2} />
          <span className="hud-label">{character.action}</span>
        </button>
      )}
      <button className={`hud-btn hud-music-btn ${music ? 'active' : ''}`} onClick={() => setMusic((m) => !m)} title="Music" aria-expanded={music}>
        <PixelIcon name="note" scale={2} />
        <span className="hud-label">Music</span>
      </button>
      {music && (
        <div className="hud-music" role="dialog" aria-label="Music">
          <DecoPanel title="Music" unfold>
            <button className="icon-btn panel-close" onClick={() => setMusic(false)} aria-label="Close">
              <PixelIcon name="close" scale={2} />
            </button>
            <RecordPlayerPanel />
          </DecoPanel>
        </div>
      )}
      <button className="hud-btn hud-switch" onClick={() => void switchCharacter()} title="Switch character">
        <PixelIcon name="swap" scale={2} />
        <span className="sr-only">Switch character</span>
      </button>
      <button className="hud-btn hud-help" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
        <PixelIcon name="help" scale={2} />
        <span className="sr-only">Keyboard shortcuts</span>
      </button>
    </div>
  );
}
