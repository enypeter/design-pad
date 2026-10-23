export type FontCategory = 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';

export interface FontVariant {
  weight: number;
  italic: boolean;
}

export interface FontFile extends FontVariant {
  url: string;
  format?: string;
}

export interface FontFamilyDef {
  family: string;
  category: FontCategory;
  variants: FontVariant[];
  /** Stylesheet declaring @font-face rules for the family (e.g. Google Fonts css2). */
  css?: string;
  /** Explicit font files, used instead of `css` (self-hosted or uploaded fonts). */
  files?: FontFile[];
  /** Search tags. */
  tags?: string[];
}

type Row = [family: string, category: FontCategory, weights: number[], italics?: number[]];

const GOOGLE_FONTS: Row[] = [
  // Sans serif
  ['Inter', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Roboto', 'sans-serif', [300, 400, 500, 700, 900], [400, 700]],
  ['Open Sans', 'sans-serif', [300, 400, 500, 600, 700, 800], [400, 700]],
  ['Montserrat', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Poppins', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Lato', 'sans-serif', [300, 400, 700, 900], [400, 700]],
  ['Raleway', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Nunito', 'sans-serif', [300, 400, 600, 700, 800, 900], [400, 700]],
  ['Work Sans', 'sans-serif', [300, 400, 500, 600, 700, 800], [400, 700]],
  ['DM Sans', 'sans-serif', [300, 400, 500, 700, 900], [400, 700]],
  ['Manrope', 'sans-serif', [300, 400, 500, 600, 700, 800]],
  ['Outfit', 'sans-serif', [300, 400, 500, 600, 700, 800, 900]],
  ['Plus Jakarta Sans', 'sans-serif', [300, 400, 500, 600, 700, 800], [400, 700]],
  ['Figtree', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Sora', 'sans-serif', [300, 400, 600, 700, 800]],
  ['Urbanist', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Space Grotesk', 'sans-serif', [300, 400, 500, 600, 700]],
  ['League Spartan', 'sans-serif', [300, 400, 500, 600, 700, 800, 900]],
  ['Josefin Sans', 'sans-serif', [300, 400, 600, 700], [400, 700]],
  ['Quicksand', 'sans-serif', [300, 400, 500, 600, 700]],
  ['Rubik', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Archivo', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Barlow', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Barlow Condensed', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Mulish', 'sans-serif', [300, 400, 600, 700, 800, 900], [400, 700]],
  ['Lexend', 'sans-serif', [300, 400, 500, 600, 700, 800]],
  ['Kanit', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Exo 2', 'sans-serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Titillium Web', 'sans-serif', [300, 400, 600, 700], [400, 700]],
  ['Fredoka', 'sans-serif', [300, 400, 500, 600, 700]],
  ['Comfortaa', 'sans-serif', [300, 400, 500, 600, 700]],
  ['Syne', 'sans-serif', [400, 500, 600, 700, 800]],
  ['Bricolage Grotesque', 'sans-serif', [300, 400, 500, 600, 700, 800]],
  ['Oswald', 'sans-serif', [300, 400, 500, 600, 700]],
  ['Tenor Sans', 'sans-serif', [400]],
  ['Teko', 'sans-serif', [300, 400, 500, 600, 700]],
  // Serif
  ['Playfair Display', 'serif', [400, 500, 600, 700, 800, 900], [400, 700]],
  ['Merriweather', 'serif', [300, 400, 700, 900], [400, 700]],
  ['Lora', 'serif', [400, 500, 600, 700], [400, 700]],
  ['EB Garamond', 'serif', [400, 500, 600, 700, 800], [400, 700]],
  ['Cormorant Garamond', 'serif', [300, 400, 500, 600, 700], [400, 700]],
  ['Libre Baskerville', 'serif', [400, 700], [400]],
  ['DM Serif Display', 'serif', [400], [400]],
  ['Crimson Text', 'serif', [400, 600, 700], [400, 700]],
  ['Bodoni Moda', 'serif', [400, 500, 600, 700, 800, 900], [400, 700]],
  ['Fraunces', 'serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Cinzel', 'serif', [400, 500, 600, 700, 800, 900]],
  ['Prata', 'serif', [400]],
  ['Noto Serif', 'serif', [300, 400, 500, 600, 700, 800, 900], [400, 700]],
  ['Roboto Slab', 'serif', [300, 400, 500, 600, 700, 800, 900]],
  ['Zilla Slab', 'serif', [300, 400, 500, 600, 700], [400, 700]],
  ['Arvo', 'serif', [400, 700], [400, 700]],
  ['Italiana', 'serif', [400]],
  ['Yeseva One', 'serif', [400]],
  // Display
  ['Bebas Neue', 'display', [400]],
  ['Anton', 'display', [400]],
  ['Archivo Black', 'display', [400]],
  ['Abril Fatface', 'display', [400]],
  ['Alfa Slab One', 'display', [400]],
  ['Righteous', 'display', [400]],
  ['Bungee', 'display', [400]],
  ['Monoton', 'display', [400]],
  ['Black Ops One', 'display', [400]],
  ['Bangers', 'display', [400]],
  ['Luckiest Guy', 'display', [400]],
  ['Chewy', 'display', [400]],
  ['Fjalla One', 'display', [400]],
  ['Staatliches', 'display', [400]],
  ['Ultra', 'display', [400]],
  ['Rubik Mono One', 'display', [400]],
  ['Press Start 2P', 'display', [400]],
  ['Lobster', 'display', [400]],
  // Handwriting & script
  ['Pacifico', 'handwriting', [400]],
  ['Dancing Script', 'handwriting', [400, 500, 600, 700]],
  ['Great Vibes', 'handwriting', [400]],
  ['Caveat', 'handwriting', [400, 500, 600, 700]],
  ['Satisfy', 'handwriting', [400]],
  ['Sacramento', 'handwriting', [400]],
  ['Allura', 'handwriting', [400]],
  ['Parisienne', 'handwriting', [400]],
  ['Alex Brush', 'handwriting', [400]],
  ['Shadows Into Light', 'handwriting', [400]],
  ['Permanent Marker', 'handwriting', [400]],
  ['Amatic SC', 'handwriting', [400, 700]],
  ['Kalam', 'handwriting', [300, 400, 700]],
  ['Indie Flower', 'handwriting', [400]],
  ['Homemade Apple', 'handwriting', [400]],
  ['Gloria Hallelujah', 'handwriting', [400]],
  // Monospace
  ['Space Mono', 'monospace', [400, 700], [400, 700]],
  ['JetBrains Mono', 'monospace', [300, 400, 500, 600, 700, 800], [400, 700]],
  ['Roboto Mono', 'monospace', [300, 400, 500, 600, 700], [400, 700]],
  ['Courier Prime', 'monospace', [400, 700], [400, 700]],
];

/** Google Fonts css2 URL requesting exactly the listed faces. */
export function googleFontsCssUrl(family: string, variants: FontVariant[]): string {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const hasItalic = variants.some((v) => v.italic);
  const isDefaultOnly =
    variants.length === 1 && variants[0]!.weight === 400 && !variants[0]!.italic;
  if (isDefaultOnly) return `https://fonts.googleapis.com/css2?family=${name}&display=swap`;
  if (!hasItalic) {
    const weights = [...new Set(variants.map((v) => v.weight))].sort((a, b) => a - b);
    return `https://fonts.googleapis.com/css2?family=${name}:wght@${weights.join(';')}&display=swap`;
  }
  const tuples = variants
    .map((v) => [v.italic ? 1 : 0, v.weight] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([i, w]) => `${i},${w}`);
  return `https://fonts.googleapis.com/css2?family=${name}:ital,wght@${tuples.join(';')}&display=swap`;
}

function fromRow([family, category, weights, italics = []]: Row): FontFamilyDef {
  const variants: FontVariant[] = [
    ...weights.map((weight) => ({ weight, italic: false })),
    ...italics.map((weight) => ({ weight, italic: true })),
  ];
  return { family, category, variants, css: googleFontsCssUrl(family, variants) };
}

/** Default font library, served by Google Fonts. Hosts can replace it with self-hosted fonts. */
export const DEFAULT_FONT_CATALOG: FontFamilyDef[] = GOOGLE_FONTS.map(fromRow);
