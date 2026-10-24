import type { TextEffect, TextStyle } from '@design-pad/core';

export interface TextPreset {
  id: string;
  label: string;
  text: string;
  style: Partial<TextStyle>;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Canva's "Add a heading / subheading / body text", sized relative to the design. */
export function defaultTextPresets(doc: { width: number; height: number }): TextPreset[] {
  const base = Math.min(doc.width, doc.height);
  const size = (k: number) => Math.round(clamp(base * k, 10, 600));
  return [
    {
      id: 'textbox',
      label: 'Add a text box',
      text: 'Add a text box',
      style: { fontSize: size(0.03) },
    },
    {
      id: 'heading',
      label: 'Add a heading',
      text: 'Add a heading',
      style: { fontSize: size(0.067), fontWeight: 800 },
    },
    {
      id: 'subheading',
      label: 'Add a subheading',
      text: 'Add a subheading',
      style: { fontSize: size(0.042), fontWeight: 600 },
    },
    {
      id: 'body',
      label: 'Add a little bit of body text',
      text: 'Add a little bit of body text',
      style: { fontSize: size(0.025) },
    },
  ];
}

export interface ComboLine {
  text: string;
  style: Partial<TextStyle>;
  effect?: TextEffect;
  /** Size relative to the combo's base size. */
  scale: number;
  /** Gap above this line, relative to base size. */
  gap?: number;
}

export interface FontCombo {
  id: string;
  name: string;
  background?: string;
  lines: ComboLine[];
}

/** Ready-made font pairings (Canva's "Font combinations"). */
export const FONT_COMBOS: FontCombo[] = [
  {
    id: 'summer-sale',
    name: 'Summer sale',
    lines: [
      {
        text: 'SUMMER',
        style: { fontFamily: 'Anton', color: '#ff5757', letterSpacing: 40 },
        scale: 2.2,
      },
      {
        text: 'SALE',
        style: { fontFamily: 'Anton', color: '#1f1f1f', letterSpacing: 120 },
        scale: 1.4,
        gap: -0.2,
      },
      {
        text: 'up to 50% off',
        style: { fontFamily: 'Pacifico', color: '#ff5757' },
        scale: 0.8,
        gap: 0.1,
      },
    ],
  },
  {
    id: 'birthday',
    name: 'Happy birthday',
    lines: [
      { text: 'Happy', style: { fontFamily: 'Great Vibes', color: '#8c52ff' }, scale: 1.6 },
      {
        text: 'BIRTHDAY',
        style: { fontFamily: 'Montserrat', fontWeight: 800, color: '#1f1f1f', letterSpacing: 200 },
        scale: 0.9,
      },
    ],
  },
  {
    id: 'coffee',
    name: 'Coffee & co',
    lines: [
      {
        text: 'Coffee & Co.',
        style: { fontFamily: 'Playfair Display', fontWeight: 700, italic: true, color: '#5b3a29' },
        scale: 1.5,
      },
      {
        text: 'EST. 2026',
        style: {
          fontFamily: 'Josefin Sans',
          fontWeight: 600,
          color: '#5b3a29',
          letterSpacing: 400,
        },
        scale: 0.55,
        gap: 0.15,
      },
    ],
  },
  {
    id: 'weekend',
    name: 'The weekend',
    lines: [
      {
        text: 'THE',
        style: { fontFamily: 'Bebas Neue', color: '#004aad', letterSpacing: 300 },
        scale: 0.8,
      },
      {
        text: 'Weekend',
        style: { fontFamily: 'Pacifico', color: '#ff66c4' },
        scale: 1.6,
        gap: -0.2,
      },
      {
        text: 'WORKSHOP',
        style: { fontFamily: 'Bebas Neue', color: '#004aad', letterSpacing: 300 },
        scale: 0.8,
      },
    ],
  },
  {
    id: 'grand-opening',
    name: 'Grand opening',
    lines: [
      {
        text: 'GRAND',
        style: { fontFamily: 'Cinzel', fontWeight: 700, color: '#b8860b', letterSpacing: 150 },
        scale: 1.3,
      },
      {
        text: 'OPENING',
        style: { fontFamily: 'Cinzel', fontWeight: 700, color: '#1f1f1f', letterSpacing: 150 },
        scale: 1.3,
      },
      {
        text: 'Saturday · 10am',
        style: { fontFamily: 'Lato', color: '#545454' },
        scale: 0.55,
        gap: 0.2,
      },
    ],
  },
  {
    id: 'neon-night',
    name: 'Neon night',
    lines: [
      {
        text: 'Neon',
        style: { fontFamily: 'Monoton', color: '#ff3cac' },
        effect: { type: 'neon', intensity: 60 },
        scale: 1.6,
      },
      {
        text: 'NIGHTS',
        style: { fontFamily: 'Righteous', color: '#38b6ff' },
        effect: { type: 'neon', intensity: 50 },
        scale: 0.9,
      },
    ],
  },
  {
    id: 'thank-you',
    name: 'Thank you',
    lines: [
      { text: 'thank you', style: { fontFamily: 'Sacramento', color: '#1f1f1f' }, scale: 1.9 },
      {
        text: 'FOR YOUR ORDER',
        style: { fontFamily: 'Raleway', fontWeight: 600, color: '#737373', letterSpacing: 300 },
        scale: 0.45,
      },
    ],
  },
  {
    id: 'bold-statement',
    name: 'Bold statement',
    lines: [
      { text: 'MAKE IT', style: { fontFamily: 'Archivo Black', color: '#1f1f1f' }, scale: 1 },
      {
        text: 'HAPPEN',
        style: { fontFamily: 'Archivo Black', color: '#1f1f1f' },
        effect: { type: 'hollow', thickness: 40 },
        scale: 1,
        gap: -0.1,
      },
    ],
  },
  {
    id: 'wedding',
    name: 'Wedding',
    lines: [
      { text: 'Amara & David', style: { fontFamily: 'Alex Brush', color: '#3b3b3b' }, scale: 1.4 },
      {
        text: 'ARE GETTING MARRIED',
        style: {
          fontFamily: 'Cormorant Garamond',
          fontWeight: 600,
          color: '#3b3b3b',
          letterSpacing: 250,
        },
        scale: 0.45,
        gap: 0.1,
      },
    ],
  },
  {
    id: 'retro',
    name: 'Retro',
    lines: [
      {
        text: 'RETRO',
        style: { fontFamily: 'Bungee', color: '#ffde59' },
        effect: { type: 'echo', offset: 40, direction: -45, color: '#ff5757' },
        scale: 1.3,
      },
      { text: 'vibes only', style: { fontFamily: 'Pacifico', color: '#5e17eb' }, scale: 0.8 },
    ],
  },
];
