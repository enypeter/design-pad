import { exportDesign, migrateDesignFile } from '@design-pad/core';
import {
  ChevronDown,
  Cloud,
  CloudOff,
  Download,
  FileJson,
  FolderOpen,
  Home,
  Keyboard,
  LoaderCircle,
  Redo2,
  Scaling,
  Undo2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { triggerDownload } from '../actions';
import { Button, IconButton, MenuAt, type MenuEntry } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';
import { showToast } from '../state/ui';

function SaveStatus() {
  const state = useDesignPad().options.saveStatus;
  if (!state) return null;
  const map = {
    saved: { icon: <Cloud size={18} />, text: 'All changes saved' },
    saving: { icon: <LoaderCircle size={18} className="dp-spin" />, text: 'Saving…' },
    unsaved: { icon: <Cloud size={18} />, text: 'Unsaved changes' },
    error: { icon: <CloudOff size={18} />, text: 'Could not save' },
  } as const;
  const s = map[state];
  return (
    <span className={`dp-save-status is-${state}`} title={s.text} aria-live="polite">
      {s.icon}
      <span className="dp-save-text">{s.text}</span>
    </span>
  );
}

export function Header() {
  const ctx = useDesignPad();
  const { editor, ui, options, features } = ctx;
  const title = useEditorValue((e) => e.getDocument().title);
  const history = useEditorValue((e) => ({ undo: e.canUndo(), redo: e.canRedo() }));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);

  const fileMenu: MenuEntry[] = [
    ...(features.resize
      ? [
          {
            label: 'Resize design',
            icon: <Scaling size={16} />,
            onSelect: () => ui.set({ dialog: 'resize' }),
          },
        ]
      : []),
    ...(features.download
      ? [
          {
            label: 'Download',
            icon: <Download size={16} />,
            onSelect: () => ui.set({ dialog: 'download' }),
          },
        ]
      : []),
    'divider',
    {
      label: 'Save design file (.json)',
      icon: <FileJson size={16} />,
      onSelect: async () => triggerDownload(await exportDesign(editor, { format: 'json' })),
    },
    {
      label: 'Open design file…',
      icon: <FolderOpen size={16} />,
      onSelect: () => fileInput.current?.click(),
    },
    'divider',
    {
      label: 'Keyboard shortcuts',
      shortcut: '?',
      icon: <Keyboard size={16} />,
      onSelect: () => ui.set({ dialog: 'shortcuts' }),
    },
  ];

  return (
    <header className="dp-header">
      <div className="dp-header-left">
        {options.onHome && (
          <Button variant="ghost" className="dp-header-btn" onClick={() => options.onHome?.()}>
            <Home size={18} /> {options.homeLabel ?? 'Home'}
          </Button>
        )}
        <Button
          variant="ghost"
          className="dp-header-btn"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 6 });
          }}
        >
          File <ChevronDown size={16} />
        </Button>
        {features.resize && (
          <Button
            variant="ghost"
            className="dp-header-btn"
            onClick={() => ui.set({ dialog: 'resize' })}
          >
            <Scaling size={18} /> Resize
          </Button>
        )}
        <span className="dp-header-sep" />
        <IconButton
          label="Undo (Ctrl+Z)"
          className="dp-header-icon"
          disabled={!history.undo}
          onClick={() => editor.undo()}
        >
          <Undo2 size={19} />
        </IconButton>
        <IconButton
          label="Redo (Ctrl+Shift+Z)"
          className="dp-header-icon"
          disabled={!history.redo}
          onClick={() => editor.redo()}
        >
          <Redo2 size={19} />
        </IconButton>
        <SaveStatus />
      </div>
      <div className="dp-header-right">
        <input
          className="dp-title-input"
          aria-label="Design title"
          value={draft ?? title}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setDraft(title)}
          onBlur={() => {
            if (draft?.trim() && draft !== title) editor.setTitle(draft.trim());
            setDraft(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {options.headerActions ? (
          options.headerActions.map((a) => (
            <Button
              key={a.label}
              variant={a.variant === 'primary' ? 'primary' : 'secondary'}
              className="dp-header-action"
              onClick={() => a.onClick(editor)}
            >
              {a.label}
            </Button>
          ))
        ) : features.download ? (
          <Button
            variant="primary"
            className="dp-header-action"
            onClick={() => ui.set({ dialog: 'download' })}
          >
            <Download size={18} /> Download
          </Button>
        ) : null}
      </div>
      {menu && <MenuAt x={menu.x} y={menu.y} items={fileMenu} onClose={() => setMenu(null)} />}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            editor.load(migrateDesignFile(JSON.parse(await file.text())));
            showToast(ui, `Opened ${file.name}`);
          } catch (err) {
            const friendly =
              err instanceof SyntaxError
                ? `${file.name} is not a Design Pad design file (.json)`
                : err instanceof Error
                  ? err.message
                  : 'Not a design file';
            showToast(ui, friendly, 'error');
          }
        }}
      />
    </header>
  );
}
