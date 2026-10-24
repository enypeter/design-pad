import type { ReactNode } from 'react';
import { Viewport } from '../canvas/Viewport';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useDesignPad, useEditorValue } from '../context';
import { Dialogs } from '../dialogs/Dialogs';
import { ContextMenu } from './ContextMenu';
import { ContextToolbar } from './ContextToolbar';
import { Footer } from './Footer';
import { Header } from './Header';
import { SidePanel } from './SidePanel';
import { SideRail } from './SideRail';
import { Toast } from './Toast';

/** Chrome around the canvas fails quietly; the canvas itself stays usable. */
function Guard({ children }: { children: ReactNode }) {
  const { options } = useDesignPad();
  const selection = useEditorValue((e) => e.getSelectedIds().join());
  return (
    <ErrorBoundary
      resetKey={selection}
      onError={(error) => (options.onError ? options.onError(error) : console.error(error))}
    >
      {children}
    </ErrorBoundary>
  );
}

export function EditorShell() {
  const { features } = useDesignPad();
  return (
    <div className="dp-shell">
      {features.header && (
        <Guard>
          <Header />
        </Guard>
      )}
      <div className="dp-body">
        <SideRail />
        <SidePanel />
        <main className="dp-main">
          <Guard>
            <ContextToolbar />
          </Guard>
          <div className="dp-stage">
            <Viewport />
          </div>
          <Guard>
            <Footer />
          </Guard>
        </main>
      </div>
      <Guard>
        <ContextMenu />
        <Dialogs />
        <Toast />
      </Guard>
    </div>
  );
}
