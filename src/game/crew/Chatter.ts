import { bus } from '../../bus/events';
import type { CharacterId } from '../../content/characters';
import { EXCHANGES, lineMs, linesFor, type ExchangeLine, type Line, type Mood, type Situation } from '../../content/chatter';

/** Someone in the café who can say a line: a crew walker, or Roxy. */
export interface Voice {
  id: CharacterId;
  /** Not the player (the player only speaks up about their own cups and the rush). */
  npc: boolean;
  /** Free to talk now: not walking off, not mid-job, no bubble up already. */
  free(): boolean;
  say(text: string, ms: number, mood: Mood): void;
}

type Reaction = Exclude<Situation, 'idle' | 'welcomeBack'>;

/** How likely a colleague, and the player themself, speak up about each thing. */
const REACT: Record<Reaction, { npc: number; self: number }> = {
  perfect: { npc: 0.8, self: 0.4 },
  messy: { npc: 0.7, self: 0.4 },
  rushStart: { npc: 1, self: 0 },
  rushGood: { npc: 0.3, self: 0.15 },
  rushOops: { npc: 0.5, self: 0.3 },
  rushEnd: { npc: 0.9, self: 0.3 },
};
/** The first idle line after arriving, and the gap between later ones (ms, from when the last is read). */
const FIRST_IDLE = [5000, 10000] as const;
const IDLE_GAP = [8000, 16000] as const;
/** Nobody free to talk: look again in a moment. */
const RETRY = 2000;
/** How often idle chatter is a little back-and-forth instead of a single line. */
const EXCHANGE_CHANCE = 0.3;
/** After a reaction the next one waits this long, so a rush doesn't turn into a choir. */
const REACT_COOLDOWN = 2500;
/** Back from a gig: the welcome comes after the twin's hello and the player's answer. */
const WELCOME_AT = 7800;

interface Queued {
  at: number;
  id: CharacterId;
  line: Line;
}

/**
 * The café's chatter: now and then one of the baristas says something in a bubble (or two
 * of them have a little exchange), and they react to the cups and the Morning Rush. Speakers
 * come from `voices` each time, so walkers that spawn late join in. Idle chatter waits while
 * a rush or a latte shift is on; reactions don't.
 */
export class Chatter {
  private clock = 0;
  private idleIn: number;
  /** Until the lines already queued have been said and read. */
  private quietUntil = 0;
  private reactedAt = -Infinity;
  private rush = false;
  private latte = false;
  private queue: Queued[] = [];
  private welcomeFor: CharacterId | null;
  private lastIdle: CharacterId | null = null;
  /** Lines said lately, per character and situation, so they don't come round again too soon. */
  private readonly recent = new Map<string, string[]>();
  private readonly rand: () => number;
  private readonly unsubs: (() => void)[];

