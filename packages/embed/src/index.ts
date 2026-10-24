import {
  type DesignFileLike,
  type EmbedAsset,
  type EmbedBrand,
  type EmbedExportOptions,
  type EmbedFile,
  type EmbedHeaderAction,
  type EmbedInitConfig,
  type EmbedPhoto,
  fileToBlob,
  INIT,
  isHello,
  PROTOCOL_VERSION,
} from './protocol';
import { portTransport, RpcPeer } from './rpc';

export * from './protocol';
export { portTransport, RpcPeer, type Transport } from './rpc';

export interface EmbedOptions {
  /** Element that will contain the editor iframe. */
  container: HTMLElement;
  /** URL of the hosted editor's embed route, e.g. https://design.example.com/embed */
  editorUrl: string;
  /** Design to open; omit for a blank design of `size`. */
  design?: DesignFileLike;
  size?: EmbedInitConfig['size'];
  title?: string;
  theme?: 'light' | 'dark';
  brand?: EmbedBrand;
  features?: EmbedInitConfig['features'];
  /** Header buttons such as "Save" or "Done"; clicks call `onAction`. */
  headerActions?: EmbedHeaderAction[];
  /** Store user uploads in your backend. Without this, images are embedded in the design as data URLs. */
  assets?: {
    /** Store a file the user added (name and type preserved) and say how to reference it. */
    upload(file: File): Promise<EmbedAsset>;
    list?(): Promise<EmbedAsset[]>;
    /** Turn a stored reference into a fetchable URL (e.g. a signed URL). */
    resolveUrl?(src: string): Promise<string> | string;
  };
  /** Photo search shown in the Photos panel (e.g. a client's gallery). */
  photos?: {
    name: string;
    search(query: string, page: number): Promise<{ results: EmbedPhoto[]; hasMore: boolean }>;
    onUse?(photo: EmbedPhoto): void;
  };
  /** Receive downloads instead of the editor saving files itself. */
  onExport?(file: Blob, info: { filename: string; format: string }): void;
  /** The editor finished loading. Fires again if the editor page reloads (it restarts from `design`). */
  onReady?(info: { designId: string }): void;
  /** Debounced document changes (enables change events). */
  onChange?(design: DesignFileLike): void;
  /** User pressed Ctrl/Cmd+S. */
  onSave?(design: DesignFileLike): void;
  onAction?(id: string, design: DesignFileLike): void;
  onError?(message: string): void;
  /** Iframe attributes. */
  iframe?: { title?: string; className?: string; style?: Partial<CSSStyleDeclaration> };
  /** How long to wait for the editor to say hello. Default 20 s. */
  timeoutMs?: number;
}

export interface DesignPadEmbed {
  iframe: HTMLIFrameElement;
  getDesign(): Promise<DesignFileLike>;
  loadDesign(design: DesignFileLike): Promise<void>;
  /** Export without user interaction (returns the file). */
  export(options: EmbedExportOptions): Promise<{ blob: Blob; filename: string }>;
  addImage(params: {
    url: string;
    width?: number;
    height?: number;
    name?: string;
  }): Promise<string>;
  addText(params: {
    text: string;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
  }): Promise<string>;
  setTheme(theme: 'light' | 'dark'): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  destroy(): void;
}

/**
 * Embed the hosted editor in an iframe and talk to it over a private
 * MessageChannel. Resolves once the editor is ready.
 *
 * ```js
 * const pad = await openDesignPad({
 *   container: document.getElementById('editor'),
 *   editorUrl: 'https://design.example.com/embed',
 *   size: { width: 1080, height: 1080 },
 *   headerActions: [{ id: 'done', label: 'Done', variant: 'primary' }],
 *   onAction: (id, design) => save(design),
 * });
 * ```
 */
