import { expect, type Page } from '@playwright/test';
import type { CharacterId } from '../../src/content/characters';

/** Collects uncaught page errors (and console errors) so a test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|music\/.*\.(mp3|ogg|m4a)|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** From the character select screen (#/), picks a character and waits for their café. */
export async function pickCharacter(page: Page, id: CharacterId): Promise<void> {
  await page.goto('/#/');
  const pick = page.getByTestId(`pick-${id}`);
  await expect(pick).toBeVisible({ timeout: 30_000 });
  await pick.hover();
  await expect(page.getByTestId(`card-${id}`)).toBeVisible();
  await page.getByTestId(`start-${id}`).click();
  await expect(page).toHaveURL(new RegExp(`#/cafe\\?c=${id}$`));
}

/** Runs code inside the app. Use `window.__app` (dev builds) for the app's own store, bus and db. */
export async function inApp<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate(`(async () => { ${fn} })()`) as Promise<T>;
}
