import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { elementTypes, trackErrors } from './helpers';

const photo = fileURLToPath(new URL('./fixtures/portrait.jpg', import.meta.url));

test('a host page drives the embedded editor over the SDK', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/examples/embed-host.html');
  const log = page.locator('#log');
  await expect(log).toContainText('ready (');

  // Host to editor calls.
  await page.locator('#gallery img').first().click();
  await expect(log).toContainText('added image');
  await page.locator('#text').click();
  await expect
    .poll(async () => elementTypes(await page.evaluate(() => window.pad.getDesign())))
    .toEqual(['image', 'text']);

  await page.locator('#export').click();
  await expect(log).toContainText('exported Client promo.png');
  await expect(page.locator('#preview')).toBeVisible();

  // Editor to host: header actions and uploads stored by the host.
  const editor = page.frameLocator('iframe');
  await editor.getByRole('button', { name: 'Save & close' }).click();
  await expect(log).toContainText('action "done" with 2 element(s)');
  await editor.getByRole('button', { name: 'Uploads', exact: true }).click();
  await editor.locator('.dp-side-panel input[type=file]').setInputFiles(photo);
  await expect(log).toContainText('host stored upload portrait.jpg');
  await expect(editor.locator('.dp-upload-thumb')).toHaveCount(1);

  // ready fires once per editor load.
  expect((await log.textContent())?.match(/ready \(/g)).toHaveLength(1);
  expect(errors).toEqual([]);
});
