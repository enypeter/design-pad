import {
  bridgeOptions,
  connectToHost,
  type DesignPadOptions,
  type HostConnection,
} from '@design-pad/editor';
import { useEffect, useMemo, useState } from 'react';

const allowedOrigins = (import.meta.env.VITE_EMBED_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/** Connect /embed to its host (iframe parent or native WebView) and build editor options. */
export function useEmbedBridge(): { ready: boolean; props: DesignPadOptions; sessionKey: string } {
  const [conn, setConn] = useState<HostConnection | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    connectToHost({ allowedOrigins })
      .then((c) => {
        if (!alive) return;
        setTheme(c.config.theme);
        setConn(c);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const props = useMemo(() => (conn ? bridgeOptions(conn, setTheme) : {}), [conn]);
  if (error) console.warn('[design-pad embed]', error);
  return { ready: !!conn, props: { ...props, theme }, sessionKey: conn ? 'connected' : 'waiting' };
}
