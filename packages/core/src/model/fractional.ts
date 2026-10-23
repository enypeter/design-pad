import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/** Byte-wise comparison; fractional index keys must not be compared with localeCompare. */
export function compareIndex(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function indexBetween(a: string | null | undefined, b: string | null | undefined): string {
  return generateKeyBetween(a ?? null, b ?? null);
}

export function indicesBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  n: number,
): string[] {
  return generateNKeysBetween(a ?? null, b ?? null, n);
}

export function sortByIndex<T extends { index: string }>(items: T[]): T[] {
  return items.sort((a, b) => compareIndex(a.index, b.index));
}
