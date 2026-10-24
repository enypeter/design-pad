import {
  applyToPoint,
  boxCorners,
  type DesignElement,
  type Editor,
  gridCellRect,
  HANDLE_SIGNS,
  type Id,
  imageRectFromCrop,
  type Mat,
  multiply,
  normalizeAngle,
  type Point,
  type ResizeHandle,
} from '@design-pad/core';
import { useCamera, useDesignPad, useEditorValue, useUI } from '../../context';
import { type Camera, pageLayout } from '../camera';
import { cropContext } from '../draw';
import { cursorForHandle, handlesFor } from '../interactions';

const ACCENT = 'var(--dp-accent)';
const GUIDE = 'var(--dp-guide)';

function pageScreenMatrix(editor: Editor, cam: Camera, pageId: Id): Mat | null {
  const pages = editor.getPages();
  const index = pages.findIndex((p) => p.id === pageId);
  if (index < 0) return null;
  const { rect } = pageLayout(cam, editor.getDocument(), pages.length, index);
  return { a: cam.zoom, b: 0, c: 0, d: cam.zoom, e: rect.x, f: rect.y };
}

/** element-local → screen */
function elementScreenMatrix(editor: Editor, cam: Camera, id: Id): Mat | null {
  const pageId = editor.getPageIdOf(id);
  if (!pageId) return null;
  const pm = pageScreenMatrix(editor, cam, pageId);
  return pm ? multiply(pm, editor.getElementPageMatrix(id)) : null;
}

