import { expect, test, type Page } from '@playwright/test';
import { inApp, pickCharacter, watchErrors } from './helpers';

test.describe('character select', () => {
  for (const id of ['roxy', 'jason', 'joel', 'jonas'] as const) {
    test(`${id} reaches the café`, async ({ page }) => {
      const errors = watchErrors(page);
      await pickCharacter(page, id);
      await expect(page.locator('.hud')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('arrow keys move the focus, the last pick is preselected', async ({ page }) => {
    await page.goto('/#/');
    await expect(page.getByTestId('pick-roxy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('card-roxy')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('card-joel')).toContainText('Twin of Jonas');
    await expect(page.getByTestId('card-joel')).toContainText('DJ in China');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/cafe\?c=joel$/);
    // Switch character: back on the select screen with Joel preselected.
    await page.locator('.hud-switch').click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByTestId('card-joel')).toBeVisible({ timeout: 15_000 });
  });

  test("the crew's café hides Roxy's reading, wardrobe, museums, map and Gilt", async ({ page }) => {
    await pickCharacter(page, 'joel');
    await expect(page.getByTestId('hud-currency')).toBeVisible();
    await expect(page.locator('.hud-gilt').filter({ has: page.locator('[aria-label$=" Gilt"]') })).toHaveCount(0);
    for (const label of ['Map', 'Wardrobe', 'Ledger']) await expect(page.locator(`.hud-nav button[title="${label}"]`)).toHaveCount(0);
    await expect(page.locator('.hud-action')).toHaveText(/Break: fly to China/);
    await expect(page.locator('.room-hotspot[aria-label^="Reading bench:"]')).toHaveCount(0);
    await expect(page.locator('.room-hotspot[aria-label^="The mural:"]')).toHaveCount(0);
    await expect(page.locator('.anchor-continue .cafe-card')).toHaveCount(0);
  });

  test('Jason never takes a break', async ({ page }) => {
    await pickCharacter(page, 'jason');
    await expect(page.locator('.room-hotspot[aria-label^="Glass door:"]')).toHaveCount(1);
    await page.locator('.room-hotspot[aria-label^="Glass door:"]').click({ force: true });
    await page.waitForTimeout(6000);
    await expect(page).toHaveURL(/#\/cafe\?c=jason$/);
  });
});

interface LatteState {
  phase: string;
  stage: number;
  step: number;
}

/**
 * Plays one stage as planned: a hold of Space, or every move of a real pour — holds for the
 * pushes and pulls, a tap on each beat of a wiggle.
 */
async function playStage(page: Page, kind: 'perfect' | 'early'): Promise<void> {
  const now = () => inApp<LatteState>(page, 'return window.__latte.state()');
  await expect.poll(() => inApp<string>(page, 'return window.__latte?.state().phase'), { timeout: 30_000 }).toBe('stage');
  const { stage } = await now();
  for (;;) {
    const s = await now();
    if (s.phase !== 'stage' || s.stage !== stage) return;
    const plan = await inApp<{ kind: 'hold' | 'tap'; perfect: number; early: number }>(page, 'return window.__latte.plan()');
    const wait = kind === 'perfect' ? plan.perfect : plan.early;
    if (plan.kind === 'tap') {
      await page.waitForTimeout(Math.max(0, wait - 15));
      await page.keyboard.press('Space');
    } else {
      await page.keyboard.down('Space');
      await page.waitForTimeout(Math.max(50, wait - 12));
      await page.keyboard.up('Space');
    }
    await expect
      .poll(async () => {
        const n = await now();
        return n.phase !== 'stage' || n.stage !== stage || n.step !== s.step;
      })
      .toBe(true);
  }
}

test('Jason serves three orders with scripted holds', async ({ page }) => {
  const errors = watchErrors(page);
  await pickCharacter(page, 'jason');
  await expect(page.locator('.hud-action')).toHaveText(/Latte art/);
  await page.locator('.hud-action').click();
  const panel = page.getByTestId('latte-panel');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  // The art picker opens with the shift: the Heart for every cup (tips ×1, whatever the customers ask).
  await expect(page.getByTestId('art-picker')).toBeVisible();
  await page.getByTestId('art-heart').click();
  await expect(page.getByTestId('art-picker')).toHaveCount(0);

  const plans: ('perfect' | 'early')[] = ['perfect', 'early', 'perfect'];
  for (const [i, kind] of plans.entries()) {
    for (let s = 0; s < 3; s++) await playStage(page, kind);
    const result = panel.locator('.latte-result');
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(result).toContainText(kind === 'perfect' ? 'Perfect cup!' : 'Messy');
    if (i < plans.length - 1) await page.keyboard.press('Enter');
  }

  // Tips: 10 + 1 + 10 (the messy cup broke the streak).
  await expect(page.getByTestId('hud-currency')).toContainText('21');
  const jason = await inApp<{ currency: number; bests: Record<string, number>; stats: Record<string, number> }>(page, "const { db } = window.__app; return db.profiles.get('jason');");
  expect(jason.currency).toBe(21);
  expect(jason.stats.cups).toBe(3);
  expect(jason.bests.cup).toBeGreaterThanOrEqual(90);
  const roxyGilt = await inApp<number>(page, "const { db } = window.__app; return (await db.player.get('me'))?.gilt ?? 0;");
  expect(roxyGilt).toBe(0);
  expect(errors).toEqual([]);
});

test('a rosetta is poured with the wiggle: a tap on every beat', async ({ page }) => {
  const errors = watchErrors(page);
  await pickCharacter(page, 'jason');
  await page.locator('.hud-action').click();
  await expect(page.getByTestId('art-picker')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('art-rosetta').click();
  for (let s = 0; s < 2; s++) await playStage(page, 'perfect');
  // The pour: the wiggle (eight leaves on the beat), the little heart, the pull-through.
  await expect.poll(() => inApp<string>(page, 'return window.__latte.state().stage')).toBe(3);
  await expect(page.getByTestId('latte-moves')).toContainText('Wiggle ×8');
  expect(await inApp<string[]>(page, 'return window.__latte.state().moves')).toEqual(['tap', 'push', 'pull']);
  await playStage(page, 'perfect');
  const result = page.getByTestId('latte-panel').locator('.latte-result');
  await expect(result).toBeVisible({ timeout: 10_000 });
  await expect(result).not.toContainText('Messy');
  expect(errors).toEqual([]);
});
