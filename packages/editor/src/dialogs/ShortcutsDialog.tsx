import { Modal } from '../components/ui';
import { mod } from '../platform';
import { SHORTCUTS } from '../shortcuts';

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={560}>
      <div className="dp-shortcuts dp-scrollable">
        {groups.map((g) => (
          <section key={g}>
            <h3>{g}</h3>
            <dl>
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <div key={s.label} className="dp-shortcut">
                  <dt>{s.label}</dt>
                  <dd>
                    <kbd>{s.keys.replace(/Mod/g, mod)}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
