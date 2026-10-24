import {
  createImageFill,
  createText,
  type DesignFile,
  type Editor,
  type ExportResult,
  exportDesign,
  migrateDesignFile,
} from '@design-pad/core';
import {
  blobToDataUrl,
  type EmbedAsset,
  type EmbedFile,
  type EmbedInitConfig,
  type EmbedPhoto,
  HELLO,
  isInit,
  PROTOCOL_VERSION,
  portTransport,
  type RpcMessage,
  RpcPeer,
  type Transport,
} from '@design-pad/embed';
import { describeFile } from './assets';
import type { AssetAdapter, DesignPadOptions, PhotoProvider, UploadedAsset } from './config';

export interface HostConnection {
  config: EmbedInitConfig;
  peer: RpcPeer;
  mode: 'iframe' | 'native';
}

interface NativeBridgeWindow {
  webkit?: { messageHandlers?: { designPad?: { postMessage(msg: unknown): void } } };
  DesignPadAndroid?: { postMessage(msg: string): void };
  DesignPad?: { postMessage(msg: string): void };
  designPadBridge?: { receive(msg: unknown): void };
}

/** Which native WebView bridge (if any) is present. */
function nativePost(): ((json: string) => void) | null {
  const w = window as unknown as NativeBridgeWindow;
  if (w.webkit?.messageHandlers?.designPad)
    return (json) => w.webkit!.messageHandlers!.designPad!.postMessage(json);
  if (w.DesignPadAndroid) return (json) => w.DesignPadAndroid!.postMessage(json);
  if (w.DesignPad?.postMessage) return (json) => w.DesignPad!.postMessage(json);
  return null;
}

let connecting: Promise<HostConnection> | null = null;

/**
 * Wait for a host to configure this editor. Works inside an iframe (via a
 * transferred MessagePort) and inside native WebViews (JSON over the platform
 * bridge; the host calls `window.designPadBridge.receive(message)`).
 *
 * There is one handshake per page: repeated calls (React StrictMode runs
 * effects twice in development) share it instead of opening a second channel.
 */
export function connectToHost(
  opts: { allowedOrigins?: string[]; timeoutMs?: number } = {},
): Promise<HostConnection> {
  connecting ??= handshake(opts).catch((err: unknown) => {
    connecting = null;
    throw err;
  });
  return connecting;
}

function handshake(opts: {
  allowedOrigins?: string[];
  timeoutMs?: number;
}): Promise<HostConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('No host responded')),
      opts.timeoutMs ?? 30_000,
    );
    const post = nativePost();

    if (post) {
      const w = window as unknown as NativeBridgeWindow;
      const listeners = new Set<(m: RpcMessage) => void>();
      const transport: Transport = {
        send: (m) => post(JSON.stringify(m)),
        listen(handler) {
          listeners.add(handler);
          return () => listeners.delete(handler);
        },
      };
      w.designPadBridge = {
        receive(raw) {
          const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (isInit(msg)) {
            clearTimeout(timer);
            resolve({ config: msg.config, peer: new RpcPeer(transport), mode: 'native' });
            return;
          }
          for (const l of listeners) l(msg as RpcMessage);
        },
      };
      post(JSON.stringify({ type: HELLO, version: PROTOCOL_VERSION }));
      return;
    }

    if (window.parent === window) {
      clearTimeout(timer);
      reject(new Error('Not embedded: open this page inside an iframe or a WebView host.'));
      return;
    }
    const allowed = opts.allowedOrigins?.filter(Boolean) ?? [];
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || !isInit(e.data) || !e.ports[0]) return;
      if (allowed.length && !allowed.includes(e.origin)) {
        console.warn(`[design-pad] Ignoring host at ${e.origin} (not in allowed origins)`);
        return;
      }
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve({
        config: e.data.config,
        peer: new RpcPeer(portTransport(e.ports[0])),
        mode: 'iframe',
      });
    };
    window.addEventListener('message', onMessage);
    // The hello carries no data, so any parent may receive it; INIT is origin-checked above.
    window.parent.postMessage({ type: HELLO, version: PROTOCOL_VERSION }, '*');
  });
}

async function toEmbedFile(
  blob: Blob,
  name: string,
  mode: HostConnection['mode'],
): Promise<EmbedFile> {
  if (mode === 'iframe') return { name, mime: blob.type, blob };
  return { name, mime: blob.type, dataUrl: await blobToDataUrl(blob) };
}

/** Uploads stored inside the design as data URLs (used when the host stores nothing). */
export function createInlineAssetAdapter(): AssetAdapter {
  const uploads: UploadedAsset[] = [];
  return {
    async upload(file) {
      const src = await blobToDataUrl(file);
      const asset = await describeFile(file, src);
      uploads.unshift(asset);
      return asset;
    },
    async list() {
      return [...uploads];
    },
  };
}

