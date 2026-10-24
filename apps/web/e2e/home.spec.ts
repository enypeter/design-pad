import { expect, test } from '@playwright/test';
import { createDesign, trackErrors } from './helpers';

test('creates a design from a preset and lists it with a thumbnail', async ({ page }) => {
  const errors = trackErrors(page);
  await createDesign(page);
  await page.locator('.dp-template-card', { hasText: 'Summer sale' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__designPad.getChildren(window.__designPad.getCurrentPageId()).length,
      ),
    )
    .toBeGreaterThan(3);

  await page.getByRole('button', { name: 'Home' }).click();
  await page.waitForURL('/');
  const card = page.locator('.home-design').first();
  await expect(card).toContainText('Instagram Post (Square)');
  await expect(card.locator('img')).toBeVisible();
  expect(errors).toEqual([]);
});

test('creates a custom size design', async ({ page }) => {
  await page.goto('/');
  const custom = page.locator('.home-custom');
  await custom.getByLabel('Width').fill('1200');
  await custom.getByLabel('Height').fill('628');
  await custom.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/design\//);
  await page.waitForFunction(() => !!window.__designPad);
  const size = await page.evaluate(() => {
    const doc = window.__designPad.getDocument();
    return { width: doc.width, height: doc.height };
  });
  expect(size).toEqual({ width: 1200, height: 628 });
});

test('search narrows the size presets', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/Search sizes/).fill('A4');
  await expect(page.locator('.home-preset', { hasText: 'A4 Document' })).toBeVisible();
  await expect(page.locator('.home-preset', { hasText: 'Instagram Story' })).toHaveCount(0);
});
