import type { DesignFile, Editor, ExportResult, FontFamilyDef, Unit } from '@design-pad/core';

/** A file stored by the host (or by the default in-memory adapter). */
export interface UploadedAsset {
  /** Stable id from the host, if any. */
  id?: string;
  /** URL or host-specific reference (resolved through `resolveUrl`). */
  src: string;
  mime: string;
  width: number;
  height: number;
  name?: string;
  /** Small preview URL for the uploads grid. Defaults to `src`. */
  thumbUrl?: string;
}

/** How the editor stores and reads user files. Implement this to use your own storage (S3, GCS...). */
export interface AssetAdapter {
  /** Persist a file and return how to reference it. */
  upload(file: File): Promise<UploadedAsset>;
  /** The user's previous uploads, newest first, for the Uploads panel. */
  list?(): Promise<UploadedAsset[]>;
  remove?(asset: UploadedAsset): Promise<void>;
  /** Turn a stored `src` into a URL the browser can load (signed URLs, custom schemes). */
  resolveUrl?(src: string): string | Promise<string>;
}

export interface PhotoResult {
  id: string;
  thumbUrl: string;
  url: string;
  width: number;
  height: number;
  author?: string;
  authorUrl?: string;
  source?: string;
}

/** Stock/gallery photo search shown in the Photos panel. */
export interface PhotoProvider {
  /** Label shown in the panel ("Unsplash", "Client gallery"...). */
  name: string;
  search(query: string, page: number): Promise<{ results: PhotoResult[]; hasMore: boolean }>;
  /** Called when a photo is inserted (e.g. to trigger a download ping). */
  onUse?(photo: PhotoResult): void;
}

export interface TemplateSummary {
  id: string;
  title: string;
  width: number;
  height: number;
  category?: string;
  tags?: string[];
  /** Optional preview URL. Without one the editor renders a thumbnail. */
  thumbnail?: string;
}

export interface TemplateProvider {
  list(): Promise<TemplateSummary[]>;
  load(id: string): Promise<DesignFile>;
}

export interface BrandKit {
  name?: string;
  colors: string[];
  fonts?: { heading?: string; subheading?: string; body?: string };
  logos?: UploadedAsset[];
}

export type LeftPanelId = 'design' | 'elements' | 'text' | 'brand' | 'uploads' | 'photos' | 'draw';

export interface FeatureFlags {
  /** Left rail tabs to show, in order. */
  panels: LeftPanelId[];
  /** Show the top header bar (title, undo/redo, download). */
  header: boolean;
  /** Allow multiple pages. */
  multiPage: boolean;
  /** Allow downloading (export dialog). */
  download: boolean;
  /** Allow changing the design size. */
  resize: boolean;
}

export const DEFAULT_FEATURES: FeatureFlags = {
  panels: ['design', 'elements', 'text', 'brand', 'uploads', 'photos', 'draw'],
  header: true,
  multiPage: true,
  download: true,
  resize: true,
};

export interface HeaderAction {
  label: string;
  /** 'primary' renders as the main call to action. */
  variant?: 'primary' | 'secondary';
  onClick(editor: Editor): void;
}

export interface DesignPadOptions {
  /** Supply an engine instance (e.g. to share it with your own UI). */
  editor?: Editor;
  /** Design to open. */
  design?: DesignFile;
  /** Size of a new blank design. */
  size?: { width: number; height: number; unit?: Unit; dpi?: number; title?: string };
  assets?: AssetAdapter;
  photos?: PhotoProvider;
  templates?: TemplateProvider;
  fonts?: FontFamilyDef[];
  brand?: BrandKit;
  theme?: 'light' | 'dark';
  features?: Partial<FeatureFlags>;
  /** Replace the default header actions (Share/Download) with your own buttons. */
  headerActions?: HeaderAction[];
  /** Save indicator shown in the header ("All changes saved"). */
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'error' | null;
  /** Content for the left of the header (logo / back button). */
  homeLabel?: string;
  onHome?(): void;
  /** Debounced document change notification. */
  onChange?(design: DesignFile, editor: Editor): void;
  /** Save requested (Ctrl/Cmd+S or a header action calling `editor`). */
  onSave?(design: DesignFile, editor: Editor): void | Promise<void>;
  /** Called after an export. Return false to suppress the default browser download. */
  // biome-ignore lint/suspicious/noConfusingVoidType: callbacks may return nothing at all
  onExport?(result: ExportResult, editor: Editor): void | boolean | Promise<void | boolean>;
  onReady?(editor: Editor): void;
  /** A part of the editor UI failed to render. The rest keeps working; report it to your error tracker. */
  onError?(error: unknown): void;
}
