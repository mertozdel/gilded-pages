import type { ReactNode } from 'react';
import { Hud } from './Hud';

interface Props {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Replaces the title block (the reader uses this for book title + tools). */
  headerLeft?: ReactNode;
  footer?: ReactNode;
  /** Full-screen on a phone: no tab bar (the reader). */
  immersive?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Every screen shares one layout: a thin deco header with the HUD, the screen body and a
 * footer. Screens with a world put a RoomView in the body; the isometric room is drawn by
 * the game under it. On a phone the HUD's navigation is a tab bar along the bottom, and the
 * footer only shows on immersive screens (the reader's progress line).
 */
export function ScreenFrame({ title, subtitle, headerLeft, footer, immersive, className, children }: Props) {
  return (
    <div className={`screen ${immersive ? 'screen-immersive' : ''} ${className ?? ''}`}>
      <header className="screen-header">
        <div className="screen-title">
          {headerLeft ?? (
            <>
              <h1>{title}</h1>
              {subtitle && <p className="screen-subtitle">{subtitle}</p>}
            </>
          )}
        </div>
        <Hud />
      </header>
      <main className="screen-body">{children}</main>
      <footer className="screen-footer">{footer}</footer>
    </div>
  );
}
