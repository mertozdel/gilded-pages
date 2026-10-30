import { expect, test, type Page } from '@playwright/test';
import { inApp, watchErrors } from './helpers';

interface Row {
  id: string;
  character: string;
  difficulty: string;
  perfect: boolean;
  accuracy: number;
}
interface Result {
  accuracy: number;
  counts: { perfect: number; great: number; good: number; miss: number };
}

/**
 * The sync check: the Autoplay bot plays every chart. Virtual (through the Judge, no clock) and
 * in real time (through the AudioClock, the Synth and the Judge, frame by frame): both must be
 * 100% Perfect, so the charts and the audio agree.
 */
test('Autoplay reaches 100% Perfect on every chart', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto('/#/dev/rhythm-test');
  await expect.poll(() => inApp<boolean>(page, 'return !!window.__rhythmTest'), { timeout: 30_000 }).toBe(true);
  const rows = await inApp<Row[]>(page, 'return window.__rhythmTest.virtual()');
  expect(rows.length).toBeGreaterThan(0);
  for (const r of rows) expect(r.perfect, `${r.character} ${r.id} ${r.difficulty} (virtual)`).toBe(true);

  for (const r of rows) {
    const res = await inApp<Result>(page, `return window.__rhythmTest.realtime(${JSON.stringify(r.id)}, ${JSON.stringify(r.character)}, ${JSON.stringify(r.difficulty)}, 6000)`);
    const { perfect, great, good, miss } = res.counts;
    expect({ great, good, miss }, `${r.character} ${r.id} ${r.difficulty} (real time)`).toEqual({ great: 0, good: 0, miss: 0 });
    expect(perfect).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

async function openNeon(page: Page, reduce: boolean): Promise<void> {
  await page.goto('/#/');
  await expect.poll(() => inApp<boolean>(page, "return !!document.querySelector('[data-testid=pick-joel]')"), { timeout: 30_000 }).toBe(true);
  await inApp(page, `const { useStore } = window.__app; useStore.getState().setSettings({ rhythmCalibrated: true, reduceFlashing: ${reduce} });`);
  await page.goto('/#/venue/neon-china');
  await expect.poll(() => inApp<string | null>(page, 'return window.__festival?.venue ?? null'), { timeout: 30_000 }).toBe('neon-china');
  await expect.poll(() => inApp<boolean | null>(page, 'return window.__festival.reduced()')).toBe(reduce);
}

/** The drop with a beat every 80 ms (750 bpm) for 2 s: the most screen flashes in any one second. */
async function flashesPerSecond(page: Page): Promise<number> {
  return inApp<number>(
    page,
    `const { bus } = window.__app;
     const f = window.__festival;
     const t0 = f.now();
     bus.emit('rhythm:starPower', { active: true });
     for (let b = 0; b < 25; b++) {
       bus.emit('rhythm:beat', { beat: b, bar: Math.floor(b / 4), downbeat: b % 4 === 0, bpm: 750, beatsPerBar: 4 });
       await new Promise((r) => setTimeout(r, 80));
     }
     const t1 = f.now();
     bus.emit('rhythm:starPower', { active: false });
     const ts = f.flashes().filter((t) => t >= t0 && t <= t1);
     return Math.max(0, ...ts.map((t) => ts.filter((u) => u >= t && u < t + 1000).length));`,
  );
}

test('Reduce flashing is honoured (at most 3 flashes a second)', async ({ page }) => {
  await openNeon(page, true);
  const reduced = await flashesPerSecond(page);
  expect(reduced).toBeLessThanOrEqual(3);
  await openNeon(page, false);
  const full = await flashesPerSecond(page);
  expect(full).toBeGreaterThan(3);
});

test('Reduce flashing is forced on by prefers-reduced-motion', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await openNeon(page, true);
  await inApp(page, "const { useStore } = window.__app; useStore.getState().setSettings({ reduceFlashing: false });");
  await expect.poll(() => inApp<boolean | null>(page, 'return window.__festival.reduced()')).toBe(true);
  expect(await flashesPerSecond(page)).toBeLessThanOrEqual(3);
  await ctx.close();
});

test('the neon festival runs near 60 fps with its reaction bubbles', async ({ page }) => {
  await openNeon(page, false);
  await expect.poll(() => inApp<number>(page, 'return window.__festival.bubbles()'), { timeout: 10_000 }).toBeGreaterThan(0);
  const fps = await inApp<number>(
    page,
    `let n = 0; const t0 = performance.now();
     await new Promise((done) => { const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
     return n / ((performance.now() - t0) / 1000);`,
  );
  expect(fps).toBeGreaterThan(50);
});
