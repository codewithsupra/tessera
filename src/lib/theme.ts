import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'tessera:theme'
const ORDER: ThemePref[] = ['system', 'light', 'dark']

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** 'system' leaves data-theme unset so the prefers-color-scheme tokens apply. */
export function applyTheme(pref: ThemePref, root: HTMLElement = document.documentElement) {
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
}

type ThemeState = { pref: ThemePref; set: (p: ThemePref) => void; cycle: () => void }

export const useTheme = create<ThemeState>((set, get) => ({
  pref: read(),
  set: (pref) => {
    try {
      localStorage.setItem(KEY, pref)
    } catch {
      // per-device convenience only
    }
    applyTheme(pref)
    set({ pref })
  },
  cycle: () => get().set(ORDER[(ORDER.indexOf(get().pref) + 1) % ORDER.length]),
}))

/** Call once before first render to avoid a flash of the wrong theme. */
export function initTheme() {
  applyTheme(read())
}
