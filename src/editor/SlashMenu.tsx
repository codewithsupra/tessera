import { useSlashStore } from './slashStore'

const MENU_W = 288
const MENU_MAX_H = 320

export function SlashMenu() {
  const { open, items, index, rect, select } = useSlashStore()
  if (!open || !rect) return null

  const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_W - 8))
  const below = rect.bottom + 6
  const top = below + MENU_MAX_H > window.innerHeight ? Math.max(8, rect.top - MENU_MAX_H - 6) : below

  return (
    <div
      role="listbox"
      aria-label="Insert block"
      className="fixed z-50 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[0_8px_30px_rgba(29,43,69,0.14)]"
      style={{ left, top, width: MENU_W, maxHeight: MENU_MAX_H }}
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-ink-faint">No matching blocks</p>
      ) : (
        items.map((item, i) => (
          <button
            key={item.id}
            role="option"
            aria-selected={i === index}
            // mousedown keeps editor focus so the command applies at the caret
            onMouseDown={(e) => {
              e.preventDefault()
              select?.(item)
            }}
            className={`block w-full rounded-md px-3 py-1.5 text-left ${i === index ? 'bg-lapis-soft' : 'hover:bg-plaster-deep'}`}
          >
            <span className="block text-sm font-medium text-ink">{item.title}</span>
            <span className="block text-xs text-ink-faint">{item.description}</span>
          </button>
        ))
      )}
    </div>
  )
}
