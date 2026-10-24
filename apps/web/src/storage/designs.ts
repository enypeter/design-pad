import type { DesignFile } from '@design-pad/core';
import { get, getAll, put, remove } from './db';

export interface DesignEntry {
  id: string;
  title: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  file: DesignFile;
}

export type DesignSummary = Omit<DesignEntry, 'file'>;

export async function listDesigns(): Promise<DesignSummary[]> {
  const all = await getAll<DesignEntry>('designs');
  return all.map(({ file: _file, ...rest }) => rest).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadDesign(id: string): Promise<DesignEntry | undefined> {
  return get<DesignEntry>('designs', id);
}

export async function saveDesign(file: DesignFile): Promise<void> {
  const existing = await get<DesignEntry>('designs', file.id);
  const now = Date.now();
  await put('designs', {
    id: file.id,
    title: file.title,
    width: file.width,
    height: file.height,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    file,
  } satisfies DesignEntry);
}

export async function deleteDesign(id: string): Promise<void> {
  await remove('designs', id);
  await remove('thumbs', id);
}

export async function saveThumbnail(id: string, blob: Blob): Promise<void> {
  await put('thumbs', blob, id);
}

export async function loadThumbnail(id: string): Promise<Blob | undefined> {
  return get<Blob>('thumbs', id);
}
