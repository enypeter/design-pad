import {
  type ButtonHTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useDesignPad } from '../context';

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  block?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  active,
  block,
  className,
  type = 'button',
  ...rest
}: BtnProps) {
  return (
    <button
      type={type}
      className={cx(
        'dp-btn',
        `dp-btn-${variant}`,
        `dp-btn-${size}`,
        active && 'is-active',
        block && 'is-block',
        className,
      )}
      {...rest}
    />
  );
}

type IconBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
};

export function IconButton({
  label,
  active,
  size = 'md',
  className,
  type = 'button',
  children,
  ...rest
}: IconBtnProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx('dp-icon-btn', size === 'sm' && 'sm', active && 'is-active', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Divider({ vertical }: { vertical?: boolean }) {
  return <span className={cx('dp-divider', vertical && 'is-vertical')} aria-hidden="true" />;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Fired continuously while dragging. */
  onChange(value: number): void;
  /** Bracket a drag into one undo step. */
  onStart?(): void;
  onEnd?(): void;
  suffix?: string;
}

/** Labelled range slider with a numeric field, like Canva's adjustment sliders. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onStart,
  onEnd,
  suffix,
}: SliderProps) {
  // Two-sided ranges (e.g. -100..100) fill from the centre.
  const bipolar = min < 0 && max > 0;
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const pct = ((value - min) / (max - min)) * 100;
  const shown = Number.isInteger(step) ? Math.round(value) : Math.round(value * 100) / 100;
  return (
    <div className="dp-slider">
      <div className="dp-slider-head">
        <label htmlFor={id}>{label}</label>
        <input
          className="dp-slider-num"
          aria-label={`${label} value`}
          value={draft ?? `${shown}${suffix ?? ''}`}
          onFocus={() => setDraft(String(shown))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const v = Number.parseFloat(draft ?? '');
            if (!Number.isNaN(v)) {
              onStart?.();
              onChange(clamp(v));
              onEnd?.();
            }
            setDraft(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </div>
      <input
        id={id}
        type="range"
        className="dp-range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={
          (bipolar
            ? { '--dp-from': `${Math.min(pct, 50)}%`, '--dp-pct': `${Math.max(pct, 50)}%` }
            : { '--dp-pct': `${pct}%` }) as unknown as React.CSSProperties
        }
        onPointerDown={() => onStart?.()}
        onPointerUp={() => onEnd?.()}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange(v: boolean): void;
  label: string;
}) {
  return (
    <label className="dp-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="dp-toggle-track" aria-hidden="true" />
    </label>
  );
}

export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: NoInfer<T>; label: string }[];
  onChange(v: NoInfer<T>): void;
}) {
  return (
    <div className="dp-tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={cx('dp-tab', value === o.id && 'is-active')}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange(v: string): void;
  placeholder: string;
}) {
  return (
    <div className="dp-search">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {value && (
        <button
          type="button"
          className="dp-search-clear"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Render into the editor root so menus work inside Shadow DOM and inherit theme variables. */
export function Portal({ children }: { children: ReactNode }) {
  const { root } = useDesignPad();
  const target = root.current?.querySelector('.dp-portal') ?? root.current;
  return target ? createPortal(children, target) : null;
}

function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: React.RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const path = e.composedPath();
      if (refs.some((r) => r.current && path.includes(r.current))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose, refs]);
}

/** Positioned layer anchored below (or above) an element. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  placement = 'bottom-start',
  className,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose(): void;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'bottom' | 'top-start';
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { root } = useDesignPad();
  const refs = useRef([ref, anchor]).current;
  useDismiss(open, onClose, refs);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const r = root.current?.getBoundingClientRect();
    const pop = ref.current?.getBoundingClientRect();
    if (!a || !r || !pop) return;
    let left =
      placement === 'bottom-end'
        ? a.right - pop.width
        : placement === 'bottom'
          ? a.left + a.width / 2 - pop.width / 2
          : a.left;
    let top = placement === 'top-start' ? a.top - pop.height - 8 : a.bottom + 8;
    if (top + pop.height > r.bottom - 8) top = Math.max(r.top + 8, a.top - pop.height - 8);
    left = Math.min(Math.max(r.left + 8, left), r.right - pop.width - 8);
    setPos({ left: left - r.left, top: top - r.top });
  }, [anchor, placement, root]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  if (!open) return null;
  return (
    <Portal>
      <div
        ref={ref}
        className={cx('dp-popover', className)}
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
        data-chrome
      >
        {children}
      </div>
    </Portal>
  );
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect(): void;
}

export type MenuEntry = MenuItem | 'divider';

/** Context-menu style list at a client position. */
export function MenuAt({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { root } = useDesignPad();
  const refs = useRef([ref]).current;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useDismiss(true, onClose, refs);
  useLayoutEffect(() => {
    const r = root.current?.getBoundingClientRect();
    const m = ref.current?.getBoundingClientRect();
    if (!r || !m) return;
    const left = Math.min(x, r.right - m.width - 8) - r.left;
    const top = Math.min(y, r.bottom - m.height - 8) - r.top;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y, root]);
  return (
    <Portal>
      <div
        ref={ref}
        className="dp-menu"
        role="menu"
        data-chrome
        style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) =>
          item === 'divider' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: dividers have no identity
            <div key={`d-${i}`} className="dp-menu-divider" role="separator" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={cx('dp-menu-item', item.danger && 'is-danger')}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              <span className="dp-menu-icon">{item.icon}</span>
              <span className="dp-menu-label">{item.label}</span>
              {item.shortcut && <span className="dp-menu-shortcut">{item.shortcut}</span>}
            </button>
          ),
        )}
      </div>
    </Portal>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 420,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <Portal>
      <div
        className="dp-modal-backdrop"
        data-chrome
        onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          ref={ref}
          className="dp-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          style={{ width }}
        >
          <div className="dp-modal-head">
            <h2>{title}</h2>
            <button type="button" className="dp-icon-btn" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="dp-modal-body">{children}</div>
        </div>
      </div>
    </Portal>
  );
}

export function Swatch({
  color,
  selected,
  onClick,
  label,
  size = 32,
}: {
  color: string;
  selected?: boolean;
  onClick(): void;
  label?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      className={cx('dp-swatch', selected && 'is-selected')}
      style={{ background: color, width: size, height: size }}
      aria-label={label ?? color}
      title={label ?? color}
      onClick={onClick}
    />
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="dp-section">
      <div className="dp-section-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="dp-empty">{children}</div>;
}
