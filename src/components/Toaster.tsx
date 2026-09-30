import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useToasts } from './toastStore'

const ICON = { info: Info, success: CheckCircle2, error: TriangleAlert } as const
const TONE = { info: 'text-lapis', success: 'text-verdigris', error: 'text-danger' } as const

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="region" aria-label="Notifications">
      {toasts.map((t) => {
        const Icon = ICON[t.kind]
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-[0_10px_30px_rgba(14,20,32,0.18)]"
          >
            <Icon size={17} className={`mt-px shrink-0 ${TONE[t.kind]}`} aria-hidden="true" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="-m-1 rounded p-1 text-ink-faint hover:text-ink" aria-label="Dismiss notification">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
