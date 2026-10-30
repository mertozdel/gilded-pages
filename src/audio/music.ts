/**
 * The music manager: one looping playlist per scene (soundtrack.json), 1.5 s crossfades,
 * its own volume, quieter in Calm, silent in Text only, paused while the tab is hidden.
 * The record player (HUD → Music) can override the scene with any unlocked track, and the
 * apartment piano plays a tune of Roxy's.
 *
 * No music is generated. Each track plays your own file from
 *   public/assets/audio/music/<track-id>.mp3   (or .ogg / .m4a)
 * where <track-id> is its id in src/content/soundtrack.json. Missing files are simply silent.
 */
import { Howl } from 'howler';
import { bus, type SceneId } from '../bus/events';
import { LOCATIONS, MUSEUMS, SOUNDTRACK, trackById, type TrackDef } from '../content';
import { useStore } from '../store';
import { isUnlocked, type ReadingStats } from '../rules/unlocks';

const FADE_MS = 1500;
const MUSIC_DIR = `${import.meta.env.BASE_URL}assets/audio/music/`;

interface Playing {
  howl: Howl;
  trackId: string;
}

/** Tracks with no file yet, so playlists skip straight past them. */
const missing = new Set<string>();
let current: Playing | null = null;
let playlistKey: string | null = null;
let playlistIndex = 0;
let recordTrack: string | null = null;
let pianoTrack: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

/** Scene → playlist. Screens that are just menus keep whatever is playing. */
function playlistFor(scene: SceneId): string | null {
  const route = useStore.getState().route;
  switch (scene) {
    case 'cafe':
    case 'apartment':
    case 'select':
      return 'cafe';
    case 'reader':
      return 'reading';
    case 'museum': {
      const m = route.name === 'museum' ? MUSEUMS.find((x) => x.id === route.museumId) : undefined;
      return m?.musicTrack ?? 'met';
    }
    default:
      return null;
  }
}

function targetVolume(): number {
  const { sound, musicVolume, readingMode } = useStore.getState().settings;
  if (!sound || readingMode === 'text') return 0;
  return musicVolume * (readingMode === 'calm' ? 0.5 : 1);
}

function fadeOut(p: Playing | null): void {
  if (!p) return;
  p.howl.fade(p.howl.volume(), 0, FADE_MS);
  window.setTimeout(() => p.howl.unload(), FADE_MS + 100);
}

function start(trackId: string): void {
  if (!trackById(trackId) || missing.has(trackId)) return;
  if (current?.trackId === trackId) return;
  const old = current;
  const howl = new Howl({
    src: ['mp3', 'ogg', 'm4a'].map((ext) => `${MUSIC_DIR}${trackId}.${ext}`),
    html5: true,
    volume: 0,
    loop: !!(recordTrack || pianoTrack),
  });
  const playing: Playing = { howl, trackId };
  howl.once('load', () => {
    if (current !== playing) return howl.unload();
    fadeOut(old);
    howl.play();
    howl.fade(0, targetVolume(), FADE_MS);
    notify();
  });
  howl.once('loaderror', () => {
    missing.add(trackId);
    if (current !== playing) return;
    current = old;
    // No file for this one: try the next in the playlist (once round, at most).
    if (!recordTrack && !pianoTrack) advance();
    notify();
  });
  howl.on('end', () => {
    if (recordTrack || pianoTrack || current !== playing) return;
    advance();
  });
  current = playing;
}

function advance(): void {
  if (!playlistKey) return;
  const list = (SOUNDTRACK.scenes[playlistKey] ?? []).filter((id) => !missing.has(id));
  if (!list.length) return;
  playlistIndex = (playlistIndex + 1) % list.length;
  start(list[playlistIndex]);
}

let lastScene: SceneId = 'cafe';

/** Scenes with their own audio (the rhythm games): the café's music, records included, stops. */
const OWN_AUDIO: SceneId[] = ['venue', 'dev'];

