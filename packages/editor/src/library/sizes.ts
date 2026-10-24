import type { Unit } from '@design-pad/core';

export interface SizePreset {
  id: string;
  name: string;
  category: 'Social media' | 'Presentation' | 'Print' | 'Video' | 'Other';
  /** In `unit`. */
  width: number;
  height: number;
  unit: Unit;
}

/** Common Canva design types. Print sizes are converted to px at 96 DPI. */
export const SIZE_PRESETS: SizePreset[] = [
  {
    id: 'ig-post',
    name: 'Instagram Post (Square)',
    category: 'Social media',
    width: 1080,
    height: 1080,
    unit: 'px',
  },
  {
    id: 'ig-portrait',
    name: 'Instagram Post (Portrait)',
    category: 'Social media',
    width: 1080,
    height: 1350,
    unit: 'px',
  },
  {
    id: 'ig-story',
    name: 'Instagram Story',
    category: 'Social media',
    width: 1080,
    height: 1920,
    unit: 'px',
  },
  {
    id: 'fb-post',
    name: 'Facebook Post',
    category: 'Social media',
    width: 940,
    height: 788,
    unit: 'px',
  },
  {
    id: 'fb-cover',
    name: 'Facebook Cover',
    category: 'Social media',
    width: 1640,
    height: 624,
    unit: 'px',
  },
  { id: 'x-post', name: 'X Post', category: 'Social media', width: 1600, height: 900, unit: 'px' },
  {
    id: 'linkedin-post',
    name: 'LinkedIn Post',
    category: 'Social media',
    width: 1200,
    height: 627,
    unit: 'px',
  },
  {
    id: 'pinterest',
    name: 'Pinterest Pin',
    category: 'Social media',
    width: 1000,
    height: 1500,
    unit: 'px',
  },
  {
    id: 'yt-thumb',
    name: 'YouTube Thumbnail',
    category: 'Video',
    width: 1280,
    height: 720,
    unit: 'px',
  },
  {
    id: 'presentation',
    name: 'Presentation (16:9)',
    category: 'Presentation',
    width: 1920,
    height: 1080,
    unit: 'px',
  },
  {
    id: 'presentation-43',
    name: 'Presentation (4:3)',
    category: 'Presentation',
    width: 1024,
    height: 768,
    unit: 'px',
  },
  { id: 'a4', name: 'A4 Document', category: 'Print', width: 210, height: 297, unit: 'mm' },
  { id: 'letter', name: 'US Letter', category: 'Print', width: 8.5, height: 11, unit: 'in' },
  { id: 'flyer', name: 'Flyer (A5)', category: 'Print', width: 148, height: 210, unit: 'mm' },
  {
    id: 'poster',
    name: 'Poster (18 × 24 in)',
    category: 'Print',
    width: 18,
    height: 24,
    unit: 'in',
  },
  {
    id: 'business-card',
    name: 'Business Card',
    category: 'Print',
    width: 3.5,
    height: 2,
    unit: 'in',
  },
  {
    id: 'invitation',
    name: 'Invitation (5 × 7 in)',
    category: 'Print',
    width: 5,
    height: 7,
    unit: 'in',
  },
  {
    id: 'postcard',
    name: 'Postcard (6 × 4 in)',
    category: 'Print',
    width: 6,
    height: 4,
    unit: 'in',
  },
  { id: 'logo', name: 'Logo', category: 'Other', width: 500, height: 500, unit: 'px' },
  {
    id: 'wallpaper',
    name: 'Desktop Wallpaper',
    category: 'Other',
    width: 1920,
    height: 1080,
    unit: 'px',
  },
  {
    id: 'email-header',
    name: 'Email Header',
    category: 'Other',
    width: 600,
    height: 200,
    unit: 'px',
  },
];

export const PX_PER_UNIT: Record<Unit, number> = { px: 1, in: 96, mm: 96 / 25.4, cm: 96 / 2.54 };

export function toPx(value: number, unit: Unit): number {
  return Math.round(value * PX_PER_UNIT[unit]);
}

export function fromPx(px: number, unit: Unit): number {
  const v = px / PX_PER_UNIT[unit];
  return unit === 'px' ? Math.round(v) : Math.round(v * 100) / 100;
}

export function formatSize(width: number, height: number, unit: Unit): string {
  const u = unit === 'px' ? 'px' : unit;
  return `${width} × ${height} ${u}`;
}
