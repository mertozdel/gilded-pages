import { useEffect, useState } from 'react';
import { closeUpFor, linesFor, REGULAR, regularLines, type CloseUp, type RegularLine, type RegularMood } from '../../content/regular';
import { PackAnim } from '../../ui/PackAnim';
import { PixelIcon } from '../../ui/PixelIcon';
import '../../ui/regular.css';

const MOOD_LABEL: Record<RegularMood, string> = { calm: 'calm', busy: 'busy', stressed: 'stressed' };
const STILL_SRC = (still: 'anxious' | 'stressed' | 'sad') => `${import.meta.env.BASE_URL}assets/sprites/${REGULAR.portraitBase}/portraits/matt_emotion_${still}.png`;

/**
 * Talking to Mert, the regular: his close-up on the left, a line on the right. Lines come from
 * npcs.json by his mood and never repeat until the rest of that mood's lines have been said.
 * Calm, he's animated (looking round for a line about the room or the music, sipping right
 * after a refill, moving a little on a long line); busy or stressed, an emotion still.
 */
export function RegularDialogue({ mood, justRefilled, onClose }: { mood: RegularMood; justRefilled: boolean; onClose: () => void }) {
  const [line, setLine] = useState<RegularLine>(() => regularLines.next(`${REGULAR.id}:${mood}`, linesFor(mood)));
  const [sipping, setSipping] = useState(justRefilled);
  const next = () => {
    setSipping(false);
    setLine(regularLines.next(`${REGULAR.id}:${mood}`, linesFor(mood)));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, mood]);

  const pic: CloseUp = closeUpFor(mood, line, sipping);
  return (
    <div className="regular-dialogue" role="dialog" aria-label={`Talking to ${REGULAR.name}`} data-testid="regular-dialogue" data-mood={mood}>
      <div className="regular-face">
        {pic.kind === 'anim' ? (
          <PackAnim key={pic.anim} dir={REGULAR.portraitBase} pack={`${REGULAR.portraitBase}_closeup`} anim={pic.anim} size={176} onEnd={() => setSipping(false)} label={`${REGULAR.name}, ${MOOD_LABEL[mood]}`} />
        ) : (
          <img src={STILL_SRC(pic.still)} alt={`${REGULAR.name}, ${pic.still}`} data-still={pic.still} />
        )}
      </div>
      <div className="regular-words">
        <header>
          <strong>{REGULAR.name}</strong> <span className="small muted">{REGULAR.role} · {MOOD_LABEL[mood]}</span>
          <button className="icon-btn panel-close" onClick={onClose} aria-label="Close (Esc)">
            <PixelIcon name="close" scale={2} />
          </button>
        </header>
        <p className="regular-line" data-testid="regular-line">
          “{line.text}”
        </p>
        <div className="regular-actions">
          <button className="deco-btn" onClick={next}>
            Keep chatting <kbd>Enter</kbd>
          </button>
          <button className="deco-btn" onClick={onClose}>
            Let him work <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

