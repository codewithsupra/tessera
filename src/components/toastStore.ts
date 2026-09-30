import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'
export type Toast = { id: number; kind: ToastKind; message: string }

type ToastState = {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind, ms?: number) => number
  dismiss: (id: number) => void
}

let nextId = 1
const MAX_VISIBLE = 3

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'info', ms = 4000) => {
    const id = nextId++
    // Identical messages don't stack (e.g. repeated offline/online flaps).
    const rest = get().toasts.filter((t) => t.message !== message)
    set({ toasts: [...rest, { id, kind, message }].slice(-MAX_VISIBLE) })
    if (ms > 0) setTimeout(() => get().dismiss(id), ms)
    return id
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

/** Shorthand usable outside React. */
export const toast = {
  info: (m: string) => useToasts.getState().push(m, 'info'),
  success: (m: string) => useToasts.getState().push(m, 'success'),
  error: (m: string) => useToasts.getState().push(m, 'error', 7000),
}
