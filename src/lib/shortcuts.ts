export type ShortcutId = 'palette' | 'newPage' | 'toggleSidebar' | 'help'

type KeyLike = {
  key: string
  code?: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  target: EventTarget | null
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/** Maps a keydown to an app shortcut. `mac` decides whether ⌘ or Ctrl is the modifier. */
export function matchShortcut(e: KeyLike, mac = isMac()): ShortcutId | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (mod && !e.altKey && e.key.toLowerCase() === 'k') return 'palette'
  if (mod && !e.altKey && e.key === '\\') return 'toggleSidebar'
  // Alt+N types "˜" on a Mac keyboard, so match the physical key.
  if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === 'KeyN' || e.key.toLowerCase() === 'n')) return 'newPage'
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e.target)) return 'help'
  return null
}

/** Human-readable shortcut list for the help dialog. */
export function shortcutList(mac = isMac()): { keys: string[]; label: string }[] {
  const mod = mac ? '⌘' : 'Ctrl'
  const alt = mac ? '⌥' : 'Alt'
  return [
    { keys: [mod, 'K'], label: 'Search pages and run commands' },
    { keys: [alt, 'N'], label: 'New page' },
    { keys: [mod, '\\'], label: 'Show or hide the sidebar' },
    { keys: ['/'], label: 'Insert a block (in a page)' },
    { keys: ['Enter'], label: 'Move from the title into the page' },
    { keys: ['?'], label: 'Show keyboard shortcuts' },
  ]
}
