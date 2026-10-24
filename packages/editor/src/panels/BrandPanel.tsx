import { createText } from '@design-pad/core';
import { insertAsset, insertElement } from '../actions';
import { applyColorToSelection } from '../colorTargets';
import { EmptyState, Section, Swatch } from '../components/ui';
import { useDesignPad, useEditorValue } from '../context';
import { defaultTextPresets } from '../library/text';
import { PanelHeader } from '../shell/SidePanel';

export function BrandPanel() {
  const ctx = useDesignPad();
  const brand = ctx.options.brand;
  const doc = useEditorValue((e) => ({
    width: e.getDocument().width,
    height: e.getDocument().height,
  }));
  const hasSelection = useEditorValue((e) => e.getSelectedIds().length > 0);

  if (!brand) {
    return (
      <div className="dp-panel">
        <PanelHeader title="Brand" />
        <EmptyState>
          Brand kits keep colours, fonts and logos one click away. Pass a <code>brand</code> option
          with your colours, fonts and logos to fill this panel.
        </EmptyState>
      </div>
    );
  }

  const presets = defaultTextPresets(doc);
  return (
    <div className="dp-panel">
      <PanelHeader title={brand.name ?? 'Brand kit'} />
      <div className="dp-panel-scroll dp-scrollable">
        {brand.logos?.length ? (
          <Section title="Logos">
            <div className="dp-upload-grid">
              {brand.logos.map((logo) => (
                <button
                  key={logo.src}
                  type="button"
                  className="dp-upload-thumb"
                  style={{ aspectRatio: `${logo.width} / ${logo.height}` }}
                  onClick={() => insertAsset(ctx, logo)}
                >
                  <img
                    src={logo.thumbUrl ?? logo.src}
                    alt={logo.name ?? 'Logo'}
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </Section>
        ) : null}
        <Section title="Colours">
          <p className="dp-hint">
            {hasSelection
              ? 'Click a colour to apply it to the selection.'
              : 'Select an element to apply a colour.'}
          </p>
          <div className="dp-swatch-grid">
            {brand.colors.map((c) => (
              <Swatch key={c} color={c} onClick={() => applyColorToSelection(ctx, c)} />
            ))}
          </div>
        </Section>
        {brand.fonts && (
          <Section title="Fonts">
            <div className="dp-text-presets">
              {(['heading', 'subheading', 'body'] as const).map((role, i) => {
                const family = brand.fonts?.[role];
                if (!family) return null;
                const p = presets[i + 1]!;
                return (
                  <button
                    key={role}
                    type="button"
                    className={`dp-text-preset is-${p.id}`}
                    style={{ fontFamily: `"${family}", sans-serif` }}
                    onClick={() => {
                      const el = createText({
                        spans: [{ text: p.text }],
                        style: { ...p.style, fontFamily: family },
                      });
                      insertElement(ctx, {
                        ...el,
                        width: Math.ceil(ctx.editor.text.naturalWidth(el)) + 2,
                      });
                    }}
                  >
                    {family}
                  </button>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
