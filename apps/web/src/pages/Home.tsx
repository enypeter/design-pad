import {
  createDesignId,
  createDocumentRecord,
  createPageRecord,
  type DesignFile,
  indexBetween,
  SCHEMA_VERSION,
  type Unit,
} from '@design-pad/core';
import { formatSize, SIZE_PRESETS, type SizePreset, toPx } from '@design-pad/editor';
import { useEffect, useMemo, useState } from 'react';
import { navigate } from '../router';
import {
  type DesignSummary,
  deleteDesign,
  listDesigns,
  loadDesign,
  loadThumbnail,
  saveDesign,
} from '../storage/designs';

function newDesignFile(name: string, width: number, height: number, unit: Unit): DesignFile {
  const doc = createDocumentRecord({ title: name, width, height, unit });
  const page = createPageRecord({ index: indexBetween(null, null) });
  return {
    format: 'design-pad',
    schemaVersion: SCHEMA_VERSION,
    id: createDesignId(),
    title: doc.title,
    width: doc.width,
    height: doc.height,
    unit: doc.unit,
    dpi: doc.dpi,
    pages: [page],
    elements: [],
    assets: [],
  };
}

async function create(name: string, width: number, height: number, unit: Unit) {
  const file = newDesignFile(name, width, height, unit);
  await saveDesign(file);
  navigate(`/design/${file.id}`);
}

function Thumb({ id, ratio }: { id: string; ratio: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    void loadThumbnail(id).then((blob) => {
      if (!alive || !blob) return;
      created = URL.createObjectURL(blob);
      setUrl(created);
    });
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);
  return (
    <span className="home-thumb" style={{ aspectRatio: `${Math.max(0.5, Math.min(2, ratio))}` }}>
      {url ? <img src={url} alt="" /> : null}
    </span>
  );
}

function PresetIcon({ p }: { p: SizePreset }) {
  const w = toPx(p.width, p.unit);
  const h = toPx(p.height, p.unit);
  const k = 40 / Math.max(w, h);
  return <span className="home-preset-shape" style={{ width: w * k, height: h * k }} />;
}

const POPULAR_COUNT = 11;

export function Home() {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [custom, setCustom] = useState({ w: '1080', h: '1080', unit: 'px' as Unit });
  const [query, setQuery] = useState('');
  const [allSizes, setAllSizes] = useState(false);

  const refresh = () => void listDesigns().then(setDesigns);
  useEffect(refresh, []);

  const presets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SIZE_PRESETS.filter((p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q));
  }, [query]);
  // Two rows of popular sizes by default so recent designs stay near the top.
  const collapsed = !allSizes && !query.trim() && presets.length > POPULAR_COUNT;
  const shown = collapsed ? presets.slice(0, POPULAR_COUNT) : presets;

  return (
    <div className="home">
      <header className="home-header">
        <a
          className="home-logo"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <img src="/favicon.svg" alt="" width={32} height={32} />
          Design Pad
        </a>
        <a className="home-link" href="/examples/embed-host.html">
          Embed demo
        </a>
      </header>

      <section className="home-hero">
        <h1>What will you design today?</h1>
        <input
          className="home-search"
          placeholder="Search sizes: Instagram, A4, presentation…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>Create a design</h2>
          {!query.trim() && presets.length > POPULAR_COUNT && (
            <button type="button" className="home-link-btn" onClick={() => setAllSizes(!allSizes)}>
              {allSizes ? 'Show fewer' : 'Show all sizes'}
            </button>
          )}
        </div>
        <div className="home-presets">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              className="home-preset"
              onClick={() => create(p.name, toPx(p.width, p.unit), toPx(p.height, p.unit), p.unit)}
            >
              <span className="home-preset-icon">
                <PresetIcon p={p} />
              </span>
              <span className="home-preset-name">{p.name}</span>
              <span className="home-preset-size">{formatSize(p.width, p.height, p.unit)}</span>
            </button>
          ))}
          <form
            className="home-preset home-custom"
            onSubmit={(e) => {
              e.preventDefault();
              const w = toPx(Number(custom.w), custom.unit);
              const h = toPx(Number(custom.h), custom.unit);
              if (w >= 16 && h >= 16 && w <= 20000 && h <= 20000)
                void create('Untitled design', w, h, custom.unit);
            }}
          >
            <span className="home-preset-name">Custom size</span>
            <span className="home-custom-row">
              <input
                aria-label="Width"
                value={custom.w}
                onChange={(e) => setCustom({ ...custom, w: e.target.value })}
              />
              ×
              <input
                aria-label="Height"
                value={custom.h}
                onChange={(e) => setCustom({ ...custom, h: e.target.value })}
              />
              <select
                aria-label="Units"
                value={custom.unit}
                onChange={(e) => setCustom({ ...custom, unit: e.target.value as Unit })}
              >
                <option value="px">px</option>
                <option value="in">in</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
              </select>
            </span>
            <button type="submit" className="home-create">
              Create
            </button>
          </form>
        </div>
      </section>

      <section className="home-section">
        <h2>Recent designs</h2>
        {designs && !designs.length && (
          <p className="home-empty">
            Designs you create are saved in this browser and appear here.
          </p>
        )}
        <div className="home-designs">
          {designs?.map((d) => (
            <div key={d.id} className="home-design">
              <button
                type="button"
                className="home-design-open"
                onClick={() => navigate(`/design/${d.id}`)}
              >
                <Thumb id={d.id} ratio={d.width / d.height} />
                <span className="home-design-title">{d.title}</span>
                <span className="home-design-meta">
                  {d.width} × {d.height} px · {new Date(d.updatedAt).toLocaleDateString()}
                </span>
              </button>
              <div className="home-design-actions">
                <button
                  type="button"
                  onClick={async () => {
                    const entry = await loadDesign(d.id);
                    if (!entry) return;
                    await saveDesign({
                      ...entry.file,
                      id: createDesignId(),
                      title: `${entry.title} (copy)`,
                    });
                    refresh();
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete “${d.title}”? This cannot be undone.`)) return;
                    await deleteDesign(d.id);
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
