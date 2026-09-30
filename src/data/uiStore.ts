import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppDialog = 'create' | 'members' | 'leave' | 'palette' | 'shortcuts' | null

type UiState = {
  expanded: Record<string, boolean>
  /** Mobile drawer. */
  sidebarOpen: boolean
  /** Desktop: sidebar hidden (Ctrl/⌘ + \). Remembered per device. */
  sidebarCollapsed: boolean
  /** At most one app-level dialog at a time. */
  dialog: AppDialog
  toggle: (id: string) => void
  expand: (id: string) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setDialog: (d: AppDialog) => void
}

/** Per-device UI conveniences. Never synced. */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      expanded: {},
      sidebarOpen: false,
      sidebarCollapsed: false,
      dialog: null,
      toggle: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
      expand: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: true } })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setDialog: (dialog) => set({ dialog }),
    }),
    { name: 'tessera:ui', partialize: (s) => ({ expanded: s.expanded, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
)
