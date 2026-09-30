import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuth } from '../auth/context'
import { toast } from './toastStore'

/** One click into a private sample workspace — no email, no password. */
export function TryGuestButton({ className, label = 'Try it now — no sign-up' }: { className?: string; label?: string }) {
  const { startGuest } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  async function go() {
    if (busy) return
    setBusy(true)
    const res = await startGuest()
    if (res.error) {
      setBusy(false)
      toast.error(res.error)
      return
    }
    await navigate({ to: '/app' })
  }

  return (
    <button onClick={go} disabled={busy} aria-busy={busy} className={className}>
      {busy ? 'Setting up your workspace…' : label}
    </button>
  )
}
