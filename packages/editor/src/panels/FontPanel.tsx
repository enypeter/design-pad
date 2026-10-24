import type { FontFamilyDef, TextElement } from '@design-pad/core';
import { Check, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, SearchInput, Section } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';
import { useFontPreview } from '../fonts';
import { showToast } from '../state/ui';

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi bold',
  700: 'Bold',
  800: 'Extra bold',
  900: 'Black',
};

function useVisible<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return [ref, visible];
}

function FontRow({
  def,
  selected,
  weight,
  onPick,
}: {
  def: FontFamilyDef;
  selected: boolean;
  weight: number;
  onPick(family: string, weight?: number): void;
}) {
  const { editor } = useDesignPad();
  const [ref, visible] = useVisible<HTMLDivElement>();
  const family = useFontPreview(def, editor.fonts, visible);
  const [open, setOpen] = useState(false);
  const weights = [...new Set(def.variants.filter((v) => !v.italic).map((v) => v.weight))].sort(
    (a, b) => a - b,
  );
  return (
    <div ref={ref} className={`dp-font-row${selected ? ' is-selected' : ''}`}>
      <div className="dp-font-main">
        <button
          type="button"
          className="dp-font-expand"
          aria-label={open ? 'Hide styles' : 'Show styles'}
          disabled={weights.length < 2}
          onClick={() => setOpen((o) => !o)}
        >
          {weights.length > 1 ? (
            open ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : null}
        </button>
        <button
          type="button"
          className="dp-font-name"
          style={{ fontFamily: family ? `"${family}", sans-serif` : undefined }}
          onClick={() => onPick(def.family)}
        >
          {def.family}
        </button>
        {selected && <Check size={16} className="dp-font-check" />}
      </div>
      {open && (
        <div className="dp-font-weights">
          {weights.map((w) => (
            <button
              key={w}
              type="button"
              className={`dp-font-weight${selected && w === weight ? ' is-selected' : ''}`}
              onClick={() => onPick(def.family, w)}
            >
              {WEIGHT_NAMES[w] ?? w}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FontPanel() {
  const ctx = useDesignPad();
  const { editor, ui } = ctx;
  const [query, setQuery] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(0);
  const families = useMemo(() => {
    void version;
    return editor.fonts.getFamilies();
  }, [editor, version]);
  const current = useEditorValue((e) => {
    const el = e.getSelectedElements().find((x): x is TextElement => x.type === 'text');
    return el
      ? { family: el.style.fontFamily, weight: el.style.fontWeight, ids: e.getSelectedIds() }
      : null;
  });
  const used = useEditorValue((e) => {
    const set = new Set<string>();
    for (const r of e.store.values())
      if (r.typeName === 'element' && r.type === 'text') set.add(r.style.fontFamily);
    return [...set].sort();
  });
  const brandFonts = Object.values(ctx.options.brand?.fonts ?? {}).filter((f): f is string => !!f);

  const pick = (family: string, weight?: number) => {
    if (!current) return;
    const style = weight ? { fontFamily: family, fontWeight: weight } : { fontFamily: family };
    if (ctx.textEditor.current?.applyStyle(style)) return;
    editor.applyTextStyle(current.ids, style);
  };

  const q = query.trim().toLowerCase();
  const match = (d: FontFamilyDef) =>
    !q || d.family.toLowerCase().includes(q) || d.category.includes(q);
  const byName = new Map(families.map((f) => [f.family, f]));
  const groups: { title: string; list: FontFamilyDef[] }[] = [];
  if (!q && used.length)
    groups.push({
      title: 'Document fonts',
      list: used.map((f) => byName.get(f) ?? { family: f, category: 'sans-serif', variants: [] }),
    });
  if (!q && brandFonts.length)
    groups.push({
      title: 'Brand fonts',
      list: brandFonts.map(
        (f) => byName.get(f) ?? { family: f, category: 'sans-serif', variants: [] },
      ),
    });
  for (const cat of ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'] as const) {
    const list = families.filter((f) => f.category === cat && match(f));
    if (list.length)
      groups.push({
        title: cat === 'sans-serif' ? 'Sans serif' : cat[0]!.toUpperCase() + cat.slice(1),
        list,
      });
  }

  return (
    <>
      <div className="dp-panel-pad">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Try “Playfair” or “handwriting”"
        />
      </div>
      <div className="dp-panel-scroll dp-scrollable">
        {!current && <EmptyState>Select a text box to change its font.</EmptyState>}
        {groups.map((g) => (
          <Section key={g.title} title={g.title}>
            {g.list.map((def) => (
              <FontRow
                key={`${g.title}-${def.family}`}
                def={def}
                selected={current?.family === def.family}
                weight={current?.weight ?? 400}
                onPick={pick}
              />
            ))}
          </Section>
        ))}
        <div className="dp-panel-pad">
          <button
            type="button"
            className="dp-link dp-upload-font"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} /> Upload a font (TTF, OTF, WOFF)
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const family = file.name.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/[-_]+/g, ' ');
              try {
                const uploaded = await ctx.assets.upload(file);
                await editor.fonts.registerFontData(family, await file.arrayBuffer());
                editor.addAsset({
                  kind: 'font',
                  src: uploaded.src,
                  mime: file.type || 'font/ttf',
                  width: 0,
                  height: 0,
                  name: file.name,
                  fontFamily: family,
                });
                setVersion((v) => v + 1);
                pick(family);
                showToast(ui, `Added font “${family}”`);
              } catch (err) {
                console.error(err);
                showToast(ui, 'That file is not a usable font', 'error');
              }
            }}
          />
        </div>
      </div>
    </>
  );
}
