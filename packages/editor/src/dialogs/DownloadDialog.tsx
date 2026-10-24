import type { ExportOptions } from '@design-pad/core';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { downloadDesign } from '../actions';
import { Button, Modal, Slider, Toggle } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';

type FileType = 'png' | 'jpeg' | 'pdf-standard' | 'pdf-print' | 'webp' | 'json';

const TYPES: { id: FileType; label: string; hint: string }[] = [
  { id: 'png', label: 'PNG', hint: 'Best for complex images and illustrations' },
  { id: 'jpeg', label: 'JPG', hint: 'Small file size, best for sharing' },
  { id: 'pdf-standard', label: 'PDF Standard', hint: 'Small file, good for screens and documents' },
  { id: 'pdf-print', label: 'PDF Print', hint: '300 DPI, best for printing' },
  { id: 'webp', label: 'WebP', hint: 'Modern format, small and sharp' },
  { id: 'json', label: 'Design file', hint: 'Re-open and edit later (.json)' },
];

export function DownloadDialog({ onClose }: { onClose(): void }) {
  const ctx = useDesignPad();
  const doc = useEditorValue((e) => e.getDocument());
  const pages = useEditorValue((e) => e.getPages().map((p) => p.id));
  const current = useEditorValue((e) => e.getCurrentPageId());
  const [type, setType] = useState<FileType>('png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(90);
  const [transparent, setTransparent] = useState(false);
  const [range, setRange] = useState<'all' | 'current'>('all');
  const [busy, setBusy] = useState(false);
  const raster = type === 'png' || type === 'jpeg' || type === 'webp';
  const pageIds = range === 'all' ? pages : [current];

  const run = async () => {
    setBusy(true);
    let options: ExportOptions;
    switch (type) {
      case 'pdf-standard':
        options = { format: 'pdf', pageIds, dpi: 150, quality: 0.85 };
        break;
      case 'pdf-print':
        options = { format: 'pdf', pageIds, dpi: 300, quality: 0.95 };
        break;
      case 'json':
        options = { format: 'json' };
        break;
      default:
        options = {
          format: type,
          pageIds,
          scale,
          quality: quality / 100,
          transparent: type === 'png' && transparent,
        };
    }
    const result = await downloadDesign(ctx, options);
    setBusy(false);
    if (result) onClose();
  };

  const w = Math.round(doc.width * scale);
  const h = Math.round(doc.height * scale);

  return (
    <Modal title="Download" onClose={onClose}>
      <div className="dp-form">
        <span className="dp-field-label" id="dp-file-type">
          File type
        </span>
        <div className="dp-file-types" role="radiogroup" aria-labelledby="dp-file-type">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={type === t.id}
              className={`dp-file-type${type === t.id ? ' is-active' : ''}`}
              onClick={() => setType(t.id)}
            >
              <strong>{t.label}</strong>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>
        {raster && (
          <>
            <Slider
              label="Size"
              min={0.25}
              max={3}
              step={0.25}
              value={scale}
              onChange={setScale}
              suffix="×"
            />
            <p className="dp-hint">
              {w} × {h} px
            </p>
          </>
        )}
        {(type === 'jpeg' || type === 'webp') && (
          <Slider label="Quality" min={10} max={100} value={quality} onChange={setQuality} />
        )}
        {type === 'png' && (
          <Toggle label="Transparent background" checked={transparent} onChange={setTransparent} />
        )}
        {type !== 'json' && pages.length > 1 && (
          <div className="dp-segment" role="radiogroup" aria-label="Pages">
            <button
              type="button"
              role="radio"
              aria-checked={range === 'all'}
              className={range === 'all' ? 'is-active' : ''}
              onClick={() => setRange('all')}
            >
              All pages ({pages.length})
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={range === 'current'}
              className={range === 'current' ? 'is-active' : ''}
              onClick={() => setRange('current')}
            >
              Current page
            </button>
          </div>
        )}
        {raster && pageIds.length > 1 && (
          <p className="dp-hint">Multiple pages download as a .zip file.</p>
        )}
        <Button variant="primary" size="lg" block disabled={busy} onClick={run}>
          <Download size={18} /> {busy ? 'Preparing…' : 'Download'}
        </Button>
      </div>
    </Modal>
  );
}
