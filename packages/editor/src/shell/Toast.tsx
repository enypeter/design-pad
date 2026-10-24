import { useUI } from '../context';

export function Toast() {
  const toast = useUI((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`dp-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {toast.message}
    </div>
  );
}
