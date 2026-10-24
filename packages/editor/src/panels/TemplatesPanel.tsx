import {
  Editor,
  type FontManager,
  preparePages,
  renderPageToCanvas,
  type TextMeasurer,
} from '@design-pad/core';
import { useEffect, useMemo, useState } from 'react';
import { applyTemplate } from '../actions';
import { EmptyState, SearchInput, Tabs } from '../components/ui';
import type { TemplateSummary } from '../config';
import { useDesignPad, useEditorValue } from '../context';
import { builtinTemplateProvider } from '../library/templates';
import { PanelHeader } from '../shell/SidePanel';
import { showToast } from '../state/ui';

const thumbCache = new Map<string, Promise<string>>();

/** Render a template's first page to a data URL (cached). */
function templateThumbnail(
  id: string,
  load: () => Promise<import('@design-pad/core').DesignFile>,
  fonts: FontManager,
  measurer: TextMeasurer,
): Promise<string> {
  let p = thumbCache.get(id);
  if (p) return p;
  p = (async () => {
    const design = await load();
    const editor = new Editor({ design, fonts, measurer });
    try {
      const pageId = editor.getPages()[0]!.id;
      await preparePages(editor, [pageId]);
      editor.text.invalidate();
      const scale = 360 / Math.max(design.width, design.height);
      const { canvas } = renderPageToCanvas(editor, pageId, { scale });
      if ('convertToBlob' in canvas) {
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return URL.createObjectURL(blob);
      }
      return (canvas as HTMLCanvasElement).toDataURL('image/png');
    } finally {
      editor.dispose();
    }
  })();
  thumbCache.set(id, p);
  return p;
}

function TemplateCard({ t, onPick }: { t: TemplateSummary; onPick(): void }) {
  const { editor, options } = useDesignPad();
  const provider = options.templates ?? builtinTemplateProvider;
  const [src, setSrc] = useState<string | undefined>(t.thumbnail);
  useEffect(() => {
    if (t.thumbnail) return;
    let alive = true;
    void templateThumbnail(
      `${t.id}`,
      () => provider.load(t.id),
      editor.fonts,
      editor.text.measurer,
    ).then((url) => {
      if (alive) setSrc(url);
    });
    return () => {
      alive = false;
    };
  }, [t, provider, editor]);
  return (
    <button type="button" className="dp-template-card" onClick={onPick} title={t.title}>
      <span className="dp-template-thumb" style={{ aspectRatio: `${t.width} / ${t.height}` }}>
        {src ? <img src={src} alt="" draggable={false} /> : <span className="dp-skeleton" />}
      </span>
      <span className="dp-template-title">{t.title}</span>
    </button>
  );
}

export function TemplatesPanel() {
  const ctx = useDesignPad();
  const { options, editor, ui } = ctx;
  const provider = options.templates ?? builtinTemplateProvider;
  const [all, setAll] = useState<TemplateSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'match' | 'all'>('all');
  const size = useEditorValue((e) => ({ w: e.getDocument().width, h: e.getDocument().height }));

  useEffect(() => {
    let alive = true;
    void provider
      .list()
      .then((list) => alive && setAll(list))
      .catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, [provider]);

  const list = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    const ratio = size.w / size.h;
    return all
      .filter((t) => scope === 'all' || Math.abs(t.width / t.height - ratio) < 0.02)
      .filter(
        (t) =>
          !q ||
          `${t.title} ${t.category ?? ''} ${(t.tags ?? []).join(' ')}`.toLowerCase().includes(q),
      )
      .sort((a, b) => Math.abs(a.width / a.height - ratio) - Math.abs(b.width / b.height - ratio));
  }, [all, query, scope, size]);

  return (
    <div className="dp-panel">
      <PanelHeader title="Templates" />
      <div className="dp-panel-pad">
        <SearchInput value={query} onChange={setQuery} placeholder="Search templates" />
        <Tabs
          value={scope}
          onChange={setScope}
          options={[
            { id: 'all', label: 'All' },
            { id: 'match', label: 'This size' },
          ]}
        />
      </div>
      <div className="dp-panel-scroll dp-scrollable">
        {all && !list.length && <EmptyState>No templates match.</EmptyState>}
        <div className="dp-template-grid">
          {list.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onPick={async () => {
                try {
                  applyTemplate(ctx, await provider.load(t.id));
                  ctx.viewport.current?.revealPage(editor.getCurrentPageId());
                } catch (err) {
                  showToast(
                    ui,
                    err instanceof Error ? err.message : 'Could not load template',
                    'error',
                  );
                }
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
