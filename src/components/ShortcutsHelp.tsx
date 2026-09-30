import { useUiStore } from '../data/uiStore'
import { shortcutList } from '../lib/shortcuts'
import { Modal } from './Modal'

export function ShortcutsHelp() {
  const open = useUiStore((s) => s.dialog === 'shortcuts')
  const setDialog = useUiStore((s) => s.setDialog)
  return (
    <Modal open={open} onClose={() => setDialog(null)} title="Keyboard shortcuts" width={440}>
      <dl className="grid gap-2.5">
        {shortcutList().map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-4 text-sm">
            <dt className="text-ink-soft">{s.label}</dt>
            <dd className="flex shrink-0 gap-1">
              {s.keys.map((k) => (
                <kbd key={k} className="min-w-6 rounded border border-line bg-plaster px-1.5 py-0.5 text-center font-sans text-xs text-ink">
                  {k}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
