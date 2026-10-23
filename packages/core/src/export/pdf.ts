import { zlibSync } from 'fflate';

export interface PdfPageImage {
  /** Page size in PDF points (1/72 in). */
  widthPt: number;
  heightPt: number;
  /** Encoded image: JPEG bytes, or raw RGB (8-bit, row-major) to be deflated. */
  image:
    | { kind: 'jpeg'; data: Uint8Array; pixelWidth: number; pixelHeight: number }
    | { kind: 'rgb'; data: Uint8Array; pixelWidth: number; pixelHeight: number };
}

export interface PdfMeta {
  title?: string;
  author?: string;
  creator?: string;
}

const encoder = new TextEncoder();

/** Escape a PDF literal string (non-ASCII as UTF-16BE hex). */
function pdfString(s: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: PDF strings must escape control characters
  if (/^[\x20-\x7e]*$/.test(s)) return `(${s.replace(/[\\()]/g, (c) => `\\${c}`)})`;
  let hex = 'FEFF';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code > 0xffff) {
      const v = code - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += code.toString(16).padStart(4, '0');
    }
  }
  return `<${hex.toUpperCase()}>`;
}

function pdfDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

/**
 * Build a PDF where each page is one full-bleed image. Small and dependency
 * free apart from zlib; vector output is a separate exporter.
 */
export function buildImagePdf(pages: PdfPageImage[], meta: PdfMeta = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: string | Uint8Array) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObj = (n: number) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
  };

  // Object numbers: 1 catalog, 2 pages, 3 info, then 3 per page (page, contents, image).
  const pageObj = (i: number) => 4 + i * 3;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  beginObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  beginObj(2);
  const kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ');
  push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`);

  beginObj(3);
  const info: string[] = [
    `/Producer ${pdfString('Design Pad')}`,
    `/CreationDate (${pdfDate(new Date())})`,
  ];
  if (meta.title) info.push(`/Title ${pdfString(meta.title)}`);
  if (meta.author) info.push(`/Author ${pdfString(meta.author)}`);
  if (meta.creator) info.push(`/Creator ${pdfString(meta.creator)}`);
  push(`<< ${info.join(' ')} >>\nendobj\n`);

  pages.forEach((page, i) => {
    const n = pageObj(i);
    const w = fmt(page.widthPt);
    const h = fmt(page.heightPt);
    beginObj(n);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${n + 1} 0 R >>\nendobj\n`,
    );
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
    beginObj(n + 1);
    push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);

    const img = page.image;
    const data = img.kind === 'jpeg' ? img.data : zlibSync(img.data, { level: 6 });
    const filter = img.kind === 'jpeg' ? '/DCTDecode' : '/FlateDecode';
    beginObj(n + 2);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${img.pixelWidth} /Height ${img.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter ${filter} /Length ${data.length} >>\nstream\n`,
    );
    push(data);
    push('\nendstream\nendobj\n');
  });

  const objCount = 4 + pages.length * 3;
  const xrefOffset = length;
  let xref = `xref\n0 ${objCount}\n0000000000 65535 f \n`;
  for (let n = 1; n < objCount; n++)
    xref += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(
    `trailer\n<< /Size ${objCount} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

/** Strip alpha from RGBA pixels, compositing over white. */
export function rgbaToRgb(rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3]! / 255;
    out[i * 3] = Math.round(rgba[i * 4]! * a + 255 * (1 - a));
    out[i * 3 + 1] = Math.round(rgba[i * 4 + 1]! * a + 255 * (1 - a));
    out[i * 3 + 2] = Math.round(rgba[i * 4 + 2]! * a + 255 * (1 - a));
  }
  return out;
}
