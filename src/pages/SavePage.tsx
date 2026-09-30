import { Link, useNavigate } from '@tanstack/react-router'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/context'
import { redeemClaim, saveGuestWorkspace, type SaveStep } from '../auth/saveGuest'
import { Logo } from '../components/Logo'
import { fieldCls, primaryBtn } from '../components/ui'
import { validate } from './authValidation'

const STEPS: { key: SaveStep; label: string }[] = [
  { key: 'syncing', label: 'Saving your latest changes' },
  { key: 'creating', label: 'Creating your account' },
  { key: 'moving', label: 'Moving your pages' },
]

/** Turns a guest into a real account. Lives outside the app shell so nothing syncs mid-move. */
export function SavePage() {
  const { user, isGuest } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<SaveStep | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<{ token: string; guestId: string } | null>(null)
  const guestId = user?.id

  useEffect(() => {
    if (user && !isGuest && !step) void navigate({ to: '/app', replace: true })
  }, [user, isGuest, step, navigate])

  const finish = () => window.location.replace('/app') // fresh start as the new account

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = validate('signup', name, email, password)
    if (problem) return setError(problem)
    if (!guestId) return
    setError(null)
    const res = await saveGuestWorkspace(guestId, { name, email, password }, setStep)
    if (res.ok) return finish()
    setError(res.error)
    if (res.retryToken) setRetry({ token: res.retryToken, guestId })
    else setStep(null)
  }

  async function retryMove() {
    if (!retry) return
    setError(null)
    setStep('moving')
    const res = await redeemClaim(retry.token, retry.guestId)
    if (res.ok) return finish()
    setError(res.error)
  }

  const busy = step !== null && !error
  const index = step ? STEPS.findIndex((s) => s.key === step) : -1

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10">
      <Link to="/app" aria-label="Back to your workspace">
        <Logo />
      </Link>
      <main className="mt-12 w-full max-w-[400px]">
        <h1 className="font-display text-3xl font-medium tracking-tight">Save your workspace</h1>
        <p className="mt-2 text-ink-soft">Create an account and everything you wrote as a guest comes with you.</p>

        {step || retry ? (
          <ol className="mt-8 grid gap-3" aria-label="Progress">
            {STEPS.map((s, i) => {
              const done = step === 'done' || i < index
              const current = i === index && step !== 'done'
              return (
                <li key={s.key} className={`flex items-center gap-2.5 text-[15px] ${done || current ? 'text-ink' : 'text-ink-faint'}`}>
                  {done ? <Check size={17} className="text-verdigris" aria-hidden="true" /> : current && !error ? <Loader2 size={17} className="animate-spin text-lapis" aria-hidden="true" /> : <span className="h-[17px] w-[17px] rounded-full border border-line" aria-hidden="true" />}
                  {s.label}
                </li>
              )
            })}
          </ol>
        ) : (
          <form onSubmit={submit} noValidate className="mt-8 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Name
              <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Email
              <input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink-soft">
              Password
              <input className={fieldCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <button type="submit" disabled={busy} className={`${primaryBtn} mt-1 py-2.5 text-[15px]`}>
              Save my workspace
            </button>
          </form>
        )}

        {error && (
          <div className="mt-5 grid gap-3">
            <p role="alert" className="text-sm text-danger">{error}</p>
            {retry ? (
              <button onClick={retryMove} className={primaryBtn}>Try moving my pages again</button>
            ) : (
              <button onClick={() => (setError(null), setStep(null))} className="text-sm font-medium text-lapis hover:underline">
                Edit details
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
