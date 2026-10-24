import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { createDesign, currentElements, elementCenter, pagePoint, trackErrors } from './helpers';

const photo = fileURLToPath(new URL('./fixtures/portrait.jpg', import.meta.url));

const firstText = async (page: Page) =>
  (await currentElements(page)).find((e) => e.type === 'text')?.text;

async function download(
  page: Page,
  choose: (dialog: ReturnType<Page['locator']>) => Promise<void>,
) {
  await page.locator('.dp-header').getByRole('button', { name: 'Download' }).click();
  const dialog = page.locator('.dp-modal');
  await choose(dialog);
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Download' }).click(),
  ]);
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}

test('adds text, edits it in place, and undoes the edit as one step', async ({ page }) => {
  const errors = trackErrors(page);
  await createDesign(page);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add a heading' }).click();
  const [heading] = await currentElements(page);
  expect(heading).toMatchObject({ type: 'text', text: 'Add a heading' });

  const centre = await elementCenter(page, heading!.id);
  await page.mouse.dblclick(centre.x, centre.y);
  await expect(page.getByRole('textbox', { name: 'Edit text' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Hello Lagos');
  await page.keyboard.press('Escape');
  await expect.poll(() => firstText(page)).toBe('Hello Lagos');

  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => firstText(page)).toBe('Add a heading');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect.poll(() => firstText(page)).toBe('Hello Lagos');
  expect(errors).toEqual([]);
});

test('adds a page, draws on it, and exports PNG, ZIP and PDF', async ({ page }) => {
  const errors = trackErrors(page);
  await createDesign(page);
  await page.getByRole('button', { name: 'Elements', exact: true }).click();
  await page.getByRole('button', { name: 'Circle', exact: true }).first().click();
  await expect
    .poll(async () => (await currentElements(page)).map((e) => e.type))
    .toEqual(['shape']);

  await page.locator('.dp-add-page').click();
  await expect.poll(() => page.evaluate(() => window.__designPad.getPages().length)).toBe(2);

  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  const start = await pagePoint(page, 300, 500, 2);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++)
    await page.mouse.move(start.x + i * 15, start.y + Math.sin(i / 2) * 30);
  await page.mouse.up();
  await expect.poll(async () => (await currentElements(page)).map((e) => e.type)).toEqual(['path']);
  await page.keyboard.press('Escape');

  const zip = await download(page, async () => {});
  expect(zip.name).toMatch(/\.zip$/);
  expect(zip.bytes.subarray(0, 2).toString()).toBe('PK');

  const png = await download(page, async (dialog) => {
    await dialog.getByRole('radio', { name: 'Current page' }).click();
  });
  expect(png.name).toMatch(/\.png$/);
  expect(png.bytes.subarray(1, 4).toString()).toBe('PNG');

  const pdf = await download(page, async (dialog) => {
    await dialog.getByRole('radio', { name: /PDF Print/ }).click();
  });
  expect(pdf.name).toMatch(/\.pdf$/);
  expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.bytes.toString('latin1')).toContain('/Count 2');
  expect(errors).toEqual([]);
});

test('uploads a photo, places it, and applies a filter', async ({ page }) => {
  const errors = trackErrors(page);
  await createDesign(page);
  await page.getByRole('button', { name: 'Uploads', exact: true }).click();
  await page.locator('.dp-side-panel input[type=file]').setInputFiles(photo);
  // Uploads land in the grid; nothing is added to the page until the user picks one.
  await expect(page.locator('.dp-upload-thumb')).toHaveCount(1);
  expect(await currentElements(page)).toEqual([]);

  await page.locator('.dp-upload-thumb').first().click();
  await expect
    .poll(async () => (await currentElements(page)).map((e) => e.type))
    .toEqual(['image']);

  await page.getByRole('button', { name: 'Edit photo' }).click();
  await page.getByRole('tab', { name: 'Filters' }).click();
  await page.locator('.dp-filter-tile', { hasText: 'Mono' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const [el] = window.__designPad.getSelectedElements();
        return el?.type === 'image' ? el.image.filter?.name : null;
      }),
    )
    .toBe('mono');
  expect(errors).toEqual([]);
});

test('keeps the design after a reload', async ({ page }) => {
  await createDesign(page);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add a subheading' }).click();
  await expect(page.locator('.dp-header')).toContainText('All changes saved');
  await page.reload();
  await page.waitForFunction(() => !!window.__designPad);
  expect(await currentElements(page)).toEqual([
    expect.objectContaining({ type: 'text', text: 'Add a subheading' }),
  ]);
});
