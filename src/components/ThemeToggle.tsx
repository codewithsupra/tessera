import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../lib/theme'

const LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const
const ICON = { system: Monitor, light: Sun, dark: Moon } as const

export function ThemeToggle() {
  const { pref, cycle } = useTheme()
  const Icon = ICON[pref]
  return (
    <button onClick={cycle} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-line/50 hover:text-ink" aria-label={`Theme: ${LABEL[pref]}. Change theme`}>
      <Icon size={15} aria-hidden="true" /> Theme: {LABEL[pref]}
    </button>
  )
}