function onScene(scene: SceneId): void {
  if (OWN_AUDIO.includes(scene)) {
    recordTrack = null;
    pianoTrack = null;
    playlistKey = null;
    fadeOut(current);
    current = null;
    notify();
    return;
  }
  lastScene = scene;
  const key = playlistFor(scene);
  if (pianoTrack) {
    if (scene === 'apartment') return;
    stopPiano(false);
  }
  if (recordTrack) return;
  if (!key) return;
  if (key !== playlistKey) {
    playlistKey = key;
    playlistIndex = 0;
  }
  const list = (SOUNDTRACK.scenes[key] ?? []).filter((id) => !missing.has(id));
  if (list.length) start(list[playlistIndex % list.length]);
}

export function initMusic(): void {
  bus.on('scene:enter', ({ scene }) => onScene(scene));
  bus.on('piano:play', ({ trackId }) => playPiano(trackId));
  bus.on('piano:stop', () => stopPiano());
  const first = bus.last('scene:enter');
  if (first) onScene(first.scene);
  useStore.subscribe((s, prev) => {
    if (s.settings === prev.settings || !current) return;
    current.howl.fade(current.howl.volume(), targetVolume(), 400);
  });
  document.addEventListener('visibilitychange', () => {
    if (!current?.howl.state || current.howl.state() !== 'loaded') return;
    if (document.hidden) current.howl.pause();
    else if (!current.howl.playing()) current.howl.play();
  });
}

// ---------- record player ----------

/** The track actually playing (null while nothing has a file). */
export function nowPlaying(): TrackDef | null {
  return current && current.howl.state() === 'loaded' ? (trackById(current.trackId) ?? null) : null;
}

export function recordPlaying(): string | null {
  return recordTrack;
}

/** True once a track was tried and has no file in public/assets/audio/music/. */
export function isMissing(trackId: string): boolean {
  return missing.has(trackId);
}

export function onMusicChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function playRecord(trackId: string): void {
  pianoTrack = null;
  recordTrack = trackId;
  start(trackId);
  current?.howl.loop(true);
  notify();
}

export function stopRecord(resume = true): void {
  recordTrack = null;
  if (resume) {
    playlistKey = null;
    onScene(lastScene);
  }
  notify();
}

// ---------- the apartment piano ----------

export function pianoPlaying(): string | null {
  return pianoTrack;
}

/** The tunes Roxy knows by heart. */
export function pianoRepertoire(): TrackDef[] {
  return (SOUNDTRACK.scenes.piano ?? []).map((id) => trackById(id)).filter((t): t is TrackDef => !!t);
}

function playPiano(trackId: string): void {
  recordTrack = null;
  pianoTrack = trackId;
  start(trackId);
  current?.howl.loop(true);
  notify();
}

function stopPiano(resume = true): void {
  if (!pianoTrack) return;
  pianoTrack = null;
  if (resume) {
    playlistKey = null;
    onScene(lastScene);
  }
  notify();
}

/** Tracks the record player can play: the café and reading sets, plus every unlocked place. */
export function unlockedTracks(stats: ReadingStats): { track: TrackDef; from: string }[] {
  const out: { track: TrackDef; from: string }[] = [];
  const add = (key: string, from: string) => {
    for (const id of SOUNDTRACK.scenes[key] ?? []) {
      const t = trackById(id);
      if (t && !out.some((o) => o.track.id === id)) out.push({ track: t, from });
    }
  };
  add('cafe', 'Café Machorn');
  add('piano', "Roxy's piano");
  add('reading', 'Reading Room');
  for (const m of MUSEUMS) {
    const loc = LOCATIONS.find((l) => l.museum === m.id);
    if (loc && isUnlocked(loc, stats)) add(m.musicTrack, m.short);
  }
  const places: [string, string][] = [
    ['speakeasy', 'speakeasy'],
    ['party', 'mansion-lawn-party'],
    ['dock', 'green-light-dock'],
    ['valley', 'valley-of-ashes'],
  ];
  for (const [key, locId] of places) {
    const loc = LOCATIONS.find((l) => l.id === locId);
    if (loc && isUnlocked(loc, stats)) add(key, loc.name);
  }
  return out;
}
