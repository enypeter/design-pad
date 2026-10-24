import { expect, test } from '@playwright/test';
import { trackErrors } from './helpers';

test('mountDesignPad works without React inside a Shadow DOM', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/examples/mount.html');
  await expect(page.locator('.dp-header')).toBeVisible();
  expect(await page.evaluate(() => !!document.getElementById('editor')?.shadowRoot)).toBe(true);

  // The host page uppercases and red-borders every button; none of that reaches the editor.
  const editorButton = page.locator('.dp-header button').first();
  await expect(editorButton).toHaveCSS('text-transform', 'none');
  await expect(editorButton).not.toHaveCSS('border-top-color', 'rgb(255, 0, 0)');

  // Edit the text in place; Space must type a space, not pan the canvas.
  const box = await page.evaluate(() => {
    const editor = window.__pad.editor;
    const [el] = editor.getChildren(editor.getCurrentPageId());
    return {
      x: el!.x + el!.width / 2,
      y: el!.y + el!.height / 2,
      width: editor.getDocument().width,
    };
  });
  const header = await page.locator('.dp-page-header').first().boundingBox();
  const k = header!.width / box.width;
  const x = header!.x + box.x * k;
  const y = header!.y + header!.height + box.y * k;
  await page.mouse.click(x, y);
  await page.mouse.dblclick(x, y);
  await expect(page.getByRole('textbox', { name: 'Edit text' })).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.type(' and spaces work');
  await page.keyboard.press('Escape');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const editor = window.__pad.editor;
        const [el] = editor.getChildren(editor.getCurrentPageId());
        return el?.type === 'text' ? el.spans.map((s) => s.text).join('') : null;
      }),
    )
    .toBe('Mounted without React and spaces work');
  expect(errors).toEqual([]);
});
