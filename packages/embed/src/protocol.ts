/**
 * Wire protocol between a host app and an embedded Design Pad editor.
 *
 * Iframes: the editor posts HELLO to its parent; the host answers with INIT
 * and a transferred MessagePort; all further traffic uses that private port.
 * Native WebViews (iOS, Android, Flutter): the same messages travel as JSON
 * strings through the platform bridge; binary data is base64 data URLs.
 */

export const PROTOCOL_VERSION = 1;
export const HELLO = 'design-pad:hello';
export const INIT = 'design-pad:init';

/** Minimal shapes so the embed package does not depend on core/editor at runtime. */
export interface DesignFileLike {
  format: 'design-pad';
  schemaVersion: number;
  id: string;
  title: string;
  width: number;
  height: number;
  [key: string]: unknown;
}

export interface EmbedAsset {
  id?: string;
  src: string;
  mime: string;
  width: number;
  height: number;
  name?: string;
  thumbUrl?: string;
}

export interface EmbedPhoto {
  id: string;
  thumbUrl: string;
  url: string;
  width: number;
  height: number;
  author?: string;
  authorUrl?: string;
  source?: string;
}

export interface EmbedBrand {
  name?: string;
  colors: string[];
  fonts?: { heading?: string; subheading?: string; body?: string };
  logos?: EmbedAsset[];
}

export interface EmbedHeaderAction {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
}

export interface EmbedExportOptions {
  format: 'png' | 'jpeg' | 'webp' | 'pdf' | 'json';
  pageIds?: string[];
  scale?: number;
  quality?: number;
  transparent?: boolean;
  dpi?: number;
}

/** A file crossing the bridge: a Blob over MessagePort, a data URL over native bridges. */
export interface EmbedFile {
  name: string;
  mime: string;
  blob?: Blob;
  dataUrl?: string;
}

export interface EmbedInitConfig {
  design?: DesignFileLike;
  size?: { width: number; height: number; unit?: 'px' | 'mm' | 'cm' | 'in' };
  title?: string;
  theme?: 'light' | 'dark';
  brand?: EmbedBrand;
  features?: {
    panels?: string[];
    header?: boolean;
    multiPage?: boolean;
    download?: boolean;
    resize?: boolean;
  };
  /** Buttons in the editor header; clicks arrive as `action` events. Replaces Download. */
  headerActions?: EmbedHeaderAction[];
  /** Which host callbacks exist (the editor only calls what is advertised). */
  capabilities: {
    uploadAsset: boolean;
    listAssets: boolean;
    resolveAssetUrl: boolean;
    photos: { name: string } | null;
  };
  /** Send exports to the host instead of downloading in the editor. */
  interceptExport?: boolean;
  /** Emit debounced `change` events carrying the design JSON. */
  emitChanges?: boolean;
}

/** Methods the host can call on the editor. */
export interface EditorMethods {
  getDesign(): DesignFileLike;
  loadDesign(params: { design: DesignFileLike }): void;
  export(params: EmbedExportOptions): EmbedFile;
  addImage(params: { url: string; width?: number; height?: number; name?: string }): string;
  addText(params: { text: string; fontSize?: number; fontFamily?: string; color?: string }): string;
  setTheme(params: { theme: 'light' | 'dark' }): void;
  undo(): void;
  redo(): void;
}

/** Methods the editor can call on the host (only those advertised in capabilities). */
export interface HostMethods {
  uploadAsset(params: { file: EmbedFile }): EmbedAsset;
  listAssets(): EmbedAsset[];
  resolveAssetUrl(params: { src: string }): string;
  searchPhotos(params: { query: string; page: number }): {
    results: EmbedPhoto[];
    hasMore: boolean;
  };
  usePhoto(params: { photo: EmbedPhoto }): void;
}

/** Events the editor sends to the host. */
export interface EditorEvents {
  ready: { designId: string };
  change: { design: DesignFileLike };
  save: { design: DesignFileLike };
  action: { id: string; design: DesignFileLike };
  export: { file: EmbedFile; format: string };
  error: { message: string };
}

export type RpcMessage =
  | { kind: 'request'; id: number; method: string; params?: unknown }
  | { kind: 'response'; id: number; ok: true; result?: unknown }
  | { kind: 'response'; id: number; ok: false; error: { message: string } }
  | { kind: 'event'; name: string; payload?: unknown };

export interface HelloMessage {
  type: typeof HELLO;
  version: number;
}

export interface InitMessage {
  type: typeof INIT;
  version: number;
  config: EmbedInitConfig;
}

export function isHello(data: unknown): data is HelloMessage {
  return typeof data === 'object' && data !== null && (data as HelloMessage).type === HELLO;
}

export function isInit(data: unknown): data is InitMessage {
  return typeof data === 'object' && data !== null && (data as InitMessage).type === INIT;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk)
    bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL');
  const mime = m[1] || 'application/octet-stream';
  if (!m[2]) return new Blob([decodeURIComponent(m[3]!)], { type: mime });
  const bin = atob(m[3]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Read a file payload regardless of transport. */
export async function fileToBlob(file: EmbedFile): Promise<Blob> {
  if (file.blob) return file.blob;
  if (file.dataUrl) return dataUrlToBlob(file.dataUrl);
  throw new Error('File payload is empty');
}
