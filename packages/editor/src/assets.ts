import type { AssetAdapter, UploadedAsset } from './config';

export const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|svg\+xml|avif|bmp)$/;

/** Read an image file's natural size. */
export async function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || 100, height: img.naturalHeight || 100 });
    img.onerror = () => resolve({ width: 100, height: 100 });
    img.src = src;
  });
}

/** Size of an SVG file from its markup (width/height or viewBox). */
export async function svgSize(file: Blob): Promise<{ width: number; height: number }> {
  const text = await file.text();
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
  const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(text);
  const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(text);
  const width = Number(w?.[1] ?? vb?.[1] ?? 100);
  const height = Number(h?.[1] ?? vb?.[2] ?? 100);
  return { width: width || 100, height: height || 100 };
}

export async function describeFile(file: File, src: string): Promise<UploadedAsset> {
  const size = file.type === 'image/svg+xml' ? await svgSize(file) : await imageSize(src);
  return { src, mime: file.type, name: file.name, ...size };
}

/**
 * Default adapter when the host provides none: keeps files in memory as
 * object URLs for the session. Designs referencing them will not survive a
 * reload, so production hosts should provide their own adapter.
 */
export function createMemoryAssetAdapter(): AssetAdapter {
  const uploads: UploadedAsset[] = [];
  return {
    async upload(file) {
      const src = URL.createObjectURL(file);
      const asset = { id: `mem_${uploads.length + 1}`, ...(await describeFile(file, src)) };
      uploads.unshift(asset);
      return asset;
    },
    async list() {
      return [...uploads];
    },
    async remove(asset) {
      const i = uploads.findIndex((u) => u.src === asset.src);
      if (i >= 0) uploads.splice(i, 1);
      if (asset.src.startsWith('blob:')) URL.revokeObjectURL(asset.src);
    },
  };
}
