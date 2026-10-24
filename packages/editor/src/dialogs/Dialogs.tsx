import { useDesignPad, useUI } from '../context';
import { DownloadDialog } from './DownloadDialog';
import { ResizeDialog } from './ResizeDialog';
import { ShortcutsDialog } from './ShortcutsDialog';

export function Dialogs() {
  const { ui } = useDesignPad();
  const dialog = useUI((s) => s.dialog);
  const close = () => ui.set({ dialog: null });
  if (dialog === 'download') return <DownloadDialog onClose={close} />;
  if (dialog === 'resize') return <ResizeDialog onClose={close} />;
  if (dialog === 'shortcuts') return <ShortcutsDialog onClose={close} />;
  return null;
}
