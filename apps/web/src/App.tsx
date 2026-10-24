import { lazy, Suspense } from 'react';
import { Home } from './pages/Home';
import { useLocation } from './router';

// The editor is most of the bundle; the home page should not wait for it.
const EditorPage = lazy(() =>
  import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const EmbedPage = lazy(() => import('./pages/EmbedPage').then((m) => ({ default: m.EmbedPage })));

export function App() {
  const url = useLocation();
  const path = url.pathname.replace(/\/+$/, '');
  const design = /^\/design\/([\w-]+)$/.exec(path);
  let page = <Home />;
  if (design) page = <EditorPage key={design[1]} id={design[1]!} />;
  else if (path === '/embed') page = <EmbedPage />;
  return <Suspense fallback={<div className="app-loading">Loading…</div>}>{page}</Suspense>;
}
