/**
 * Built-in vector graphics (original artwork, free to use). Each is a
 * standalone SVG; colours are recolourable in the editor.
 */
export interface GraphicDef {
  id: string;
  name: string;
  tags: string[];
  svg: string;
}

const svg = (body: string, vb = '0 0 100 100') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;

export const GRAPHICS: GraphicDef[] = [
  {
    id: 'sparkle',
    name: 'Sparkle',
    tags: ['star', 'shine', 'twinkle'],
    svg: svg(
      '<path fill="#ffde59" d="M50 0C53 30 70 47 100 50C70 53 53 70 50 100C47 70 30 53 0 50C30 47 47 30 50 0Z"/>',
    ),
  },
  {
    id: 'sparkles',
    name: 'Sparkles',
    tags: ['star', 'shine', 'magic'],
    svg: svg(
      '<path fill="#8c52ff" d="M40 10C42 32 52 42 74 44C52 46 42 56 40 78C38 56 28 46 6 44C28 42 38 32 40 10Z"/><path fill="#ff66c4" d="M80 52C81 63 86 68 97 69C86 70 81 75 80 86C79 75 74 70 63 69C74 68 79 63 80 52Z"/><path fill="#ffde59" d="M76 4C77 12 80 15 88 16C80 17 77 20 76 28C75 20 72 17 64 16C72 15 75 12 76 4Z"/>',
    ),
  },
  {
    id: 'heart',
    name: 'Heart',
    tags: ['love', 'like', 'valentine'],
    svg: svg(
      '<path fill="#ff5757" d="M50 90C20 70 4 52 4 32C4 17 15 6 29 6C38 6 45 11 50 19C55 11 62 6 71 6C85 6 96 17 96 32C96 52 80 70 50 90Z"/>',
    ),
  },
  {
    id: 'star-filled',
    name: 'Star sticker',
    tags: ['rating', 'favourite'],
    svg: svg(
      '<path fill="#ffbd59" stroke="#1f1f1f" stroke-width="4" stroke-linejoin="round" d="M50 6L62 36L94 38L69 58L77 90L50 72L23 90L31 58L6 38L38 36Z"/>',
    ),
  },
  {
    id: 'sun',
    name: 'Sun',
    tags: ['summer', 'weather', 'bright'],
    svg: svg(
      '<g stroke="#ffbd59" stroke-width="7" stroke-linecap="round"><path d="M50 4v12M50 84v12M4 50h12M84 50h12M17 17l9 9M74 74l9 9M17 83l9-9M74 26l9-9"/></g><circle cx="50" cy="50" r="22" fill="#ffde59"/>',
    ),
  },
  {
    id: 'moon',
    name: 'Moon',
    tags: ['night', 'sleep'],
    svg: svg(
      '<path fill="#5e17eb" d="M62 6C40 10 26 28 26 50C26 72 42 90 64 94C38 100 8 80 8 50C8 22 34 0 62 6Z"/><circle cx="74" cy="30" r="5" fill="#ffde59"/><circle cx="86" cy="54" r="3" fill="#ffde59"/>',
    ),
  },
  {
    id: 'cloud',
    name: 'Cloud',
    tags: ['weather', 'sky'],
    svg: svg(
      '<path fill="#5ce1e6" d="M26 80C13 80 4 71 4 59C4 48 12 40 23 39C25 24 37 13 52 13C66 13 77 22 80 35C91 37 98 46 98 57C98 70 88 80 75 80Z"/>',
    ),
  },
  {
    id: 'bolt',
    name: 'Lightning',
    tags: ['energy', 'power', 'flash'],
    svg: svg(
      '<path fill="#ffde59" stroke="#1f1f1f" stroke-width="4" stroke-linejoin="round" d="M58 4L18 56H46L38 96L82 40H54Z"/>',
    ),
  },
  {
    id: 'flower',
    name: 'Flower',
    tags: ['nature', 'spring', 'bloom'],
    svg: svg(
      '<g fill="#ff66c4"><ellipse cx="50" cy="24" rx="16" ry="22"/><ellipse cx="50" cy="76" rx="16" ry="22"/><ellipse cx="24" cy="50" rx="22" ry="16"/><ellipse cx="76" cy="50" rx="22" ry="16"/></g><circle cx="50" cy="50" r="14" fill="#ffde59"/>',
    ),
  },
  {
    id: 'daisy',
    name: 'Daisy',
    tags: ['flower', 'nature'],
    svg: svg(
      `<g fill="#ffffff" stroke="#d9d9d9" stroke-width="1.5">${Array.from({ length: 10 }, (_, i) => `<ellipse cx="50" cy="22" rx="9" ry="20" transform="rotate(${i * 36} 50 50)"/>`).join('')}</g><circle cx="50" cy="50" r="13" fill="#ffbd59"/>`,
    ),
  },
  {
    id: 'leaf',
    name: 'Leaf',
    tags: ['nature', 'plant', 'eco'],
    svg: svg(
      '<path fill="#00bf63" d="M12 88C8 46 34 12 92 8C94 60 62 92 12 88Z"/><path fill="none" stroke="#c1ff72" stroke-width="3" stroke-linecap="round" d="M14 86C40 60 60 38 84 16"/>',
    ),
  },
  {
    id: 'monstera',
    name: 'Palm leaf',
    tags: ['nature', 'tropical', 'plant'],
    svg: svg(
      '<path fill="#00bf63" d="M50 96C48 70 44 52 30 40C18 30 6 30 4 22C14 12 30 10 42 20C40 8 48 2 56 4C62 14 58 24 54 32C64 22 80 20 94 28C90 38 76 40 62 44C76 48 88 58 92 72C80 76 66 66 58 56C60 72 58 86 54 96Z"/>',
    ),
  },
  {
    id: 'wave',
    name: 'Waves',
    tags: ['sea', 'water', 'lines'],
    svg: svg(
      '<g fill="none" stroke="#38b6ff" stroke-width="6" stroke-linecap="round"><path d="M4 30C16 18 28 18 40 30S64 42 76 30 92 22 96 26"/><path d="M4 52C16 40 28 40 40 52S64 64 76 52 92 44 96 48"/><path d="M4 74C16 62 28 62 40 74S64 86 76 74 92 66 96 70"/></g>',
    ),
  },
  {
    id: 'squiggle',
    name: 'Squiggle',
    tags: ['line', 'doodle', 'underline'],
    svg: svg(
      '<path fill="none" stroke="#8c52ff" stroke-width="7" stroke-linecap="round" d="M4 50C14 30 22 30 28 50S42 70 50 50 64 30 72 50 86 70 96 50"/>',
      '0 20 100 60',
    ),
  },
  {
    id: 'arrow-curve',
    name: 'Curved arrow',
    tags: ['arrow', 'doodle', 'pointer'],
    svg: svg(
      '<g fill="none" stroke="#1f1f1f" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 80C20 40 50 18 86 24"/><path d="M70 12L88 24L74 40"/></g>',
    ),
  },
  {
    id: 'circle-scribble',
    name: 'Circle scribble',
    tags: ['doodle', 'highlight', 'circle'],
    svg: svg(
      '<path fill="none" stroke="#ff3131" stroke-width="4" stroke-linecap="round" d="M60 12C30 6 6 24 8 50C10 78 40 94 68 86C92 78 98 50 86 30C76 14 52 10 36 16"/>',
    ),
  },
  {
    id: 'badge-check',
    name: 'Verified badge',
    tags: ['badge', 'check', 'approved', 'seal'],
    svg: svg(
      `<path fill="#00bf63" d="${Array.from({ length: 24 }, (_, i) => {
        const r = i % 2 ? 40 : 48;
        const a = (i * Math.PI) / 12 - Math.PI / 2;
        return `${i ? 'L' : 'M'}${(50 + Math.cos(a) * r).toFixed(1)} ${(50 + Math.sin(a) * r).toFixed(1)}`;
      }).join(
        '',
      )}Z"/><path fill="none" stroke="#ffffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M32 51L44 63L68 38"/>`,
    ),
  },
  {
    id: 'ribbon',
    name: 'Ribbon banner',
    tags: ['banner', 'label', 'title'],
    svg: svg(
      '<path fill="#c21f1f" d="M2 22H22V48H2L10 35Z"/><path fill="#c21f1f" d="M98 22H78V48H98L90 35Z"/><path fill="#ff3131" d="M14 14H86V42H14Z"/>',
      '0 10 100 42',
    ),
  },
  {
    id: 'price-tag',
    name: 'Price tag',
    tags: ['sale', 'shop', 'label'],
    svg: svg(
      '<path fill="#ffbd59" d="M48 6H88C91 6 94 9 94 12V52L50 96L4 50Z"/><circle cx="76" cy="24" r="7" fill="#ffffff"/>',
    ),
  },
  {
    id: 'camera',
    name: 'Camera',
    tags: ['photo', 'photography', 'picture'],
    svg: svg(
      '<path fill="#1f1f1f" d="M14 28H32L38 18H62L68 28H86C91 28 95 32 95 37V78C95 83 91 87 86 87H14C9 87 5 83 5 78V37C5 32 9 28 14 28Z"/><circle cx="50" cy="57" r="20" fill="#ffffff"/><circle cx="50" cy="57" r="13" fill="#5e17eb"/><circle cx="80" cy="40" r="4" fill="#ffde59"/>',
    ),
  },
  {
    id: 'aperture',
    name: 'Aperture',
    tags: ['photo', 'photography', 'lens'],
    svg: svg(
      '<circle cx="50" cy="50" r="46" fill="#1f1f1f"/><g fill="#737373">' +
        Array.from(
          { length: 6 },
          (_, i) => `<path transform="rotate(${i * 60} 50 50)" d="M50 10L74 24L58 44Z"/>`,
        ).join('') +
        '</g><circle cx="50" cy="50" r="12" fill="#38b6ff"/>',
    ),
  },
  {
    id: 'heart-outline',
    name: 'Heart outline',
    tags: ['love', 'like'],
    svg: svg(
      '<path fill="none" stroke="#ff66c4" stroke-width="7" stroke-linejoin="round" d="M50 88C22 68 8 52 8 33C8 19 18 9 31 9C39 9 46 14 50 21C54 14 61 9 69 9C82 9 92 19 92 33C92 52 78 68 50 88Z"/>',
    ),
  },
  {
    id: 'confetti',
    name: 'Confetti',
    tags: ['party', 'celebrate', 'birthday'],
    svg: svg(
      '<rect x="10" y="12" width="10" height="5" rx="2" fill="#ff5757" transform="rotate(30 15 14)"/><rect x="70" y="8" width="10" height="5" rx="2" fill="#38b6ff" transform="rotate(-20 75 10)"/><circle cx="42" cy="22" r="4" fill="#ffde59"/><rect x="82" y="44" width="10" height="5" rx="2" fill="#00bf63" transform="rotate(50 87 46)"/><circle cx="20" cy="56" r="4" fill="#8c52ff"/><rect x="46" y="62" width="10" height="5" rx="2" fill="#ff66c4" transform="rotate(-35 51 64)"/><circle cx="70" cy="84" r="4" fill="#ff914d"/><rect x="14" y="84" width="10" height="5" rx="2" fill="#5ce1e6" transform="rotate(15 19 86)"/><circle cx="58" cy="40" r="3" fill="#ff5757"/>',
    ),
  },
  {
    id: 'balloon',
    name: 'Balloon',
    tags: ['party', 'birthday'],
    svg: svg(
      '<path fill="#ff5757" d="M50 6C70 6 84 22 84 42C84 62 66 76 50 76C34 76 16 62 16 42C16 22 30 6 50 6Z"/><path fill="#ff5757" d="M46 76H54L56 82H44Z"/><path fill="none" stroke="#545454" stroke-width="2" d="M50 82C46 88 54 92 50 98"/><ellipse cx="36" cy="30" rx="6" ry="10" fill="#ffffff" opacity="0.5"/>',
    ),
  },
  {
    id: 'gift',
    name: 'Gift',
    tags: ['present', 'birthday', 'holiday'],
    svg: svg(
      '<rect x="10" y="38" width="80" height="54" rx="4" fill="#8c52ff"/><rect x="6" y="26" width="88" height="16" rx="3" fill="#5e17eb"/><rect x="44" y="26" width="12" height="66" fill="#ffde59"/><path fill="#ffde59" d="M50 26C40 10 22 10 24 20C26 28 40 26 50 26ZM50 26C60 10 78 10 76 20C74 28 60 26 50 26Z"/>',
    ),
  },
  {
    id: 'crown',
    name: 'Crown',
    tags: ['king', 'queen', 'royal', 'premium'],
    svg: svg(
      '<path fill="#ffbd59" d="M8 30L30 50L50 18L70 50L92 30L84 80H16Z"/><rect x="16" y="80" width="68" height="10" rx="2" fill="#ff914d"/><circle cx="50" cy="60" r="6" fill="#ff3131"/>',
    ),
  },
  {
    id: 'coffee',
    name: 'Coffee cup',
    tags: ['cafe', 'drink', 'morning'],
    svg: svg(
      '<path fill="#ffffff" stroke="#5b3a29" stroke-width="5" d="M14 36H72V66C72 80 60 90 46 90H40C26 90 14 80 14 66Z"/><path fill="none" stroke="#5b3a29" stroke-width="5" d="M72 44H80C88 44 92 50 92 56C92 64 86 70 76 70H70"/><g fill="none" stroke="#a6a6a6" stroke-width="4" stroke-linecap="round"><path d="M32 8C26 16 38 18 32 26"/><path d="M48 8C42 16 54 18 48 26"/></g>',
    ),
  },
  {
    id: 'music',
    name: 'Music note',
    tags: ['song', 'sound', 'party'],
    svg: svg(
      '<path fill="#5e17eb" d="M36 14L90 4V68C90 77 82 84 72 84C63 84 56 78 56 70C56 62 63 56 72 56C75 56 78 57 80 58V24L46 30V76C46 85 38 92 28 92C19 92 12 86 12 78C12 70 19 64 28 64C31 64 34 65 36 66Z"/>',
    ),
  },
  {
    id: 'pin',
    name: 'Location pin',
    tags: ['map', 'place', 'address'],
    svg: svg(
      '<path fill="#ff3131" d="M50 4C30 4 16 19 16 38C16 62 50 96 50 96C50 96 84 62 84 38C84 19 70 4 50 4Z"/><circle cx="50" cy="38" r="13" fill="#ffffff"/>',
    ),
  },
  {
    id: 'smiley',
    name: 'Smiley',
    tags: ['happy', 'emoji', 'face'],
    svg: svg(
      '<circle cx="50" cy="50" r="46" fill="#ffde59"/><circle cx="35" cy="40" r="6" fill="#1f1f1f"/><circle cx="65" cy="40" r="6" fill="#1f1f1f"/><path fill="none" stroke="#1f1f1f" stroke-width="6" stroke-linecap="round" d="M28 60C38 76 62 76 72 60"/>',
    ),
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    tags: ['colour', 'pride', 'happy'],
    svg: svg(
      '<g fill="none" stroke-width="9"><path stroke="#ff5757" d="M8 74A42 42 0 0 1 92 74"/><path stroke="#ffbd59" d="M17 74A33 33 0 0 1 83 74"/><path stroke="#7ed957" d="M26 74A24 24 0 0 1 74 74"/><path stroke="#38b6ff" d="M35 74A15 15 0 0 1 65 74"/></g>',
      '0 20 100 60',
    ),
  },
  {
    id: 'blob-pastel',
    name: 'Soft blob',
    tags: ['abstract', 'organic', 'background'],
    svg: svg(
      '<path fill="#ffd6e8" d="M60 6C80 10 96 28 94 50C92 74 74 94 50 94C24 94 6 76 6 52C6 26 34 2 60 6Z"/>',
    ),
  },
  {
    id: 'blob-mint',
    name: 'Mint blob',
    tags: ['abstract', 'organic', 'background'],
    svg: svg(
      '<path fill="#c9f7e3" d="M46 4C70 2 92 18 96 42C100 66 82 92 56 96C30 100 6 84 4 58C2 32 22 6 46 4Z"/>',
    ),
  },
  {
    id: 'dots',
    name: 'Dot grid',
    tags: ['pattern', 'abstract', 'decor'],
    svg: svg(
      `<g fill="#1f1f1f">${Array.from({ length: 25 }, (_, i) => `<circle cx="${10 + (i % 5) * 20}" cy="${10 + Math.floor(i / 5) * 20}" r="3.5"/>`).join('')}</g>`,
    ),
  },
  {
    id: 'check-circle',
    name: 'Check',
    tags: ['done', 'yes', 'tick'],
    svg: svg(
      '<circle cx="50" cy="50" r="46" fill="#00bf63"/><path fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" d="M28 52L44 66L72 36"/>',
    ),
  },
  {
    id: 'play',
    name: 'Play button',
    tags: ['video', 'youtube', 'media'],
    svg: svg(
      '<rect x="2" y="16" width="96" height="68" rx="18" fill="#ff3131"/><path fill="#ffffff" d="M40 34L66 50L40 66Z"/>',
    ),
  },
  {
    id: 'speech-outline',
    name: 'Speech bubble',
    tags: ['chat', 'quote', 'talk'],
    svg: svg(
      '<path fill="#ffffff" stroke="#1f1f1f" stroke-width="5" stroke-linejoin="round" d="M14 10H86C91 10 94 13 94 18V60C94 65 91 68 86 68H44L22 88L26 68H14C9 68 6 65 6 60V18C6 13 9 10 14 10Z"/>',
    ),
  },
  {
    id: 'quote-marks',
    name: 'Quote marks',
    tags: ['quote', 'testimonial'],
    svg: svg(
      '<path fill="#8c52ff" d="M10 58C10 34 22 18 42 12L46 22C34 28 30 36 30 44H44V80H10ZM56 58C56 34 68 18 88 12L92 22C80 28 76 36 76 44H90V80H56Z"/>',
    ),
  },
];
