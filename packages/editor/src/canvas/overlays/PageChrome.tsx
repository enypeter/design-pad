import { ChevronDown, ChevronUp, Copy, FilePlus, Plus, Trash2 } from 'lucide-react';
import { useCamera, useDesignPad, useEditorValue } from '../../context';
import { addPageButtonRect, pageLayout, visiblePages } from '../camera';

function PageTitle({ pageId, index, title }: { pageId: string; index: number; title: string }) {
  const { editor } = useDesignPad();
  return (
    <div className="dp-page-title">
      <span className="dp-page-number">Page {index + 1}</span>
      <span className="dp-page-sep">-</span>
      <input
        className="dp-page-title-input"
        value={title}
        placeholder="Add page title"
        aria-label={`Page ${index + 1} title`}
        onChange={(e) => editor.updatePage(pageId, { title: e.target.value })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

/** Page headers and the "Add page" button, positioned over the canvas. */
export function PageChrome() {
  const ctx = useDesignPad();
  const { editor, features } = ctx;
  const cam = useCamera((c) => c);
  const pages = useEditorValue((e) => e.getPages());
  const doc = useEditorValue((e) => {
    const d = e.getDocument();
    return { width: d.width, height: d.height };
  });
  const current = useEditorValue((e) => e.getCurrentPageId());
  const multi = features.multiPage;
  const visible = visiblePages(cam, doc, pages.length, 80);

  return (
    <div className="dp-page-chrome" data-chrome>
      {visible.map((i) => {
        const page = pages[i]!;
        const { header } = pageLayout(cam, doc, pages.length, i);
        const narrow = header.width < 300;
        return (
          <div
            key={page.id}
            className={`dp-page-header${page.id === current ? ' is-current' : ''}`}
            style={{ transform: `translate(${header.x}px, ${header.y}px)`, width: header.width }}
          >
            {!narrow && <PageTitle pageId={page.id} index={i} title={page.title} />}
            {narrow && <span className="dp-page-number">{i + 1}</span>}
            {multi && (
              <div className="dp-page-actions">
                <button
                  type="button"
                  className="dp-icon-btn sm"
                  title="Move page up"
                  disabled={i === 0}
                  onClick={() => editor.movePage(page.id, i - 1)}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="dp-icon-btn sm"
                  title="Move page down"
                  disabled={i === pages.length - 1}
                  onClick={() => editor.movePage(page.id, i + 1)}
                >
                  <ChevronDown size={16} />
                </button>
                <button
                  type="button"
                  className="dp-icon-btn sm"
                  title="Duplicate page"
                  onClick={() => editor.duplicatePage(page.id)}
                >
                  <Copy size={15} />
                </button>
                <button
                  type="button"
                  className="dp-icon-btn sm"
                  title={pages.length > 1 ? 'Delete page' : 'Clear page'}
                  onClick={() => editor.deletePage(page.id)}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  className="dp-icon-btn sm"
                  title="Add page"
                  onClick={() => editor.addPage({ after: page.id })}
                >
                  <FilePlus size={15} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {multi &&
        pages.length > 0 &&
        (() => {
          const r = addPageButtonRect(cam, doc, pages.length);
          if (r.y > cam.viewportH || r.y + r.height < 0) return null;
          return (
            <button
              type="button"
              className="dp-add-page"
              style={{
                transform: `translate(${r.x}px, ${r.y}px)`,
                width: r.width,
                height: r.height,
              }}
              onClick={() => {
                const page = editor.addPage({ after: pages[pages.length - 1]!.id });
                requestAnimationFrame(() => ctx.viewport.current?.revealPage(page.id));
              }}
            >
              <Plus size={18} /> Add page
            </button>
          );
        })()}
    </div>
  );
}
