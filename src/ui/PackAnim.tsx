import { useEffect, useRef, useState } from 'react';

/**
 * A sprite-pack animation in the page (the dialogue's close-ups): the same atlas and anims JSON
 * the game loads (`<pack>_sheet.json`, `<pack>_anims.json`), each frame held for its own
 * duration. Drawn smooth at any size: full quality, no pixel snapping.
 */
interface Atlas {
  sheetUrl: string;
  sheetW: number;
  sheetH: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
  anims: Record<string, { repeat: number; frames: { frame: string; duration: number }[] }>;
}

const atlases = new Map<string, Promise<Atlas>>();

function loadAtlas(dir: string, pack: string): Promise<Atlas> {
  const key = `${dir}/${pack}`;
  let p = atlases.get(key);
  if (!p) {
    const base = `${import.meta.env.BASE_URL}assets/sprites/${dir}/${pack}`;
    p = Promise.all([fetch(`${base}_sheet.json`).then((r) => r.json()), fetch(`${base}_anims.json`).then((r) => r.json())]).then(([sheet, anims]) => ({
      sheetUrl: `${base}_sheet.png`,
      sheetW: sheet.meta?.size?.w ?? 0,
      sheetH: sheet.meta?.size?.h ?? 0,
      frames: Object.fromEntries(Object.entries(sheet.frames as Record<string, { frame: { x: number; y: number; w: number; h: number } }>).map(([k, v]) => [k, v.frame])),
      anims: Object.fromEntries((anims.anims as { key: string; repeat: number; frames: { frame: string; duration: number }[] }[]).map((a) => [a.key, a])),
    }));
    p.catch(() => atlases.delete(key));
    atlases.set(key, p);
  }
  return p;
}

interface Props {
  /** The folder under assets/sprites/ and the pack name (`matt`, `matt_closeup`). */
  dir: string;
  pack: string;
  anim: string;
  /** Shown width and height in CSS px (frames are drawn scaled to it). */
  size: number;
  /** A one-shot finished (anims with repeat 0). */
  onEnd?: () => void;
  className?: string;
  label?: string;
}

export function PackAnim({ dir, pack, anim, size, onEnd, className, label }: Props) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [step, setStep] = useState(0);
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  useEffect(() => {
    let live = true;
    loadAtlas(dir, pack).then((a) => live && setAtlas(a), () => undefined);
    return () => {
      live = false;
    };
  }, [dir, pack]);

  useEffect(() => setStep(0), [anim]);

  const def = atlas?.anims[anim];
  useEffect(() => {
    if (!def) return;
    const last = step >= def.frames.length - 1;
    if (last && def.repeat === 0) {
      const t = window.setTimeout(() => onEndRef.current?.(), def.frames[step].duration);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setStep((s) => (s + 1) % def.frames.length), def.frames[step]?.duration ?? 200);
    return () => window.clearTimeout(t);
  }, [def, step]);

  const f = def && atlas ? atlas.frames[def.frames[Math.min(step, def.frames.length - 1)].frame] : null;
  const k = f ? size / f.w : 1;
  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      data-anim={anim}
      style={{
        width: size,
        height: f ? f.h * k : size,
        backgroundImage: atlas ? `url(${atlas.sheetUrl})` : undefined,
        backgroundSize: atlas ? `${atlas.sheetW * k}px ${atlas.sheetH * k}px` : undefined,
        backgroundPosition: f ? `${-f.x * k}px ${-f.y * k}px` : undefined,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