/**
 * Turn a host connection into DesignPad options: storage, photos, header
 * actions and callbacks are routed to the host; the host's requests are
 * served from the editor engine once it is ready.
 */
export function bridgeOptions(
  conn: HostConnection,
  setTheme: (t: 'light' | 'dark') => void,
): DesignPadOptions {
  const { config, peer, mode } = conn;
  const caps = config.capabilities;

  const assets: AssetAdapter = caps.uploadAsset
    ? {
        upload: async (file) =>
          peer.request<EmbedAsset>('uploadAsset', {
            file: await toEmbedFile(file, file.name, mode),
          }),
        list: caps.listAssets ? () => peer.request<EmbedAsset[]>('listAssets') : undefined,
        resolveUrl: caps.resolveAssetUrl
          ? (src) => peer.request<string>('resolveAssetUrl', { src })
          : undefined,
      }
    : createInlineAssetAdapter();

  const photos: PhotoProvider | undefined = caps.photos
    ? {
        name: caps.photos.name,
        search: (query, page) =>
          peer.request<{ results: EmbedPhoto[]; hasMore: boolean }>('searchPhotos', {
            query,
            page,
          }),
        onUse: (photo) => void peer.request('usePhoto', { photo }).catch(() => undefined),
      }
    : undefined;

  const asDesign = (d: DesignFile) => d as unknown as import('@design-pad/embed').DesignFileLike;

  return {
    design: config.design ? migrateDesignFile(config.design) : undefined,
    size: config.size ? { ...config.size, title: config.title } : undefined,
    theme: config.theme,
    brand: config.brand,
    features: config.features as DesignPadOptions['features'],
    assets,
    photos,
    headerActions: config.headerActions?.map((a) => ({
      label: a.label,
      variant: a.variant,
      onClick: (editor: Editor) =>
        peer.emit('action', { id: a.id, design: asDesign(editor.toJSON()) }),
    })),
    onChange: config.emitChanges
      ? (design) => peer.emit('change', { design: asDesign(design) })
      : undefined,
    onSave: (design) => peer.emit('save', { design: asDesign(design) }),
    onExport: config.interceptExport
      ? async (result: ExportResult) => {
          peer.emit('export', {
            file: await toEmbedFile(result.blob, result.filename, mode),
            format: result.mime,
          });
          return false;
        }
      : undefined,
    onReady: (editor) => {
      peer.handle('getDesign', () => asDesign(editor.toJSON()));
      peer.handle('loadDesign', (p) =>
        editor.load(migrateDesignFile((p as { design: unknown }).design)),
      );
      peer.handle('export', async (p) => {
        const result = await exportDesign(editor, p as Parameters<typeof exportDesign>[1]);
        return toEmbedFile(result.blob, result.filename, mode);
      });
      peer.handle('addImage', async (p) => {
        const { url, width, height, name } = p as {
          url: string;
          width?: number;
          height?: number;
          name?: string;
        };
        let size = { width: width ?? 0, height: height ?? 0 };
        if (!size.width || !size.height) {
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const i = new Image();
            i.crossOrigin = 'anonymous';
            i.onload = () => res(i);
            i.onerror = () => rej(new Error('Image failed to load'));
            i.src = url;
          });
          size = { width: img.naturalWidth, height: img.naturalHeight };
        }
        const asset = editor.addAsset({ kind: 'image', src: url, mime: 'image/*', ...size, name });
        const doc = editor.getDocument();
        const k = Math.min(
          1,
          (Math.min(doc.width, doc.height) * 0.6) / Math.max(size.width, size.height),
        );
        const w = size.width * k;
        const h = size.height * k;
        return editor.addElement({
          type: 'image',
          width: w,
          height: h,
          image: createImageFill(asset.id, size.width, size.height, w, h),
        } as never);
      });
      peer.handle('addText', (p) => {
        const { text, fontSize, fontFamily, color } = p as {
          text: string;
          fontSize?: number;
          fontFamily?: string;
          color?: string;
        };
        const el = createText({
          spans: [{ text }],
          style: {
            ...(fontSize ? { fontSize } : {}),
            ...(fontFamily ? { fontFamily } : {}),
            ...(color ? { color } : {}),
          },
        });
        return editor.addElement(
          { ...el, width: editor.text.naturalWidth(el) + 2 },
          { center: true },
        );
      });
      peer.handle('setTheme', (p) => setTheme((p as { theme: 'light' | 'dark' }).theme));
      peer.handle('undo', () => editor.undo());
      peer.handle('redo', () => editor.redo());
      peer.emit('ready', { designId: editor.designId });
    },
  };
}
