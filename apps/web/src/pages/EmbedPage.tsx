import { DesignPad } from '@design-pad/editor';
import '@design-pad/editor/styles.css';
import { useEmbedBridge } from '../embed/useEmbedBridge';

/**
 * The editor as an embeddable surface (iframe or mobile WebView). Hosts
 * drive it through the postMessage protocol in @design-pad/embed.
 */
export function EmbedPage() {
  const bridge = useEmbedBridge();
  if (!bridge.ready) return <div className="app-loading">Waiting for host…</div>;
  return (
    <div className="app-editor">
      <DesignPad key={bridge.sessionKey} {...bridge.props} />
    </div>
  );
}
