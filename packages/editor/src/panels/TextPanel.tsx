import { createText, type DesignElement, type TextElement } from '@design-pad/core';
import { Type } from 'lucide-react';
import { useMemo } from 'react';
import { insertElement, visibleCenter } from '../actions';
import { setDragItem } from '../canvas/dnd';
import { Button, Section } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';
import { useFontsLoaded } from '../fonts';
import { defaultTextPresets, FONT_COMBOS, type FontCombo, type TextPreset } from '../library/text';
import { PanelHeader } from '../shell/SidePanel';

function useAddText() {
  const ctx = useDesignPad();
  return (preset: TextPreset, edit: boolean) => {
    const { editor } = ctx;
    const el = createText({ spans: [{ text: preset.text }], style: preset.style });
    const width = Math.ceil(editor.text.naturalWidth(el)) + 2;
    const id = insertElement(ctx, { ...el, width });
    if (edit) editor.startTextEditing(id);
    return id;
  };
}

function ComboCard({ combo }: { combo: FontCombo }) {
  const ctx = useDesignPad();
  const { editor } = ctx;
  const ready = useFontsLoaded(
    editor.fonts,
    combo.lines.map((l) => ({
      family: l.style.fontFamily ?? 'Inter',
      weight: l.style.fontWeight,
      italic: l.style.italic,
    })),
  );
  const add = () => {
    const doc = editor.getDocument();
    const base = Math.min(doc.width, doc.height) * 0.07;
    const center = visibleCenter(ctx);
    const els: TextElement[] = [];
    let y = 0;
    for (const line of combo.lines) {
      const fontSize = Math.round(base * line.scale);
      y += (line.gap ?? 0) * base;
      const el = createText({
        spans: [{ text: line.text }],
        style: { align: 'center', lineHeight: 1.15, ...line.style, fontSize },
        effect: line.effect ?? null,
      });
      const width = Math.ceil(editor.text.naturalWidth(el)) + 2;
      els.push({ ...el, width, y });
      y += fontSize * 1.15;
    }
    const placed = els.map((e) => ({
      ...e,
      x: center.point.x - e.width / 2,
      y: center.point.y - y / 2 + e.y,
    }));
    editor.batch(() => {
      const ids = editor.createElements(placed as DesignElement[], { pageId: center.pageId });
      editor.groupElements(ids);
    });
  };
  return (
    <button
      type="button"
      className="dp-combo-card"
      onClick={add}
      title={combo.name}
      style={{ opacity: ready ? 1 : 0.5 }}
    >
      {combo.lines.map((l) => (
        <span
          key={l.text}
          style={{
            fontFamily: `"${l.style.fontFamily}", sans-serif`,
            fontWeight: l.style.fontWeight ?? 400,
            fontStyle: l.style.italic ? 'italic' : 'normal',
            color: l.style.color,
            fontSize: Math.round(18 * l.scale),
            letterSpacing: `${(l.style.letterSpacing ?? 0) / 1000}em`,
            lineHeight: 1.1,
            WebkitTextStroke: l.effect?.type === 'hollow' ? `1px ${l.style.color}` : undefined,
            WebkitTextFillColor: l.effect?.type === 'hollow' ? 'transparent' : undefined,
            textShadow:
              l.effect?.type === 'neon'
                ? `0 0 6px ${l.style.color}`
                : l.effect?.type === 'echo'
                  ? `2px 2px 0 ${l.effect.color}88, 4px 4px 0 ${l.effect.color}44`
                  : undefined,
          }}
        >
          {l.text}
        </span>
      ))}
    </button>
  );
}

export function TextPanel() {
  const ctx = useDesignPad();
  const add = useAddText();
  const doc = useEditorValue((e) => ({
    width: e.getDocument().width,
    height: e.getDocument().height,
  }));
  const presets = useMemo(() => defaultTextPresets(doc), [doc]);
  const brandFonts = ctx.options.brand?.fonts;

  return (
    <div className="dp-panel">
      <PanelHeader title="Text" />
      <div className="dp-panel-scroll dp-scrollable">
        <div className="dp-panel-pad">
          <Button variant="primary" block size="lg" onClick={() => add(presets[0]!, true)}>
            <Type size={18} /> Add a text box
          </Button>
        </div>
        <Section title="Default text styles">
          <div className="dp-text-presets">
            {presets.slice(1).map((p) => (
              <button
                key={p.id}
                type="button"
                className={`dp-text-preset is-${p.id}`}
                draggable
                onDragStart={(e) => {
                  const el = createText({ spans: [{ text: p.text }], style: p.style });
                  setDragItem(e, {
                    kind: 'element',
                    init: { ...el, width: Math.ceil(ctx.editor.text.naturalWidth(el)) + 2 },
                  });
                }}
                onClick={() => add(p, false)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Section>
        {brandFonts && (
          <Section title="Brand fonts">
            <div className="dp-text-presets">
              {(['heading', 'subheading', 'body'] as const).map((role, i) => {
                const family = brandFonts[role];
                if (!family) return null;
                const p = presets[i + 1]!;
                return (
                  <button
                    key={role}
                    type="button"
                    className={`dp-text-preset is-${p.id}`}
                    style={{ fontFamily: `"${family}", sans-serif` }}
                    onClick={() => add({ ...p, style: { ...p.style, fontFamily: family } }, false)}
                  >
                    {role === 'heading'
                      ? 'Brand heading'
                      : role === 'subheading'
                        ? 'Brand subheading'
                        : 'Brand body text'}
                  </button>
                );
              })}
            </div>
          </Section>
        )}
        <Section title="Font combinations">
          <div className="dp-combo-grid">
            {FONT_COMBOS.map((c) => (
              <ComboCard key={c.id} combo={c} />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
