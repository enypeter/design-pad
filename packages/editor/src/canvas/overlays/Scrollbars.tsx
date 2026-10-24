import { useRef } from 'react';
import { useCamera, useDesignPad, useEditorValue } from '../../context';
import { clampScroll, contentSize } from '../camera';

interface Bar {
  axis: 'x' | 'y';
  thumb: number;
  pos: number;
  /** Scroll distance per pixel of thumb travel. */
  rate: number;
}

/** Thin overlay scrollbars for the custom-scrolled canvas. */
export function Scrollbars() {
  const { camera, editor } = useDesignPad();
  const cam = useCamera((c) => c);
  const info = useEditorValue((e) => {
    const d = e.getDocument();
    return { width: d.width, height: d.height, pages: e.getPages().length };
  });
  const drag = useRef<{ axis: 'x' | 'y'; start: number; scroll: number; rate: number } | null>(
    null,
  );
  const size = contentSize(cam, info, info.pages, true);

  const bars: Bar[] = [];
  const make = (axis: 'x' | 'y', content: number, view: number, scroll: number) => {
    if (content <= view + 1) return;
    const track = view - 16;
    const thumb = Math.max(32, track * (view / content));
    const maxScroll = content - view;
    const travel = Math.max(1, track - thumb);
    bars.push({ axis, thumb, pos: (scroll / maxScroll) * travel, rate: maxScroll / travel });
  };
  make('y', size.height, cam.viewportH, cam.scrollY);
  make('x', size.width, cam.viewportW, cam.scrollX);

  return (
    <>
      {bars.map((b) => (
        <div
          key={b.axis}
          className={`dp-scrollbar dp-scrollbar-${b.axis}`}
          data-chrome
          style={
            b.axis === 'y'
              ? { top: 4 + b.pos, height: b.thumb }
              : { left: 4 + b.pos, width: b.thumb }
          }
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = {
              axis: b.axis,
              start: b.axis === 'x' ? e.clientX : e.clientY,
              scroll: b.axis === 'x' ? cam.scrollX : cam.scrollY,
              rate: b.rate,
            };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const delta = ((d.axis === 'x' ? e.clientX : e.clientY) - d.start) * d.rate;
            const c = camera.get();
            const next =
              d.axis === 'x'
                ? { ...c, scrollX: d.scroll + delta }
                : { ...c, scrollY: d.scroll + delta };
            camera.set(clampScroll(next, info, editor.getPages().length));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
        />
      ))}
    </>
  );
}
