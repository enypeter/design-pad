const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** Random base62 id. 14 chars ≈ 83 bits of entropy. */
export function randomId(length = 14): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % 62];
  return out;
}

export const createElementId = () => `el_${randomId()}`;
export const createPageId = () => `pg_${randomId()}`;
export const createAssetId = () => `as_${randomId()}`;
export const createDesignId = () => `dsn_${randomId()}`;
