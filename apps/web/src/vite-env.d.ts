/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional Unsplash access key to enable the Photos panel. */
  readonly VITE_UNSPLASH_ACCESS_KEY?: string;
  /** Origins allowed to embed /embed (comma separated). Empty = any origin. */
  readonly VITE_EMBED_ALLOWED_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
