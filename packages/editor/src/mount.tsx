import { Editor } from '@design-pad/core';
import { createRoot, type Root } from 'react-dom/client';
import type { DesignPadOptions } from './config';
import { DesignPad } from './DesignPad';
import editorCss from './styles/editor.css?inline';

export interface MountOptions extends DesignPadOptions {
  /**
   * Render inside a Shadow DOM so host page styles cannot leak in. Off by
   * default; turn on when embedding into pages with aggressive global CSS.
   */
  isolate?: boolean;
  className?: string;
}

export interface MountedDesignPad {
  editor: Editor;
  /** Update callbacks/options (the design itself is driven through `editor`). */
  update(options: Partial<DesignPadOptions>): void;
  /** Unmount the UI. The engine is disposed unless you passed your own. */
  unmount(): void;
}

let globalCssInjected = false;

function injectGlobalCss(): void {
  if (globalCssInjected || typeof document === 'undefined') return;
  if (document.querySelector('style[data-design-pad]')) {
    globalCssInjected = true;
    return;
  }
  const style = document.createElement('style');
  style.dataset.designPad = '';
  style.textContent = editorCss;
  document.head.appendChild(style);
  globalCssInjected = true;
}

/**
 * Mount the editor into any DOM node (no React needed in the host).
 *
 * ```js
 * const pad = mountDesignPad(document.getElementById('editor'), {
 *   size: { width: 1080, height: 1080 },
 *   onSave: (design) => api.save(design),
 * });
 * pad.editor.addElement({ type: 'text', spans: [{ text: 'Hello' }] });
 * ```
 */
export function mountDesignPad(
  container: HTMLElement,
  options: MountOptions = {},
): MountedDesignPad {
  const ownsEditor = !options.editor;
  const editor =
    options.editor ??
    new Editor({
      design: options.design,
      width: options.size?.width,
      height: options.size?.height,
      unit: options.size?.unit,
      dpi: options.size?.dpi,
      title: options.size?.title,
      fontCatalog: options.fonts,
      resolveAssetUrl: options.assets?.resolveUrl
        ? (asset) => options.assets!.resolveUrl!(asset.src)
        : undefined,
    });

  let mountPoint: HTMLElement;
  if (options.isolate && container.attachShadow) {
    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = editorCss;
    mountPoint = document.createElement('div');
    mountPoint.style.cssText = 'width:100%;height:100%;';
    shadow.replaceChildren(style, mountPoint);
  } else {
    injectGlobalCss();
    mountPoint = container;
  }

  let current: DesignPadOptions = { ...options, editor };
  const root: Root = createRoot(mountPoint);
  const render = () =>
    root.render(
      <DesignPad
        {...current}
        className={options.className}
        style={{ width: '100%', height: '100%' }}
      />,
    );
  render();

  return {
    editor,
    update(next) {
      current = { ...current, ...next, editor };
      render();
    },
    unmount() {
      root.unmount();
      if (ownsEditor) editor.dispose();
    },
  };
}
