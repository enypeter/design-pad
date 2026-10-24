import type { DesignFile, Editor } from '@design-pad/core';
import type { DesignPadEmbed } from '@design-pad/embed';
import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Set by the app in dev and e2e builds. */
    __designPad: Editor;
    /** Set by examples/mount.html. */
    __pad: { editor: Editor };
    /** Set by examples/embed-host.html. */
    pad: DesignPadEmbed;
  }
}

/** Element types in a design file, sorted. */
export function elementTypes(design: unknown): string[] {
  return (design as DesignFile).elements.map((e) => e.type).sort();
}

/** Start a design from a home page preset and wait for the editor. */
export async function createDesign(page: Page, preset = 'Instagram Post (Square)'): Promise<void> {
  await page.goto('/');
  await page.locator('.home-preset', { hasText: preset }).first().click();
  await page.waitForURL(/\/design\//);
  await expect(page.locator('.dp-viewport')).toBeVisible();
  await page.waitForFunction(() => !!window.__designPad);
}

/** Screen position of a point given in design units on page `pageNumber` (1-based). */
export async function pagePoint(
  page: Page,
  x: number,
  y: number,
  pageNumber = 1,
): Promise<{ x: number; y: number }> {
  // Each page's header sits directly on top of the page and spans its width.
  const header = await page
    .locator('.dp-page-header')
    .filter({ has: page.getByRole('textbox', { name: `Page ${pageNumber} title` }) })
    .boundingBox();
  if (!header) throw new Error(`Page ${pageNumber} is not on screen`);
  const width = await page.evaluate(() => window.__designPad.getDocument().width);
  const k = header.width / width;
  return { x: header.x + x * k, y: header.y + header.height + y * k };
}

/** Screen position of an element's centre (unrotated elements on the current page). */
export async function elementCenter(
  page: Page,
  id: string,
  pageNumber = 1,
): Promise<{ x: number; y: number }> {
  const box = await page.evaluate((elementId) => {
    const el = window.__designPad.getElement(elementId);
    if (!el) throw new Error(`No element ${elementId}`);
    return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
  }, id);
  return pagePoint(page, box.x, box.y, pageNumber);
}

/** Elements on the current page as plain data. */
export function currentElements(page: Page) {
  return page.evaluate(() => {
    const editor = window.__designPad;
    return editor.getChildren(editor.getCurrentPageId()).map((el) => ({
      id: el.id,
      type: el.type,
      text: el.type === 'text' ? el.spans.map((s) => s.text).join('') : undefined,
    }));
  });
}

/** Collect console errors and uncaught exceptions; assert none at the end of a test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    // Software GL in CI warns about readPixels stalls; that is not an app error.
    if (m.type() === 'error' && !m.text().includes('GPU stall')) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
