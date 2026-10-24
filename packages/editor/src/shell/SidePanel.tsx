import { ChevronLeft, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EmptyState } from '../components/ui';
import { useDesignPad, useUI } from '../context';
import { BrandPanel } from '../panels/BrandPanel';
import { ColorPanel } from '../panels/ColorPanel';
import { DrawPanel } from '../panels/DrawPanel';
import { EditImagePanel } from '../panels/EditImagePanel';
import { EffectsPanel } from '../panels/EffectsPanel';
import { ElementsPanel } from '../panels/ElementsPanel';
import { FontPanel } from '../panels/FontPanel';
import { PhotosPanel } from '../panels/PhotosPanel';
import { PositionPanel } from '../panels/PositionPanel';
import { TemplatesPanel } from '../panels/TemplatesPanel';
import { TextPanel } from '../panels/TextPanel';
import { UploadsPanel } from '../panels/UploadsPanel';
import type { ContextPanelId } from '../state/ui';

const CONTEXT_TITLES: Record<ContextPanelId, string> = {
  font: 'Font',
  color: 'Colour',
  effects: 'Effects',
  'edit-image': 'Edit photo',
  position: 'Position',
};

export function PanelHeader({
  title,
  onClose,
  onBack,
}: {
  title: string;
  onClose?: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="dp-panel-head">
      {onBack && (
        <button type="button" className="dp-icon-btn sm" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={18} />
        </button>
      )}
      <h2>{title}</h2>
      {onClose && (
        <button
          type="button"
          className="dp-icon-btn sm dp-panel-close"
          aria-label="Close panel"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      )}
    </div>
  );
}

export function SidePanel() {
  const { ui, options } = useDesignPad();
  const { leftPanel, contextPanel } = useUI((s) => ({
    leftPanel: s.leftPanel,
    contextPanel: s.contextPanel,
  }));
  if (!leftPanel && !contextPanel) return null;

  let content: ReactNode = null;
  if (contextPanel) {
    const close = () => ui.set({ contextPanel: null, colorTarget: null });
    const body = {
      font: <FontPanel />,
      color: <ColorPanel />,
      effects: <EffectsPanel />,
      'edit-image': <EditImagePanel />,
      position: <PositionPanel />,
    }[contextPanel];
    content = (
      <>
        <PanelHeader title={CONTEXT_TITLES[contextPanel]} onClose={close} />
        {body}
      </>
    );
  } else if (leftPanel) {
    content = {
      design: <TemplatesPanel />,
      elements: <ElementsPanel />,
      text: <TextPanel />,
      brand: <BrandPanel />,
      uploads: <UploadsPanel />,
      photos: <PhotosPanel />,
      draw: <DrawPanel />,
    }[leftPanel];
  }

  return (
    <aside className="dp-side-panel" aria-label="Side panel">
      <ErrorBoundary
        resetKey={contextPanel ?? leftPanel}
        onError={(error) => (options.onError ? options.onError(error) : console.error(error))}
        fallback={(reset) => (
          <EmptyState>
            This panel hit a problem.{' '}
            <button type="button" className="dp-link" onClick={reset}>
              Try again
            </button>
          </EmptyState>
        )}
      >
        {content}
      </ErrorBoundary>
      <button
        type="button"
        className="dp-panel-collapse"
        aria-label="Close panel"
        title="Close panel"
        onClick={() => ui.set({ leftPanel: null, contextPanel: null, drawing: null })}
      >
        <ChevronLeft size={16} />
      </button>
    </aside>
  );
}
