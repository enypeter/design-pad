import { type Editor, type Id, renderPage } from '@design-pad/core';
import { useEffect, useRef } from 'react';
import { useEditor } from '../context';

/** Draw a page into a canvas at a given CSS width. */
export function drawThumb(
  canvas: HTMLCanvasElement,
  editor: Editor,
  pageId: Id,
  cssWidth: number,
): void {
  const page = editor.getPage(pageId);
  if (!page) return;
  const doc = editor.getDocument();
  const dpr = window.devicePixelRatio || 1;
  const scale = (cssWidth / doc.width) * dpr;
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  renderPage(ctx, editor, page, doc, { pixelRatio: scale, placeholders: true });
}

/** Live thumbnail of a page; redraws (throttled) when the document changes. */
export function PageThumb({
  pageId,
  width,
  className,
}: {
  pageId: Id;
  width: number;
  className?: string;
}) {
  const editor = useEditor();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let timer = 0;
    let last = 0;
    const draw = () => {
      timer = 0;
      last = performance.now();
      if (ref.current) drawThumb(ref.current, editor, pageId, width);
    };
    const schedule = () => {
      if (timer) return;
      const wait = Math.max(0, 250 - (performance.now() - last));
      timer = window.setTimeout(draw, wait);
    };
    draw();
    const offs = [editor.events.on('change', schedule), editor.events.on('render', schedule)];
    return () => {
      for (const off of offs) off();
      window.clearTimeout(timer);
    };
  }, [editor, pageId, width]);
  const doc = editor.getDocument();
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, height: (width * doc.height) / doc.width }}
    />
  );
}
