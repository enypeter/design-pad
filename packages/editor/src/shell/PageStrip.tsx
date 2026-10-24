import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PageThumb } from '../components/PageThumb';
import { useDesignPad, useEditorValue } from '../context';

/** Bottom strip of page thumbnails with drag-to-reorder. */
export function PageStrip() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const pages = useEditorValue((e) => e.getPages().map((p) => p.id));
  const current = useEditorValue((e) => e.getCurrentPageId());
  const ratio = useEditorValue((e) => e.getDocument().height / e.getDocument().width);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const width = Math.max(48, Math.min(120, 72 / ratio));

  return (
    <div className="dp-page-strip dp-scrollable" role="list" aria-label="Pages">
      {pages.map((id, i) => (
        <div
          key={id}
          role="listitem"
          className={`dp-strip-item${id === current ? ' is-current' : ''}${over === i ? ' is-over' : ''}`}
          draggable
          onDragStart={(e) => {
            setDragging(id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setOver(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging) editor.movePage(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          onClick={() => {
            editor.setCurrentPage(id);
            ctx.viewport.current?.scrollToPage(id);
          }}
        >
          <PageThumb pageId={id} width={width} className="dp-strip-thumb" />
          <span className="dp-strip-num">{i + 1}</span>
        </div>
      ))}
      <button
        type="button"
        className="dp-strip-add"
        aria-label="Add page"
        style={{ width, height: width * ratio }}
        onClick={() => {
          const page = editor.addPage({ after: pages[pages.length - 1] });
          requestAnimationFrame(() => ctx.viewport.current?.revealPage(page.id));
        }}
      >
        <Plus size={20} />
      </button>
    </div>
  );
}
