import { useEffect, useRef, useState } from 'react';
import { LOCATIONS, blouseById, museumById, type MuseumDef, type MuseumPiece } from '../content';
import { collectArtCard, itemKey } from '../db/queries';
import { useOwned, useStats } from '../db/useStats';
import { renderPieceArt } from '../game/fx/artRendition';
import { ruleProgress } from '../rules/unlocks';
import { useStore } from '../store';
import { DecoPanel } from '../ui/DecoPanel';
import { PixelIcon } from '../ui/PixelIcon';
import { ScreenFrame } from '../ui/ScreenFrame';
import { walkThen } from '../ui/walkThen';

/** A small pixel rendition of a work, drawn at whole-number scale. */
export function PieceArt({ piece, scale }: { piece: MuseumPiece; scale: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const src = renderPieceArt(piece);
    const cv = ref.current;
    if (!cv) return;
    cv.width = src.width * scale;
    cv.height = src.height * scale;
    const c = cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.drawImage(src, 0, 0, cv.width, cv.height);
    setSize({ w: cv.width, h: cv.height });
  }, [piece, scale]);
  return <canvas ref={ref} className="piece-art" style={{ width: size.w || undefined, height: size.h || undefined }} aria-hidden="true" />;
}

/**
 * One generic museum scene driven by museums.json. Roxy walks to a piece, admires it, and its
 * Art Card opens. Seeing every piece earns the museum's badge (at the Met, also a blouse inspired by it).
 */
export function MuseumScreen({ museumId }: { museumId: string }) {
  const museum = museumById(museumId);
  const navigate = useStore((s) => s.navigate);
  const stats = useStats();
  if (!museum) {
    return (
      <ScreenFrame title="Museum" subtitle="2026">
        <div className="center-fill">
          <p>That museum is not on the map.</p>
          <button className="deco-btn" onClick={() => navigate({ name: 'map' })}>
            Back to the map
          </button>
        </div>
      </ScreenFrame>
    );
  }
  const loc = LOCATIONS.find((l) => l.museum === museum.id);
  const gate = loc && stats ? ruleProgress(loc.unlock, stats) : null;
  if (gate && !gate.done) {
    return (
      <ScreenFrame title={museum.name} subtitle={`${museum.city} · 2026`}>
        <div className="center-fill">
          <DecoPanel title="Not open to you yet" unfold>
            <p>{gate.label} to visit.</p>
            <div className="meter" aria-label={`${gate.have} of ${gate.need}`}>
              <span style={{ width: `${Math.min(100, (gate.have / gate.need) * 100)}%` }} />
            </div>
            <button className="deco-btn" onClick={() => navigate({ name: 'map' })}>
              Back to the map
            </button>
          </DecoPanel>
        </div>
      </ScreenFrame>
    );
  }
  return <Gallery museum={museum} />;
}

function Gallery({ museum }: { museum: MuseumDef }) {
  const owned = useOwned();
  const toast = useStore((s) => s.toast);
  const [card, setCard] = useState<MuseumPiece | null>(null);
  const cancel = useRef<() => void>(() => undefined);
  const seen = museum.pieces.filter((p) => owned?.has(itemKey.artCard(p.id))).length;
  const badge = owned?.has(itemKey.badge(museum.id));

  useEffect(() => () => cancel.current(), []);
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), setCard(null));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  const visit = (piece: MuseumPiece, x: number) => {
    cancel.current();
    cancel.current = walkThen(
      x,
      async () => {
        setCard(piece);
        const r = await collectArtCard(
          piece.id,
          museum.pieces.map((p) => p.id),
          museum.id,
          museum.reward.blouse,
        );
        if (r.newCard) toast(`Art Card collected: ${piece.title}`, 'gold');
        if (r.badgeEarned) toast(`${museum.reward.badge} badge!${r.blouseEarned ? ` New blouse: ${blouseById(r.blouseEarned).name}` : ''}`, 'green');
      },
      { admire: true, timeoutMs: 4000 },
    );
  };

  const link = card && museum.searchUrl ? museum.searchUrl + encodeURIComponent(card.title) : null;

  return (
    <ScreenFrame
      className="museum"
      title={museum.name}
      subtitle={`${museum.city} · 2026`}
      footer={
        <span>
          {seen}/{museum.pieces.length} Art Cards {badge ? `· ${museum.reward.badge} badge ✦` : `· see every piece for the ${museum.reward.badge} badge`}
        </span>
      }
    >
      <div className="gallery-wall" role="list" aria-label={`Works at ${museum.short}`}>
        {museum.pieces.map((p) => {
          const got = owned?.has(itemKey.artCard(p.id));
          return (
            <button
              key={p.id}
              role="listitem"
              className={`gallery-piece shape-${p.art.shape} ${got ? 'seen' : ''}`}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                visit(p, r.left + r.width / 2);
              }}
              aria-label={`${p.title}, ${p.artist}, ${p.year}${got ? ' — Art Card collected' : ''}`}
            >
              <span className="gilt-frame">
                <PieceArt piece={p} scale={4} />
              </span>
              <span className="piece-label">
                {p.title}
                <small>
                  {p.artist}, {p.year}
                </small>
              </span>
              {got && <span className="seen-mark" aria-hidden="true">✦</span>}
            </button>
          );
        })}
      </div>

      {card && (
        <div className="modal-backdrop" onClick={() => setCard(null)}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Art Card: ${card.title}`}>
            <DecoPanel unfold className="art-card">
              <span className="gilt-frame big">
                <PieceArt piece={card} scale={8} />
              </span>
              <div className="art-card-text">
                <p className="eyebrow">Art Card · {museum.short}</p>
                <h2>{card.title}</h2>
                <p className="artist">
                  {card.artist} · {card.year} · <span className="muted">{card.kind}</span>
                </p>
                <p>{card.note[0]}</p>
                <p>{card.note[1]}</p>
                <p className="muted small">
                  {museum.name}, {museum.city}.{' '}
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer">
                      Find it in the museum's collection ↗
                    </a>
                  ) : (
                    'Official collection link to be added.'
                  )}
                </p>
                <p className="muted small">Placeholder pixel rendition — the real pixel art is drawn from the museum's open-access image.</p>
                <button className="deco-btn" autoFocus onClick={() => setCard(null)}>
                  <PixelIcon name="close" scale={2} /> Close
                </button>
              </div>
            </DecoPanel>
          </div>
        </div>
      )}
    </ScreenFrame>
  );
}
