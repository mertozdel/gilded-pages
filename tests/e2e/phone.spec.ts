import { devices, expect, test, type Page } from '@playwright/test';
import { inApp, watchErrors } from './helpers';

/** Everyone plays on a phone: the coffee panel and the character switch, upright, small and large. */
for (const name of ['iPhone SE', 'iPhone 13'] as const) {
  test.describe(name, () => {
    const d = devices[name];
    test.use({ viewport: d.viewport, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true, userAgent: d.userAgent });

    const pick = async (page: Page, id: string) => {
      await expect(page.getByTestId(`pick-${id}`)).toBeVisible({ timeout: 30_000 });
      await page.getByTestId(`pick-${id}`).tap();
      await page.getByTestId(`start-${id}`).tap();
      await expect(page).toHaveURL(new RegExp(`#/cafe\\?c=${id}$`));
    };

    test("Joel's coffee: the Hold button never covers the gauge, and all of it is on screen", async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#/');
      await pick(page, 'joel');
      await page.locator('.room-hotspot[aria-label^="Espresso bar:"]').dispatchEvent('click');
      await page.getByTestId('make-coffee').tap();
      await expect(page.getByTestId('latte-panel')).toBeVisible();
      await page.keyboard.press('Escape'); // the art picker
      const vp = page.viewportSize()!;
      for (let stage = 1; stage <= 3; stage++) {
        await expect.poll(() => inApp<string>(page, 'return window.__latte?.state().phase'), { timeout: 15_000 }).toBe('stage');
        const hold = (await page.getByTestId('latte-hold').boundingBox())!;
        const gauge = (await page.locator('.latte-gauge-wrap').boundingBox())!;
        const cup = (await page.locator('.latte-cup-wrap').boundingBox())!;
        expect(gauge.y + gauge.height, `stage ${stage}: gauge above the button`).toBeLessThanOrEqual(hold.y + 1);
        expect(cup.y + cup.height).toBeLessThanOrEqual(gauge.y + 1);
        expect(hold.y + hold.height).toBeLessThanOrEqual(vp.height);
        // A short hold (a miss): on to the next stage.
        await page.mouse.move(hold.x + hold.width / 2, hold.y + hold.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(150);
        await page.mouse.up();
      }
      expect(errors).toEqual([]);
    });

    test('switching character keeps the café on screen', async ({ page }) => {
      await page.goto('/#/');
      for (const id of ['joel', 'jonas', 'roxy']) {
        await pick(page, id);
        await expect.poll(() => inApp<string | null>(page, "return window.__app.bus.last('room:layout')?.room ?? null")).toBe('cafe');
        await page.locator('.hud-switch').first().dispatchEvent('click');
        await expect(page).toHaveURL(/#\/$/);
        await expect.poll(() => inApp<string | null>(page, "return window.__app.bus.last('room:layout')?.room ?? null")).toBe('cafe-select');
      }
    });
  });
}
