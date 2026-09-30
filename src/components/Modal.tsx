import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

type Props = { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }

/** Native <dialog>: focus trapping, Escape to close, and inert background come for free. */
export function Modal({ open, onClose, title, children, width = 480 }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  // Return focus to whatever opened the dialog (a menu item, a button) when it closes.
  const returnTo = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null
      d.showModal()
      // showModal() focuses the first focusable element (the close button). Prefer the field
      // the dialog is about. (React's autoFocus doesn't set the native attribute.)
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && d.open) d.close()
    if (!open && returnTo.current) {
      const el = returnTo.current
      returnTo.current = null
      if (el.isConnected) el.focus()
    }
  }, [open])

  // Escape (and form method=dialog) close the native dialog without asking React; listen
  // directly so our `open` state always follows, otherwise reopening would be a no-op.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const handle = () => onCloseRef.current()
    d.addEventListener('close', handle)
    return () => d.removeEventListener('close', handle)
  }, [])

  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === ref.current && onClose()} // click on the backdrop
      aria-label={title}
      className="m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-[0_24px_60px_rgba(14,20,32,0.25)] backdrop:bg-[rgb(8_12_20/0.55)]"
      style={{ maxWidth: width }}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="font-display text-xl font-medium tracking-tight">{title}</h2>
            <button onClick={onClose} className="-mr-1 -mt-1 rounded-md p-1.5 text-ink-faint hover:bg-plaster-deep hover:text-ink" aria-label="Close">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
