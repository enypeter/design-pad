import { Editor } from '@design-pad/core';
import {
  type CSSProperties,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createMemoryAssetAdapter } from './assets';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DEFAULT_FEATURES, type DesignPadOptions } from './config';
import { DesignPadContext, type DesignPadContextValue } from './context';
import { EditorShell } from './shell/EditorShell';
import { useShortcuts } from './shortcuts';
import { createCameraStore, createUIStore } from './state/ui';

export interface DesignPadProps extends DesignPadOptions {
  className?: string;
  style?: CSSProperties;
}

export interface DesignPadHandle {
  editor: Editor;
}

function useDebouncedChange(editor: Editor, onChange: DesignPadOptions['onChange'], delay = 600) {
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    let timer = 0;
    const off = editor.events.on('change', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => latest.current?.(editor.toJSON(), editor), delay);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [editor, delay]);
}

/** The full Canva-style editor. Use as a React component, or via `mountDesignPad` for other stacks. */
export const DesignPad = forwardRef<DesignPadHandle, DesignPadProps>(
  function DesignPad(props, ref) {
    const { className, style, ...options } = props;
    const rootRef = useRef<HTMLDivElement>(null);

    // The engine lives for the component's lifetime unless the host supplies one.
    const [ownsEditor] = useState(() => !options.editor);
    const [editor] = useState(
      () =>
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
        }),
    );
    const [stores] = useState(() => ({
      ui: createUIStore({
        leftPanel: (options.features?.panels ?? DEFAULT_FEATURES.panels)[0] ?? null,
      }),
      camera: createCameraStore(),
      assets: options.assets ?? createMemoryAssetAdapter(),
      viewport: { current: null },
      root: rootRef,
      textEditor: { current: null },
    }));

    // Options are read through the context object; re-create only when the editor changes.
    // biome-ignore lint/correctness/useExhaustiveDependencies: options identity changes every render
    const ctx = useMemo<DesignPadContextValue>(
      () => ({
        editor,
        ...stores,
        options,
        features: { ...DEFAULT_FEATURES, ...options.features },
      }),
      [editor, stores],
    );
    // Keep callbacks fresh without re-creating the context.
    ctx.options = options;

    useImperativeHandle(ref, () => ({ editor }), [editor]);
    useShortcuts(ctx);
    useDebouncedChange(editor, options.onChange);

    // Once per engine, even when StrictMode re-runs effects in development.
    const announced = useRef<Editor | null>(null);
    const onReady = options.onReady;
    useEffect(() => {
      if (announced.current === editor) return;
      announced.current = editor;
      onReady?.(editor);
    }, [editor, onReady]);

    // Dispose engines we created on unmount. Deferred so React StrictMode's
    // simulated unmount/remount in development does not kill a live engine.
    const disposeTimer = useRef(0);
    useEffect(() => {
      if (!ownsEditor) return;
      window.clearTimeout(disposeTimer.current);
      return () => {
        disposeTimer.current = window.setTimeout(() => editor.dispose(), 0);
      };
    }, [editor, ownsEditor]);

    return (
      <DesignPadContext.Provider value={ctx}>
        <div
          ref={rootRef}
          className={`dp-root${options.theme === 'dark' ? ' dp-theme-dark' : ''}${className ? ` ${className}` : ''}`}
          style={style}
        >
          <ErrorBoundary
            onError={(error) =>
              ctx.options.onError ? ctx.options.onError(error) : console.error(error)
            }
            fallback={(reset) => (
              <div className="dp-crashed" role="alert">
                <p>The editor hit an unexpected problem. Your design is still in memory.</p>
                <button type="button" className="dp-btn dp-btn-primary" onClick={reset}>
                  Reload editor
                </button>
              </div>
            )}
          >
            <EditorShell />
          </ErrorBoundary>
          <div className="dp-portal" />
        </div>
      </DesignPadContext.Provider>
    );
  },
);
