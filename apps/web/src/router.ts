import { useEffect, useState } from 'react';

/** Minimal pushState router: three routes don't justify a dependency. */
export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useLocation(): URL {
  const [url, setUrl] = useState(() => new URL(window.location.href));
  useEffect(() => {
    const onPop = () => setUrl(new URL(window.location.href));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  return url;
}
