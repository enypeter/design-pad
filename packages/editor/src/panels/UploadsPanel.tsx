import { CloudUpload, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { insertAsset, uploadAndInsert } from '../actions';
import { IMAGE_MIME } from '../assets';
import { setDragItem } from '../canvas/dnd';
import { Button, EmptyState } from '../components/ui';
import type { UploadedAsset } from '../config';
import { useDesignPad } from '../context';
import { PanelHeader } from '../shell/SidePanel';

function UploadThumb({ asset, onRemove }: { asset: UploadedAsset; onRemove?: () => void }) {
  const ctx = useDesignPad();
  const [src, setSrc] = useState<string | null>(asset.thumbUrl ?? null);
  useEffect(() => {
    if (asset.thumbUrl) return;
    let alive = true;
    void Promise.resolve(ctx.assets.resolveUrl ? ctx.assets.resolveUrl(asset.src) : asset.src).then(
      (u) => alive && setSrc(u),
    );
    return () => {
      alive = false;
    };
  }, [asset, ctx.assets]);
  return (
    <div className="dp-upload-item">
      <button
        type="button"
        className="dp-upload-thumb"
        title={asset.name ?? 'Upload'}
        draggable
        onDragStart={(e) => setDragItem(e, { kind: 'asset', asset })}
        onClick={() => insertAsset(ctx, asset)}
        style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
      >
        {src && <img src={src} alt={asset.name ?? ''} draggable={false} loading="lazy" />}
      </button>
      {onRemove && (
        <button
          type="button"
          className="dp-upload-remove"
          aria-label="Delete upload"
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export function UploadsPanel() {
  const ctx = useDesignPad();
  const { assets } = ctx;
  const [items, setItems] = useState<UploadedAsset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setItems(assets.list ? await assets.list() : []);
  }, [assets]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = async (files: File[]) => {
    setBusy(true);
    try {
      await uploadAndInsert(ctx, files, { insert: false });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dp-panel">
      <PanelHeader title="Uploads" />
      <div className="dp-panel-pad">
        <Button
          variant="primary"
          block
          size="lg"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <CloudUpload size={18} /> {busy ? 'Uploading…' : 'Upload files'}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            // Like Canva, uploads land in the grid; the user picks what goes on the page.
            if (files.length) void upload(files);
          }}
        />
      </div>
      <div
        className={`dp-panel-scroll dp-scrollable dp-dropzone${dragOver ? ' is-over' : ''}`}
        onDragOver={(e) => {
          if (![...e.dataTransfer.types].includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = [...e.dataTransfer.files].filter((f) => IMAGE_MIME.test(f.type));
          if (files.length) void upload(files);
        }}
      >
        {items && !items.length && (
          <EmptyState>
            Upload photos and graphics to use them in your design. You can also drag files straight
            onto the canvas.
          </EmptyState>
        )}
        <div className="dp-upload-grid">
          {items?.map((a) => (
            <UploadThumb
              key={a.id ?? a.src}
              asset={a}
              onRemove={
                assets.remove
                  ? async () => {
                      await assets.remove?.(a);
                      await refresh();
                    }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
