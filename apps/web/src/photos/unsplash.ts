import type { PhotoProvider, PhotoResult } from '@design-pad/editor';

interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  urls: { raw: string; small: string; regular: string };
  user?: { name?: string; links?: { html?: string } };
  links?: { download_location?: string };
}

/**
 * Unsplash photo search. Requires an access key (VITE_UNSPLASH_ACCESS_KEY);
 * without one the Photos panel explains how to connect a library.
 * Follows the API guidelines: hotlinked URLs, attribution, download ping on use.
 */
export function unsplashProvider(accessKey: string | undefined): PhotoProvider | undefined {
  if (!accessKey) return undefined;
  const downloads = new Map<string, string>();
  const headers = { Authorization: `Client-ID ${accessKey}`, 'Accept-Version': 'v1' };
  const toResult = (p: UnsplashPhoto): PhotoResult => {
    if (p.links?.download_location) downloads.set(p.id, p.links.download_location);
    return {
      id: p.id,
      thumbUrl: p.urls.small,
      // Large enough for print-quality exports without pulling the multi-MB original.
      url: `${p.urls.raw}&w=2400&q=85&fm=jpg&fit=max`,
      width: p.width,
      height: p.height,
      author: p.user?.name,
      authorUrl: p.user?.links?.html,
      source: 'Unsplash',
    };
  };
  return {
    name: 'Unsplash',
    async search(query, page) {
      const perPage = 30;
      const url = query
        ? `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}`
        : `https://api.unsplash.com/photos?page=${page}&per_page=${perPage}`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Unsplash returned ${res.status}`);
      const data = await res.json();
      if (query) {
        const results = (data.results as UnsplashPhoto[]).map(toResult);
        return { results, hasMore: page < (data.total_pages as number) };
      }
      const list = (data as UnsplashPhoto[]).map(toResult);
      return { results: list, hasMore: list.length === perPage };
    },
    onUse(photo) {
      const url = downloads.get(photo.id);
      if (url) void fetch(url, { headers }).catch(() => undefined);
    },
  };
}
