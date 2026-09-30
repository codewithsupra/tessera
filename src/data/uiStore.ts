import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type UiState = {
  expanded: Record<string, boolean>
  sidebarOpen: boolean
  toggle: (id: string) => void
  expand: (id: string) => void
  setSidebarOpen: (open: boolean) => void
}

/** Per-device UI conveniences (which tree rows are open). Never synced. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      expanded: {},
      sidebarOpen: false,
      toggle: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
      expand: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: true } })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    }),
    { name: 'tessera:ui', partialize: (s) => ({ expanded: s.expanded }) },
  ),
)