  constructor(
    private readonly voices: () => Voice[],
    opts: { returning?: CharacterId | null; rand?: () => number } = {},
  ) {
    this.rand = opts.rand ?? Math.random;
    this.welcomeFor = opts.returning ?? null;
    this.idleIn = (this.welcomeFor ? WELCOME_AT : 0) + this.between(...FIRST_IDLE);
    this.unsubs = [
      bus.on('latte:begin', () => (this.latte = true)),
      bus.on('latte:shiftEnd', () => (this.latte = false)),
      bus.on('latte:result', ({ grade }) => grade !== 'good' && this.react(grade)),
      bus.on('rush:start', () => {
        this.rush = true;
        this.react('rushStart');
      }),
      bus.on('rush:order', ({ correct }) => this.react(correct ? 'rushGood' : 'rushOops')),
      bus.on('rush:end', () => {
        // The rush screen also says so when it unmounts.
        if (!this.rush) return;
        this.rush = false;
        this.react('rushEnd');
      }),
    ];
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.welcomeFor && this.clock >= WELCOME_AT) this.welcome(this.welcomeFor);
    if (!this.rush && !this.latte && this.clock >= this.quietUntil) {
      this.idleIn -= dt;
      if (this.idleIn <= 0) this.idleIn = this.chat() ? this.between(...IDLE_GAP) : RETRY;
    }
    if (!this.queue.some((q) => q.at <= this.clock)) return;
    const due = this.queue.filter((q) => q.at <= this.clock);
    this.queue = this.queue.filter((q) => q.at > this.clock);
    const voices = this.voices();
    for (const q of due) voices.find((v) => v.id === q.id)?.say(q.line.text, lineMs(q.line.text), q.line.mood);
  }

  destroy(): void {
    this.unsubs.forEach((u) => u());
    this.queue = [];
  }

  // ---------- idle chatter ----------

  /** One of the NPCs says something, or two of them have a little exchange. */
  private chat(): boolean {
    const free = this.voices().filter((v) => v.npc && v.free());
    if (!free.length) return false;
    if (this.rand() < EXCHANGE_CHANCE) {
      const here = new Set(free.map((v) => v.id));
      const fits = EXCHANGES.filter((x) => x.every((l) => here.has(l.who)));
      const fresh = fits.filter((x) => !this.wasSaid('exchanges', x[0].text));
      if (fits.length) return this.converse(this.pickFrom(fresh.length ? fresh : fits), fits.length);
    }
    const others = free.filter((v) => v.id !== this.lastIdle);
    const v = this.pickFrom(others.length ? others : free);
    const line = this.pick(v.id, 'idle', false);
    if (!line) return false;
    this.lastIdle = v.id;
    this.schedule(v.id, line, this.clock);
    return true;
  }

  /** The lines of an exchange one after the other, each as the last one fades. */
  private converse(x: ExchangeLine[], of: number): boolean {
    this.remember('exchanges', x[0].text, Math.floor(of / 2));
    let at = this.clock;
    for (const l of x) at = this.schedule(l.who, l, at) - 300;
    return true;
  }

  // ---------- reactions ----------

  /** Someone speaks up about what just happened: the player now and then, a colleague more often. */
  private react(s: Reaction): void {
    if (this.clock < this.reactedAt + REACT_COOLDOWN) return;
    const odds = REACT[s];
    const free = this.voices().filter((v) => v.free());
    let at = this.clock + 250;
    let spoke = false;
    const self = free.find((v) => !v.npc);
    const mine = self && this.rand() < odds.self ? this.pick(self.id, s, true) : null;
    if (self && mine) {
      this.schedule(self.id, mine, at);
      at += 900;
      spoke = true;
    }
    const npcs = free.filter((v) => v.npc && linesFor(v.id, s).length);
    if (npcs.length && this.rand() < odds.npc) {
      const v = this.pickFrom(npcs);
      const line = this.pick(v.id, s, false);
      if (line) {
        this.schedule(v.id, line, at);
        spoke = true;
      }
    }
    if (spoke) this.reactedAt = this.clock;
  }

  /** Back from a gig: someone who isn't the twin says welcome back (the twin has their own hello). */
  private welcome(returning: CharacterId): void {
    this.welcomeFor = null;
    const by = this.voices().filter((v) => v.npc && v.id !== returning && v.free() && linesFor(v.id, 'welcomeBack').length);
    if (!by.length) return;
    const v = this.pickFrom(by);
    const line = this.pick(v.id, 'welcomeBack', false);
    if (line) this.schedule(v.id, line, this.clock);
  }

  // ---------- lines ----------

  /** Queues a line; returns when it has been read. */
  private schedule(id: CharacterId, line: Line, at: number): number {
    this.queue.push({ at, id, line });
    const end = at + lineMs(line.text);
    this.quietUntil = Math.max(this.quietUntil, end);
    return end;
  }

  /** A line for the situation that hasn't come up lately. About their own cup, nobody teases themself. */
  private pick(id: CharacterId, s: Situation, self: boolean): Line | null {
    const pool = linesFor(id, s).filter((l) => !self || l.mood !== 'cheeky');
    if (!pool.length) return null;
    const key = `${id}:${s}`;
    const fresh = pool.filter((l) => !this.wasSaid(key, l.text));
    const line = this.pickFrom(fresh.length ? fresh : pool);
    this.remember(key, line.text, Math.floor(pool.length / 2));
    return line;
  }

  private wasSaid(key: string, text: string): boolean {
    return this.recent.get(key)?.includes(text) ?? false;
  }

  private remember(key: string, text: string, keep: number): void {
    const said = [...(this.recent.get(key) ?? []), text];
    this.recent.set(key, keep > 0 ? said.slice(-keep) : []);
  }

  private pickFrom<T>(xs: readonly T[]): T {
    return xs[Math.min(xs.length - 1, Math.floor(this.rand() * xs.length))];
  }

  private between(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }
}