export function openDesignPad(options: EmbedOptions): Promise<DesignPadEmbed> {
  const url = new URL(options.editorUrl, window.location.href);
  const origin = url.origin;
  const iframe = document.createElement('iframe');
  iframe.src = url.toString();
  iframe.title = options.iframe?.title ?? 'Design editor';
  iframe.allow = 'clipboard-read; clipboard-write; fullscreen';
  if (options.iframe?.className) iframe.className = options.iframe.className;
  Object.assign(
    iframe.style,
    { border: '0', width: '100%', height: '100%', display: 'block' },
    options.iframe?.style,
  );
  options.container.appendChild(iframe);

  return new Promise((resolve, reject) => {
    let peer: RpcPeer | null = null;
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error('The editor did not respond. Check editorUrl and that the page allows framing.'),
      );
    }, options.timeoutMs ?? 20_000);

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.origin !== origin || !isHello(e.data)) return;
      // Another hello means the editor page (re)loaded: replace the channel.
      peer?.close();
      const channel = new MessageChannel();
      peer = new RpcPeer(portTransport(channel.port1));
      wire(peer);
      const config: EmbedInitConfig = {
        design: options.design,
        size: options.size,
        title: options.title,
        theme: options.theme,
        brand: options.brand,
        features: options.features,
        headerActions: options.headerActions,
        capabilities: {
          uploadAsset: !!options.assets,
          listAssets: !!options.assets?.list,
          resolveAssetUrl: !!options.assets?.resolveUrl,
          photos: options.photos ? { name: options.photos.name } : null,
        },
        interceptExport: !!options.onExport,
        emitChanges: !!options.onChange,
      };
      iframe.contentWindow!.postMessage({ type: INIT, version: PROTOCOL_VERSION, config }, origin, [
        channel.port2,
      ]);
    };

    const wire = (p: RpcPeer) => {
      const a = options.assets;
      if (a) {
        p.handle('uploadAsset', async (params) => {
          const { file } = params as { file: EmbedFile };
          const blob = await fileToBlob(file);
          return a.upload(
            blob instanceof File
              ? blob
              : new File([blob], file.name, { type: file.mime || blob.type }),
          );
        });
        if (a.list) p.handle('listAssets', () => a.list!());
        if (a.resolveUrl)
          p.handle('resolveAssetUrl', (params) => a.resolveUrl!((params as { src: string }).src));
      }
      const ph = options.photos;
      if (ph) {
        p.handle('searchPhotos', (params) => {
          const { query, page } = params as { query: string; page: number };
          return ph.search(query, page);
        });
        p.handle('usePhoto', (params) => ph.onUse?.((params as { photo: EmbedPhoto }).photo));
      }
      p.on('ready', (payload) => {
        clearTimeout(timer);
        options.onReady?.(payload as { designId: string });
        resolve(embed);
      });
      p.on('change', (payload) =>
        options.onChange?.((payload as { design: DesignFileLike }).design),
      );
      p.on('save', (payload) => options.onSave?.((payload as { design: DesignFileLike }).design));
      p.on('action', (payload) => {
        const { id, design } = payload as { id: string; design: DesignFileLike };
        options.onAction?.(id, design);
      });
      p.on('export', async (payload) => {
        const { file, format } = payload as { file: EmbedFile; format: string };
        options.onExport?.(await fileToBlob(file), { filename: file.name, format });
      });
      p.on('error', (payload) => options.onError?.((payload as { message: string }).message));
    };

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      peer?.close();
      peer = null;
      iframe.remove();
    };

    // Calls go to the current channel, so the handle survives an editor reload.
    const call = <T>(method: string, params?: unknown): Promise<T> =>
      peer
        ? peer.request<T>(method, params)
        : Promise.reject(new Error('The editor is not connected'));

    const embed: DesignPadEmbed = {
      iframe,
      getDesign: () => call('getDesign'),
      loadDesign: (design) => call('loadDesign', { design }),
      export: async (opts) => {
        const file = await call<EmbedFile>('export', opts);
        return { blob: await fileToBlob(file), filename: file.name };
      },
      addImage: (params) => call('addImage', params),
      addText: (params) => call('addText', params),
      setTheme: (theme) => call('setTheme', { theme }),
      undo: () => call('undo'),
      redo: () => call('redo'),
      destroy: cleanup,
    };

    window.addEventListener('message', onMessage);
  });
}
