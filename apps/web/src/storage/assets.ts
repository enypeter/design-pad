import { randomId } from '@design-pad/core';
import type { AssetAdapter, UploadedAsset } from '@design-pad/editor';
import { get, getAll, put, remove } from './db';

interface StoredAsset {
  id: string;
  blob: Blob;
  mime: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
}

/** Assets live in IndexedDB and are referenced from designs as `idb://<id>`. */
const SCHEME = 'idb://';
const urlCache = new Map<string, string>();

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  if (blob.type === 'image/svg+xml') {
    const text = await blob.text();
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
    const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(text);
    const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(text);
    return {
      width: Number(w?.[1] ?? vb?.[1] ?? 100) || 100,
      height: Number(h?.[1] ?? vb?.[2] ?? 100) || 100,
    };
  }
  try {
    const bmp = await createImageBitmap(blob);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return { width: 100, height: 100 };
  }
}

function toUploaded(a: StoredAsset): UploadedAsset {
  return {
    id: a.id,
    src: `${SCHEME}${a.id}`,
    mime: a.mime,
    name: a.name,
    width: a.width,
    height: a.height,
  };
}

/** Local-first asset adapter backed by IndexedDB (no server needed). */
export const indexedDbAssets: AssetAdapter = {
  async upload(file) {
    const id = `up_${randomId()}`;
    const size =
      file.type.startsWith('font/') || /\.(ttf|otf|woff2?)$/i.test(file.name)
        ? { width: 0, height: 0 }
        : await measure(file);
    const stored: StoredAsset = {
      id,
      blob: file,
      mime: file.type,
      name: file.name,
      ...size,
      createdAt: Date.now(),
    };
    await put('assets', stored);
    return toUploaded(stored);
  },
  async list() {
    const all = await getAll<StoredAsset>('assets');
    return all
      .filter((a) => a.mime.startsWith('image/'))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(toUploaded);
  },
  async remove(asset) {
    const id = asset.src.startsWith(SCHEME) ? asset.src.slice(SCHEME.length) : asset.id;
    if (!id) return;
    await remove('assets', id);
    const url = urlCache.get(id);
    if (url) URL.revokeObjectURL(url);
    urlCache.delete(id);
  },
  async resolveUrl(src) {
    if (!src.startsWith(SCHEME)) return src;
    const id = src.slice(SCHEME.length);
    let url = urlCache.get(id);
    if (!url) {
      const stored = await get<StoredAsset>('assets', id);
      if (!stored) return src;
      url = URL.createObjectURL(stored.blob);
      urlCache.set(id, url);
    }
    return url;
  },
};
