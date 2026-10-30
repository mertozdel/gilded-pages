/**
 * Roxy's animation state machine. Hand-written so every transition is explicit and
 * predictable: a state only changes in response to an event listed in its row. What each
 * state looks like is in art/roxyFrames.ts.
 */
export type VState =
  | 'idle'
  | 'walk'
  | 'run'
  // the barista
  | 'wipeCounter'
  | 'takeOrder'
  | 'pullShot'
  | 'steamMilk'
  | 'latteArt'
  | 'serve'
  | 'untieApron'
  | 'wave'
  | 'charleston'
  // looking at art, back to us
  | 'admireArt'
  // seated with a book
  | 'sitRead'
  | 'turnPage'
  | 'sipCoffee'
  | 'note'
  | 'ribbonBookmark'
  | 'doze'
  // at the apartment piano, back to us
  | 'playPiano'
  // idle variants and reactions
  | 'hairSwipe'
  | 'sip'
  | 'think'
  | 'flustered';

/** Every state except the movement and resting ones is entered as a reaction. */
export type Reaction = Exclude<VState, 'idle' | 'walk' | 'run' | 'sitRead' | 'doze'>;

export type VEvent =
  | { type: 'WALK' }
  | { type: 'RUN' }
  | { type: 'ARRIVE' }
  | { type: 'ANIM_END' }
  | { type: 'SIT' }
  | { type: 'DOZE' }
  | { type: 'WAKE' }
  /** Ends a looping state (wipeCounter, steamMilk, admireArt, playPiano, sitRead). */
  | { type: 'STOP' }
  | { type: 'REACT'; reaction: Reaction };

type Target = VState | ((e: VEvent) => VState | null);

const react: Target = (e) => (e.type === 'REACT' ? e.reaction : null);
const ONE_SHOT = { ANIM_END: 'idle', WALK: 'walk', RUN: 'run', REACT: react } as const;
/** Things she does on the sofa go back to reading when they finish. */
const SEATED_SHOT = { ANIM_END: 'sitRead', STOP: 'idle', WALK: 'walk', RUN: 'run', REACT: react } as const;

const TRANSITIONS: Record<VState, Partial<Record<VEvent['type'], Target>>> = {
  // The idle animations blink and breathe on their own.
  idle: { WALK: 'walk', RUN: 'run', SIT: 'sitRead', REACT: react },
  walk: { ARRIVE: 'idle', RUN: 'run', REACT: react },
  run: { ARRIVE: 'idle', WALK: 'walk', REACT: react },
  sitRead: { DOZE: 'doze', WAKE: 'idle', STOP: 'idle', WALK: 'walk', RUN: 'run', REACT: react },
  doze: { WAKE: 'sitRead', STOP: 'idle', WALK: 'walk', RUN: 'run', REACT: react },
  turnPage: SEATED_SHOT,
  sipCoffee: SEATED_SHOT,
  note: SEATED_SHOT,
  ribbonBookmark: SEATED_SHOT,
  charleston: { ANIM_END: 'idle', RUN: 'run' },
  admireArt: { WALK: 'walk', RUN: 'run', WAKE: 'idle', STOP: 'idle', REACT: react },
  wave: ONE_SHOT,
  wipeCounter: { STOP: 'idle', WALK: 'walk', RUN: 'run', REACT: react },
  takeOrder: ONE_SHOT,
  pullShot: ONE_SHOT,
  steamMilk: { STOP: 'idle', RUN: 'run', REACT: react },
  latteArt: ONE_SHOT,
  serve: ONE_SHOT,
  untieApron: { ANIM_END: 'idle', RUN: 'run' },
  playPiano: { STOP: 'idle', WAKE: 'idle', WALK: 'walk', RUN: 'run', REACT: react },
  hairSwipe: ONE_SHOT,
  sip: ONE_SHOT,
  think: ONE_SHOT,
  flustered: ONE_SHOT,
};

export function transition(state: VState, event: VEvent): VState | null {
  const target = TRANSITIONS[state][event.type];
  if (!target) return null;
  return typeof target === 'function' ? target(event) : target;
}
