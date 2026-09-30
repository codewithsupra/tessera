import { create } from 'zustand'
import type { SlashCommand } from './commands'

type SlashState = {
  open: boolean
  items: SlashCommand[]
  index: number
  rect: DOMRect | null
  select: ((item: SlashCommand) => void) | null
  show: (items: SlashCommand[], rect: DOMRect | null, select: (item: SlashCommand) => void) => void
  hide: () => void
  move: (delta: number) => void
}

export const useSlashStore = create<SlashState>((set) => ({
  open: false,
  items: [],
  index: 0,
  rect: null,
  select: null,
  show: (items, rect, select) =>
    set((s) => ({ open: true, items, rect, select, index: s.open ? Math.min(s.index, Math.max(items.length - 1, 0)) : 0 })),
  hide: () => set({ open: false, items: [], index: 0, rect: null, select: null }),
  move: (delta) =>
    set((s) => (s.items.length ? { index: (s.index + delta + s.items.length) % s.items.length } : s)),
}))
