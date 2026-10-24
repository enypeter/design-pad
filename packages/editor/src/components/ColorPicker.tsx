import { Pipette } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { normalizeHex } from '../library/colors';

interface HSV {
  h: number;
  s: number;
  v: number;
}

export function hexToHsv(hex: string): HSV {
  const n = normalizeHex(hex) ?? '#000000';
  const r = Number.parseInt(n.slice(1, 3), 16) / 255;
  const g = Number.parseInt(n.slice(3, 5), 16) / 255;
  const b = Number.parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function useDrag(onMove: (x: number, y: number) => void, onEnd?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onMove(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    );
  };
  return {
    ref,
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      handle(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) handle(e);
    },
    onPointerUp: () => onEnd?.(),
  };
}

/** Saturation/value square, hue slider, hex field and eyedropper. */
export function ColorPicker({
  value,
  onChange,
  onStart,
  onEnd,
}: {
  value: string;
  onChange(hex: string): void;
  onStart?(): void;
  onEnd?(): void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const last = useRef(value);

  useEffect(() => {
    if (normalizeHex(value) !== normalizeHex(last.current)) {
      setHsv(hexToHsv(value));
      last.current = value;
    }
  }, [value]);

  const emit = (next: HSV) => {
    setHsv(next);
    const hex = hsvToHex(next);
    last.current = hex;
    onChange(hex);
  };

  const sv = useDrag((x, y) => emit({ ...hsv, s: x, v: 1 - y }), onEnd);
  const hue = useDrag((x) => emit({ ...hsv, h: Math.min(359.9, x * 360) }), onEnd);

  // Arrow keys move the thumbs (Shift for bigger steps); each press is one undo step.
  const nudge = (e: React.KeyboardEvent, next: (step: number) => HSV | null) => {
    const value = next(e.shiftKey ? 10 : 1);
    if (!value) return;
    e.preventDefault();
    e.stopPropagation();
    onStart?.();
    emit(value);
    onEnd?.();
  };
  const unit = (n: number) => Math.min(1, Math.max(0, n));
  const eyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  return (
    <div className="dp-colorpicker">
      <div
        {...sv}
        onPointerDown={(e) => {
          onStart?.();
          sv.onPointerDown(e);
        }}
        className="dp-cp-sv"
        style={{ background: `hsl(${hsv.h}, 100%, 50%)` }}
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onKeyDown={(e) =>
          nudge(e, (step) => {
            const d = step / 100;
            if (e.key === 'ArrowLeft') return { ...hsv, s: unit(hsv.s - d) };
            if (e.key === 'ArrowRight') return { ...hsv, s: unit(hsv.s + d) };
            if (e.key === 'ArrowUp') return { ...hsv, v: unit(hsv.v + d) };
            if (e.key === 'ArrowDown') return { ...hsv, v: unit(hsv.v - d) };
            return null;
          })
        }
      >
        <div className="dp-cp-sv-white" />
        <div className="dp-cp-sv-black" />
        <span
          className="dp-cp-thumb"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hsvToHex(hsv),
          }}
        />
      </div>
      <div
        {...hue}
        onPointerDown={(e) => {
          onStart?.();
          hue.onPointerDown(e);
        }}
        className="dp-cp-hue"
        role="slider"
        tabIndex={0}
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={(e) =>
          nudge(e, (step) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
              return { ...hsv, h: Math.max(0, hsv.h - step) };
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
              return { ...hsv, h: Math.min(359.9, hsv.h + step) };
            return null;
          })
        }
      >
        <span
          className="dp-cp-thumb"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            top: '50%',
            background: `hsl(${hsv.h}, 100%, 50%)`,
          }}
        />
      </div>
      <div className="dp-cp-row">
        <span className="dp-cp-preview" style={{ background: hsvToHex(hsv) }} />
        <input
          className="dp-input dp-cp-hex"
          aria-label="Hex colour"
          value={hexDraft ?? hsvToHex(hsv)}
          onChange={(e) => setHexDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          onBlur={() => {
            const hex = hexDraft ? normalizeHex(hexDraft) : null;
            if (hex) {
              onStart?.();
              emit(hexToHsv(hex));
              onEnd?.();
            }
            setHexDraft(null);
          }}
        />
        {eyeDropper && (
          <button
            type="button"
            className="dp-icon-btn"
            aria-label="Pick a colour from the screen"
            title="Eyedropper"
            onClick={async () => {
              try {
                const ed = new (
                  window as unknown as {
                    EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> };
                  }
                ).EyeDropper();
                const res = await ed.open();
                const hex = normalizeHex(res.sRGBHex);
                if (hex) {
                  onStart?.();
                  emit(hexToHsv(hex));
                  onEnd?.();
                }
              } catch {
                // Cancelled.
              }
            }}
          >
            <Pipette size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
