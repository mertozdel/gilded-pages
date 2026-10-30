import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { inApp, pickCharacter, watchErrors } from './helpers';

const PDF = fileURLToPath(new URL('../fixtures/sample.pdf', import.meta.url));

/**
 * Regression: Roxy's whole flow is unchanged by the crew — her HUD, a PDF on the shelf, the
 * reading break, reading and a bookmark, back to the café, the wardrobe, the map and a museum.
 */
test("Roxy's flow is unchanged", async ({ page }) => {
  const errors = watchErrors(page);
  await pickCharacter(page, 'roxy');

  // Her HUD: Gilt, the green-light lamp and all five places; no crew currency or action.
  await expect(page.getByLabel('0 Gilt')).toBeVisible();
  await expect(page.locator('.hud-lamp')).toBeVisible();
  for (const label of ['Café', 'Map', 'Wardrobe', 'Ledger', 'Settings']) await expect(page.locator(`.hud-nav button[title="${label}"]`)).toBeVisible();
  await expect(page.getByTestId('hud-currency')).toHaveCount(0);
  await expect(page.locator('.hud-action')).toHaveCount(0);
  // Every café hotspot is hers.
  for (const label of ['Coffee grinders', 'The regulars', 'The mural', 'Espresso bar', 'Reading bench', 'Glass door']) {
    await expect(page.locator(`.room-hotspot[aria-label^="${label}:"]`)).toHaveCount(1);
  }

  // A PDF goes on the shelf.
  await page.locator('input[type=file][accept*="pdf"]').setInputFiles(PDF);
  await expect(page.locator('.toast').filter({ hasText: 'is on the shelf' })).toBeVisible({ timeout: 30_000 });

  // The bookshelf, then the reading break into the Reading Room.
  await page.keyboard.press('b');
  const spine = page.locator('.spine').first();
  await expect(spine).toBeVisible({ timeout: 15_000 });
  await spine.click();
  await expect(page).toHaveURL(/#\/reader\//, { timeout: 20_000 });

  // Read: turn a page, plant a bookmark.
  const next = page.getByRole('button', { name: 'Next page' });
  await expect(next).toBeEnabled({ timeout: 20_000 });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.press('b');
  await expect(page.locator('.toast').filter({ hasText: 'Bookmark planted on page' })).toBeVisible();
  const marks = await inApp<number>(page, "const { db } = window.__app; return db.bookmarks.count();");
  expect(marks).toBe(1);

  // Close the book: back in her café.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/cafe\?c=roxy$/, { timeout: 20_000 });

  // The wardrobe.
  await page.locator('.hud-nav button[title="Wardrobe"]').click();
  await expect(page.getByRole('heading', { name: "Roxy's Apartment" })).toBeVisible();
  // Try on a top, then wear another (everything is open, so every top is hers).
  const card = (name: string) => page.locator('.blouse-card', { has: page.getByRole('heading', { name }) });
  await card('Dusty Rose Puff').getByRole('button', { name: 'Try on' }).click();
  await expect(card('Dusty Rose Puff').locator('.tag', { hasText: 'Trying on' })).toBeVisible();
  await card('Standard T-Shirt').getByRole('button', { name: 'Wear' }).click();
  await expect(card('Standard T-Shirt').locator('.tag', { hasText: 'Wearing' })).toBeVisible();

  // The map, and the Met (open from the start; fifty pages read for when the unlocks come back).
  await page.locator('.hud-nav button[title="Map"]').click();
  await expect(page.getByRole('heading', { name: 'The Map' })).toBeVisible();
  await inApp(
    page,
    `const { db } = window.__app;
     const pages = Array.from({ length: 50 }, (_, i) => i + 1);
     await db.progress.put({ bookId: 'seed', currentPage: 50, countedPages: pages, pagesCounted: 50, chaptersCelebrated: [], percent: 1, finishedAt: null, updatedAt: Date.now() });`,
  );
  await page.goto('/#/museum/the-met');
  await expect(page.getByRole('heading', { name: 'The Metropolitan Museum of Art' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Not open to you yet')).toHaveCount(0);

  // Her Gilt and profile link survived it all.
  const roxy = await inApp<{ linked: string }>(page, "const { db } = window.__app; return db.profiles.get('roxy');");
  expect(roxy.linked).toBe('player:me');
  expect(errors).toEqual([]);
});