const poly = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function Outline({
  pts,
  width = 2,
  dashed = false,
  color = ACCENT,
}: {
  pts: Point[];
  width?: number;
  dashed?: boolean;
  color?: string;
}) {
  return (
    <polygon
      points={poly(pts)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dashed ? '6 4' : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

interface HandleProps {
  at: Point;
  handle: ResizeHandle;
  rotation: number;
  kind?: 'resize' | 'crop-window' | 'crop-image';
}

function Handle({ at, handle, rotation, kind = 'resize' }: HandleProps) {
  const corner = handle.length === 2;
  const cursor = cursorForHandle(handle, rotation);
  const data = `${kind}:${handle}`;
  if (corner) {
    return (
      <g data-handle={data} style={{ cursor }} className="dp-handle">
        <circle cx={at.x} cy={at.y} r={12} fill="transparent" />
        <circle cx={at.x} cy={at.y} r={kind === 'crop-image' ? 6 : 7} className="dp-handle-dot" />
      </g>
    );
  }
  const [sx] = HANDLE_SIGNS[handle];
  const vertical = sx !== 0;
  const w = vertical ? 7 : 20;
  const h = vertical ? 20 : 7;
  return (
    <g
      data-handle={data}
      style={{ cursor }}
      className="dp-handle"
      transform={`rotate(${rotation} ${at.x} ${at.y})`}
    >
      <rect x={at.x - 12} y={at.y - 12} width={24} height={24} fill="transparent" />
      <rect
        x={at.x - w / 2}
        y={at.y - h / 2}
        width={w}
        height={h}
        rx={3.5}
        className="dp-handle-pill"
      />
    </g>
  );
}

function handlePoint(corners: Point[], handle: ResizeHandle): Point {
  const [tl, tr, br, bl] = corners as [Point, Point, Point, Point];
  switch (handle) {
    case 'nw':
      return tl;
    case 'ne':
      return tr;
    case 'se':
      return br;
    case 'sw':
      return bl;
    case 'n':
      return mid(tl, tr);
    case 'e':
      return mid(tr, br);
    case 's':
      return mid(br, bl);
    case 'w':
      return mid(bl, tl);
  }
}

function RotateHandle({ corners }: { corners: Point[] }) {
  const [tl, , br, bl] = corners as [Point, Point, Point, Point];
  const bottom = mid(br, bl);
  const top = mid(tl, corners[1]!);
  const len = Math.hypot(bottom.x - top.x, bottom.y - top.y) || 1;
  const n = { x: (bottom.x - top.x) / len, y: (bottom.y - top.y) / len };
  const at = { x: bottom.x + n.x * 28, y: bottom.y + n.y * 28 };
  return (
    <g data-handle="rotate" className="dp-handle dp-rotate-handle" style={{ cursor: 'grab' }}>
      <circle cx={at.x} cy={at.y} r={13} className="dp-handle-dot" />
      <path
        transform={`translate(${at.x - 7} ${at.y - 7}) scale(0.58)`}
        d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function SelectionOverlay() {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const cam = useCamera((c) => c);
  const view = useEditorValue((e) => ({
    selected: e.getSelectedIds(),
    hovered: e.session.state.hoveredId,
    editing: e.session.state.editingId,
    cropping: e.session.state.cropping,
    focused: e.session.state.focusedGroupId,
    version: e.store.version,
  }));
  const ui = useUI((s) => ({
    interacting: s.interacting,
    guides: s.guides,
    guidesPageId: s.guidesPageId,
    marquee: s.marquee,
    label: s.transformLabel,
    liveStroke: s.liveStroke,
    drawing: s.drawing,
    dropTarget: s.dropTarget,
  }));

  const selected = editor.getElements(view.selected);
  const corners = (id: Id): Point[] => {
    const m = elementScreenMatrix(editor, cam, id);
    const el = editor.getElement(id);
    return m && el ? boxCorners(el, m) : [];
  };
  const transforming =
    ui.interacting === 'drag' || ui.interacting === 'resize' || ui.interacting === 'rotate';
  const crop = view.cropping ? cropContext(editor) : null;

  const parts: React.ReactNode[] = [];

  // Hover outline.
  if (view.hovered && !view.selected.includes(view.hovered) && !transforming && !crop) {
    const pts = corners(view.hovered);
    if (pts.length) parts.push(<Outline key="hover" pts={pts} width={1.5} />);
  }

  // Focused group outline.
  if (view.focused) {
    const pts = corners(view.focused);
    if (pts.length) parts.push(<Outline key="focus" pts={pts} width={1} dashed />);
  }

  // Drop target (frame or grid cell under a dragged image).
  if (ui.dropTarget) {
    const el = editor.getElement(ui.dropTarget.id);
    const m = elementScreenMatrix(editor, cam, ui.dropTarget.id);
    if (el && m) {
      let pts = boxCorners(el, m);
      if (el.type === 'grid' && ui.dropTarget.cell !== undefined) {
        const r = gridCellRect(el, ui.dropTarget.cell);
        pts = [
          applyToPoint(m, { x: r.x, y: r.y }),
          applyToPoint(m, { x: r.x + r.width, y: r.y }),
          applyToPoint(m, { x: r.x + r.width, y: r.y + r.height }),
          applyToPoint(m, { x: r.x, y: r.y + r.height }),
        ];
      }
      parts.push(<Outline key="drop" pts={pts} width={3} />);
    }
  }

  if (crop) {
    const el = editor.getElement(crop.id)!;
    const m = elementScreenMatrix(editor, cam, crop.id);
    if (m) {
      const rot = editor.getPageRotation(crop.id);
      const w = crop.window;
      const windowPts = [
        applyToPoint(m, { x: w.x, y: w.y }),
        applyToPoint(m, { x: w.x + w.width, y: w.y }),
        applyToPoint(m, { x: w.x + w.width, y: w.y + w.height }),
        applyToPoint(m, { x: w.x, y: w.y + w.height }),
      ];
      const r = imageRectFromCrop(crop.fill.crop, w.width, w.height);
      const imgPts = [
        applyToPoint(m, { x: w.x + r.x, y: w.y + r.y }),
        applyToPoint(m, { x: w.x + r.x + r.width, y: w.y + r.y }),
        applyToPoint(m, { x: w.x + r.x + r.width, y: w.y + r.y + r.height }),
        applyToPoint(m, { x: w.x + r.x, y: w.y + r.y + r.height }),
      ];
      parts.push(<Outline key="crop-img" pts={imgPts} width={1} color="rgba(255,255,255,0.9)" />);
      parts.push(<Outline key="crop-win" pts={windowPts} width={2} />);
      if (ui.interacting === null) {
        for (const h of ['nw', 'ne', 'se', 'sw'] as ResizeHandle[]) {
          parts.push(
            <Handle
              key={`ci-${h}`}
              at={handlePoint(imgPts, h)}
              handle={h}
              rotation={rot}
              kind="crop-image"
            />,
          );
        }
        if (el.type === 'image') {
          for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as ResizeHandle[]) {
            parts.push(
              <Handle
                key={`cw-${h}`}
                at={handlePoint(windowPts, h)}
                handle={h}
                rotation={rot}
                kind="crop-window"
              />,
            );
          }
        }
      }
    }
  } else if (selected.length) {
    const multi = selected.length > 1;
    for (const el of selected) {
      const pts = corners(el.id);
      if (pts.length)
        parts.push(<Outline key={`sel-${el.id}`} pts={pts} width={multi ? 1.5 : 2} />);
    }
    if (!transforming && !view.editing && !ui.drawing) {
      if (multi) {
        const b = editor.getBoundsOf(view.selected);
        const pageId = editor.getPageIdOf(view.selected[0]!);
        const pm = pageId ? pageScreenMatrix(editor, cam, pageId) : null;
        if (b && pm) {
          const pts = [
            applyToPoint(pm, { x: b.x, y: b.y }),
            applyToPoint(pm, { x: b.x + b.width, y: b.y }),
            applyToPoint(pm, { x: b.x + b.width, y: b.y + b.height }),
            applyToPoint(pm, { x: b.x, y: b.y + b.height }),
          ];
          parts.push(<Outline key="multi" pts={pts} width={1} dashed />);
          if (!selected.some((e) => e.locked)) {
            for (const h of handlesFor(null, true))
              parts.push(
                <Handle key={`h-${h}`} at={handlePoint(pts, h)} handle={h} rotation={0} />,
              );
            parts.push(<RotateHandle key="rot" corners={pts} />);
          }
        }
      } else {
        const el = selected[0]!;
        parts.push(...singleHandles(editor, cam, el, corners(el.id)));
      }
    }
  }

  // Snap guides.
  if (ui.guides.length && ui.guidesPageId) {
    const pm = pageScreenMatrix(editor, cam, ui.guidesPageId);
    if (pm) {
      ui.guides.forEach((g, i) => {
        const a = g.axis === 'x' ? { x: g.position, y: g.start } : { x: g.start, y: g.position };
        const b = g.axis === 'x' ? { x: g.position, y: g.end } : { x: g.end, y: g.position };
        const sa = applyToPoint(pm, a);
        const sb = applyToPoint(pm, b);
        parts.push(
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: guides are rebuilt every frame and carry no state
            key={`g-${i}`}
            x1={sa.x}
            y1={sa.y}
            x2={sb.x}
            y2={sb.y}
            stroke={GUIDE}
            strokeWidth={1}
            strokeDasharray={g.kind === 'page' ? '4 3' : undefined}
          />,
        );
      });
    }
  }

  // Marquee.
  if (ui.marquee) {
    const pm = pageScreenMatrix(editor, cam, ui.marquee.pageId);
    if (pm) {
      const r = ui.marquee.rect;
      const a = applyToPoint(pm, { x: r.x, y: r.y });
      parts.push(
        <rect
          key="marquee"
          x={a.x}
          y={a.y}
          width={r.width * cam.zoom}
          height={r.height * cam.zoom}
          className="dp-marquee"
        />,
      );
    }
  }

  // Live freehand stroke.
  if (ui.liveStroke && ui.drawing) {
    const pm = pageScreenMatrix(editor, cam, ui.liveStroke.pageId);
    if (pm && ui.liveStroke.points.length) {
      const pts = ui.liveStroke.points.map((p) => applyToPoint(pm, p));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
      parts.push(
        <path
          key="stroke"
          d={d}
          fill="none"
          stroke={ui.drawing.tool === 'eraser' ? 'rgba(120,120,140,0.5)' : ui.drawing.color}
          strokeOpacity={ui.drawing.opacity}
          strokeWidth={ui.drawing.size * cam.zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
        />,
      );
    }
  }

  return (
    <>
      <svg
        className="dp-overlay-svg"
        width={cam.viewportW}
        height={cam.viewportH}
        aria-hidden="true"
      >
        {parts}
      </svg>
      {ui.label && (
        <div
          className="dp-transform-label"
          style={{ transform: `translate(${ui.label.at.x}px, ${ui.label.at.y}px)` }}
        >
          {ui.label.text}
        </div>
      )}
    </>
  );
}

function singleHandles(
  editor: Editor,
  cam: Camera,
  el: DesignElement,
  pts: Point[],
): React.ReactNode[] {
  if (!pts.length) return [];
  const out: React.ReactNode[] = [];
  const rot = normalizeAngle(editor.getPageRotation(el.id));
  if (el.locked) return out;
  if (el.type === 'line') {
    const m = elementScreenMatrix(editor, cam, el.id);
    if (!m) return out;
    const a = applyToPoint(m, { x: 0, y: el.height / 2 });
    const b = applyToPoint(m, { x: el.width, y: el.height / 2 });
    for (const [end, at] of [
      ['start', a],
      ['end', b],
    ] as const) {
      out.push(
        <g
          key={`line-${end}`}
          data-handle={`line:${end}`}
          className="dp-handle"
          style={{ cursor: 'crosshair' }}
        >
          <circle cx={at.x} cy={at.y} r={12} fill="transparent" />
          <circle cx={at.x} cy={at.y} r={7} className="dp-handle-dot" />
        </g>,
      );
    }
    return out;
  }
  const w = Math.hypot(pts[1]!.x - pts[0]!.x, pts[1]!.y - pts[0]!.y);
  const h = Math.hypot(pts[3]!.x - pts[0]!.x, pts[3]!.y - pts[0]!.y);
  for (const handle of handlesFor(el, false)) {
    const side = handle.length === 1;
    // Hide side pills on small elements (like Canva) so corners stay grabbable.
    if (side && (handle === 'n' || handle === 's') && w < 48) continue;
    if (side && (handle === 'e' || handle === 'w') && h < 48) continue;
    out.push(
      <Handle key={`h-${handle}`} at={handlePoint(pts, handle)} handle={handle} rotation={rot} />,
    );
  }
  out.push(<RotateHandle key="rot" corners={pts} />);
  return out;
}
