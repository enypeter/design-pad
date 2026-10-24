import { createImageFill } from '@design-pad/core';
import {
  AlignCenterHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Group,
  ImageUp,
  Lock,
  LockOpen,
  Paintbrush,
  Scissors,
  Trash2,
  Ungroup,
} from 'lucide-react';
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  hasInternalClipboard,
  pasteInternal,
  toggleLock,
} from '../actions';
import { MenuAt, type MenuEntry } from '../components/ui';
import { useDesignPad, useUI } from '../context';
import { mod } from '../platform';

/** Remembered style for "Copy style / Paste style". */
const styleClipboard: { current: Record<string, unknown> | null } = { current: null };

export function ContextMenu() {
  const ctx = useDesignPad();
  const { editor, ui } = ctx;
  const menu = useUI((s) => s.contextMenu);
  if (!menu) return null;
  const sel = editor.getSelectedElements();
  const ids = sel.map((e) => e.id);
  const one = sel.length === 1 ? sel[0]! : null;
  const locked = sel.length > 0 && sel.every((e) => e.locked);
  const close = () => ui.set({ contextMenu: null });
  const pastePoint = ctx.viewport.current?.clientToPage(menu.x, menu.y);

  const items: MenuEntry[] = [];
  if (sel.length) {
    items.push(
      {
        label: 'Copy',
        shortcut: `${mod}+C`,
        icon: <Copy size={16} />,
        onSelect: () => copySelection(ctx),
      },
      {
        label: 'Cut',
        shortcut: `${mod}+X`,
        icon: <Scissors size={16} />,
        disabled: locked,
        onSelect: () => copySelection(ctx, true),
      },
    );
  }
  items.push({
    label: 'Paste',
    shortcut: `${mod}+V`,
    icon: <ClipboardPaste size={16} />,
    disabled: !hasInternalClipboard(),
    onSelect: () => pasteInternal(ctx, pastePoint?.inside ? pastePoint : undefined),
  });
  if (sel.length) {
    items.push(
      {
        label: 'Duplicate',
        shortcut: `${mod}+D`,
        icon: <CopyPlus size={16} />,
        disabled: locked,
        onSelect: () => duplicateSelection(ctx),
      },
      {
        label: 'Delete',
        shortcut: 'Del',
        icon: <Trash2 size={16} />,
        disabled: locked,
        danger: true,
        onSelect: () => deleteSelection(ctx),
      },
      'divider',
    );
    if (one) {
      items.push(
        {
          label: 'Copy style',
          icon: <Paintbrush size={16} />,
          onSelect: () => {
            const {
              id: _i,
              x: _x,
              y: _y,
              width: _w,
              height: _h,
              parentId: _p,
              index: _ix,
              rotation: _r,
              typeName: _t,
              ...style
            } = one as unknown as Record<string, unknown>;
            if (one.type === 'text') delete style.spans;
            if (one.type === 'image') delete style.image;
            styleClipboard.current = { ...style, type: one.type };
          },
        },
        {
          label: 'Paste style',
          icon: <Paintbrush size={16} />,
          disabled: !styleClipboard.current || styleClipboard.current.type !== one.type,
          onSelect: () => {
            const { type: _type, ...style } = styleClipboard.current ?? {};
            editor.updateElement(one.id, style);
          },
        },
        'divider',
      );
    }
    items.push(
      {
        label: 'Bring to front',
        shortcut: `${mod}+Alt+]`,
        icon: <ArrowUpToLine size={16} />,
        onSelect: () => editor.reorderElements(ids, 'front'),
      },
      {
        label: 'Bring forward',
        shortcut: `${mod}+]`,
        icon: <ArrowUpToLine size={16} />,
        onSelect: () => editor.reorderElements(ids, 'forward'),
      },
      {
        label: 'Send backward',
        shortcut: `${mod}+[`,
        icon: <ArrowDownToLine size={16} />,
        onSelect: () => editor.reorderElements(ids, 'backward'),
      },
      {
        label: 'Send to back',
        shortcut: `${mod}+Alt+[`,
        icon: <ArrowDownToLine size={16} />,
        onSelect: () => editor.reorderElements(ids, 'back'),
      },
      'divider',
      {
        label: 'Align to page',
        icon: <AlignCenterHorizontal size={16} />,
        onSelect: () => ui.set({ contextPanel: 'position' }),
      },
    );
    if (sel.length > 1)
      items.push({
        label: 'Group',
        shortcut: `${mod}+G`,
        icon: <Group size={16} />,
        onSelect: () => editor.groupElements(ids),
      });
    if (one?.type === 'group') {
      items.push({
        label: 'Ungroup',
        shortcut: `${mod}+Shift+G`,
        icon: <Ungroup size={16} />,
        onSelect: () => editor.ungroupElements(one.id),
      });
    }
    if (one?.type === 'image') {
      items.push({
        label: 'Set image as background',
        icon: <ImageUp size={16} />,
        onSelect: () => {
          const pageId = editor.getPageIdOf(one.id);
          const asset = editor.getAsset(one.image.assetId);
          if (!pageId || !asset) return;
          const doc = editor.getDocument();
          editor.batch(() => {
            editor.setPageBackground(pageId, {
              image: {
                ...createImageFill(asset.id, asset.width, asset.height, doc.width, doc.height),
                adjustments: one.image.adjustments,
                filter: one.image.filter,
              },
            });
            editor.deleteElements([one.id]);
          });
        },
      });
    }
    items.push({
      label: locked ? 'Unlock' : 'Lock',
      shortcut: 'Shift+Alt+L',
      icon: locked ? <LockOpen size={16} /> : <Lock size={16} />,
      onSelect: () => toggleLock(ctx),
    });
  } else {
    const page = editor.getCurrentPage();
    if (page.background.image) {
      items.push('divider', {
        label: 'Remove background image',
        icon: <Trash2 size={16} />,
        onSelect: () => editor.setPageBackground(page.id, { image: null }),
      });
      items.push({
        label: 'Detach image from background',
        icon: <ImageUp size={16} />,
        onSelect: () => {
          const bg = page.background.image!;
          const asset = editor.getAsset(bg.assetId);
          if (!asset) return;
          const doc = editor.getDocument();
          editor.batch(() => {
            editor.setPageBackground(page.id, { image: null });
            editor.createElements([
              {
                type: 'image',
                x: 0,
                y: 0,
                width: doc.width,
                height: doc.height,
                image: {
                  ...createImageFill(asset.id, asset.width, asset.height, doc.width, doc.height),
                  adjustments: bg.adjustments,
                  filter: bg.filter,
                },
              } as never,
            ]);
          });
        },
      });
    }
  }
  return <MenuAt x={menu.x} y={menu.y} items={items} onClose={close} />;
}
