import type { FontFamilyDef, FontManager } from '@design-pad/core';
import { useEffect, useState } from 'react';

const previewFamilies = new Map<string, Promise<string>>();

function previewName(family: string): string {
  return `__dp_preview_${family.replace(/[^a-z0-9]/gi, '_')}`;
}

/**
 * Load just enough of a font to render its name (Google Fonts `text=`
 * subsets are a few KB), registered under a private family name so it never
 * shadows the full font used on the canvas.
 */
export function loadFontPreview(def: FontFamilyDef, fonts: FontManager): Promise<string> {
  let p = previewFamilies.get(def.family);
  if (p) return p;
  p = (async () => {
    if (typeof document === 'undefined') return def.family;
    if (def.css?.includes('fonts.googleapis.com')) {
      const v = def.variants.find((x) => !x.italic && x.weight === 400) ?? def.variants[0];
      const name = encodeURIComponent(def.family).replace(/%20/g, '+');
      const axis =
        v && (v.weight !== 400 || v.italic)
          ? `:${v.italic ? 'ital,' : ''}wght@${v.italic ? '1,' : ''}${v.weight}`
          : '';
      const url = `https://fonts.googleapis.com/css2?family=${name}${axis}&text=${encodeURIComponent(def.family)}&display=block`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('preview css');
      const css = (await res.text()).replace(
        /font-family:\s*'[^']+'/g,
        `font-family: '${previewName(def.family)}'`,
      );
      const style = document.createElement('style');
      style.dataset.designPadPreview = def.family;
      style.textContent = css;
      document.head.appendChild(style);
      await document.fonts.load(`16px "${previewName(def.family)}"`, def.family);
      return previewName(def.family);
    }
    await fonts.load({ family: def.family, weight: 400, italic: false });
    return def.family;
  })().catch(() => def.family);
  previewFamilies.set(def.family, p);
  return p;
}

/** CSS font-family to render a font's own name in its typeface. */
export function useFontPreview(
  def: FontFamilyDef | undefined,
  fonts: FontManager,
  enabled = true,
): string | undefined {
  const [family, setFamily] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!def || !enabled) return;
    let alive = true;
    void loadFontPreview(def, fonts).then((f) => {
      if (alive) setFamily(f);
    });
    return () => {
      alive = false;
    };
  }, [def, fonts, enabled]);
  return family;
}

/** Ensure a family is loaded for DOM previews (font combinations etc.). */
export function useFontsLoaded(
  fonts: FontManager,
  families: { family: string; weight?: number; italic?: boolean }[],
): boolean {
  const key = families.map((f) => `${f.family}|${f.weight ?? 400}|${f.italic ? 1 : 0}`).join(',');
  const [ready, setReady] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the joined list
  useEffect(() => {
    let alive = true;
    void fonts
      .loadAll(
        families.map((f) => ({ family: f.family, weight: f.weight ?? 400, italic: !!f.italic })),
      )
      .then(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [fonts, key]);
  return ready;
}
