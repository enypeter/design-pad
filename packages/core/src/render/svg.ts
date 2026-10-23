const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  navy: '#000080',
  teal: '#008080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  fuchsia: '#ff00ff',
  magenta: '#ff00ff',
  gold: '#ffd700',
  brown: '#a52a2a',
};

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/** Normalize a CSS colour to lowercase #rrggbb, or null if it is not a plain colour. */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent' || v === 'currentcolor' || v.startsWith('url(')) {
    return null;
  }
  if (NAMED_COLORS[v]) return NAMED_COLORS[v]!;
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) {
    const [r, g, b] = m[1]!.split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(v);
  if (m) return `#${m[1]}`;
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (m) return `#${hex2(+m[1]!)}${hex2(+m[2]!)}${hex2(+m[3]!)}`;
  return null;
}

const COLOR_ATTR = /\b(fill|stroke|stop-color|flood-color|color)(\s*=\s*)(["'])([^"']*)\3/gi;
const COLOR_DECL = /\b(fill|stroke|stop-color|flood-color|color)(\s*:\s*)([^;"'}]+)/gi;

/** Rewrite every plain colour in the markup through `map` (input is normalized #rrggbb). */
export function mapSvgColors(markup: string, map: (hex: string) => string): string {
  return markup
    .replace(COLOR_ATTR, (all, prop: string, eq: string, q: string, value: string) => {
      const hex = normalizeColor(value);
      return hex ? `${prop}${eq}${q}${map(hex)}${q}` : all;
    })
    .replace(COLOR_DECL, (all, prop: string, colon: string, value: string) => {
      const hex = normalizeColor(value);
      return hex ? `${prop}${colon}${map(hex)}` : all;
    });
}

/** Distinct plain colours used in an SVG, in order of first appearance. */
export function extractSvgColors(markup: string): string[] {
  const seen = new Set<string>();
  mapSvgColors(markup, (hex) => {
    seen.add(hex);
    return hex;
  });
  // Elements without any fill paint black by default.
  if (seen.size === 0 && /<(path|rect|circle|ellipse|polygon|polyline|text)\b/i.test(markup)) {
    seen.add('#000000');
  }
  return [...seen];
}

export function recolorSvg(markup: string, colors: Record<string, string>): string {
  const keys = Object.keys(colors);
  if (!keys.length) return markup;
  let out = mapSvgColors(markup, (hex) => colors[hex] ?? hex);
  // Unpainted shapes default to black: give the root a fill so recolouring black works.
  if (colors['#000000'] && !/<svg[^>]*\sfill=/i.test(out)) {
    out = out.replace(/<svg\b/i, `<svg fill="${colors['#000000']}"`);
  }
  return out;
}

/** Remove scripts, event handlers and external references from untrusted SVG. */
export function sanitizeSvg(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '');
}

/** Ensure the root <svg> has explicit width/height (needed to rasterize via <img>). */
export function ensureSvgSize(markup: string): { markup: string; width: number; height: number } {
  const open = /<svg\b[^>]*>/i.exec(markup);
  if (!open) return { markup, width: 100, height: 100 };
  const tag = open[0];
  const num = (name: string) => {
    const m = new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(tag);
    return m ? Number.parseFloat(m[1]!) : null;
  };
  const vb =
    /viewBox\s*=\s*["']\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i.exec(tag);
  let width = num('width');
  let height = num('height');
  const vbw = vb ? Number.parseFloat(vb[3]!) : null;
  const vbh = vb ? Number.parseFloat(vb[4]!) : null;
  if (width == null && height == null) {
    width = vbw ?? 100;
    height = vbh ?? 100;
  } else if (width == null) {
    width = vbw && vbh ? (height! * vbw) / vbh : height!;
  } else if (height == null) {
    height = vbw && vbh ? (width * vbh) / vbw : width;
  }
  let newTag = tag.replace(/\s(width|height)\s*=\s*["'][^"']*["']/gi, '');
  newTag = newTag.replace(/<svg\b/i, `<svg width="${width}" height="${height}"`);
  if (!vb) newTag = newTag.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}"`);
  if (!/xmlns\s*=/.test(newTag))
    newTag = newTag.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return { markup: markup.replace(tag, newTag), width: width!, height: height! };
}

export function svgToDataUrl(markup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
}
