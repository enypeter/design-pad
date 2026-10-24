import { useEffect, useRef, useState } from 'react';
import { insertAsset, photoToUpload } from '../actions';
import { setDragItem } from '../canvas/dnd';
import { Button, EmptyState, SearchInput } from '../components/ui';
import type { PhotoResult } from '../config';
import { useDesignPad } from '../context';
import { PanelHeader } from '../shell/SidePanel';

export function PhotosPanel() {
  const ctx = useDesignPad();
  const provider = ctx.options.photos;
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<PhotoResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  // A new query starts from page 1 in the same render, so we never fetch it at a stale page.
  const [searched, setSearched] = useState(debounced);
  if (searched !== debounced) {
    setSearched(debounced);
    setPage(1);
  }

  useEffect(() => {
    if (!provider) return;
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    provider
      .search(debounced, page)
      .then((res) => {
        if (id !== seq.current) return;
        setResults((prev) => (page === 1 ? res.results : [...prev, ...res.results]));
        setHasMore(res.hasMore);
      })
      .catch((err) => {
        if (id === seq.current) setError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (id === seq.current) setLoading(false);
      });
  }, [provider, debounced, page]);

  if (!provider) {
    return (
      <div className="dp-panel">
        <PanelHeader title="Photos" />
        <EmptyState>
          No photo library is connected. Pass a <code>photos</code> provider (for example Unsplash,
          or your client galleries) to show searchable photos here. Your own images are under
          Uploads.
        </EmptyState>
      </div>
    );
  }

  const use = (photo: PhotoResult) => {
    provider.onUse?.(photo);
    insertAsset(ctx, photoToUpload(photo));
  };

  return (
    <div className="dp-panel">
      <PanelHeader title={provider.name} />
      <div className="dp-panel-pad">
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${provider.name}`} />
      </div>
      <div className="dp-panel-scroll dp-scrollable">
        {error && <EmptyState>{error}</EmptyState>}
        {!error && !loading && !results.length && <EmptyState>No photos found.</EmptyState>}
        <div className="dp-photo-masonry">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="dp-photo-item"
              title={p.author ? `Photo by ${p.author}` : 'Photo'}
              draggable
              onDragStart={(e) => setDragItem(e, { kind: 'photo', photo: p })}
              onClick={() => use(p)}
            >
              <img
                src={p.thumbUrl}
                alt={p.author ? `Photo by ${p.author}` : ''}
                loading="lazy"
                draggable={false}
                style={{ aspectRatio: `${p.width} / ${p.height}` }}
              />
              {p.author && <span className="dp-photo-credit">{p.author}</span>}
            </button>
          ))}
        </div>
        {hasMore && (
          <div className="dp-panel-pad">
            <Button block disabled={loading} onClick={() => setPage((n) => n + 1)}>
              {loading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
