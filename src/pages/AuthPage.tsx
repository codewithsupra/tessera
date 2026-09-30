import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Logo'
import { useAuth, type OAuthProvider } from '../auth/context'
import { validate, type AuthMode as Mode } from './authValidation'


const copy = {
  signin: { title: 'Sign in to Tessera', submit: 'Sign in', busy: 'Signing in…', switchText: 'New here?', switchLink: 'Create an account', to: '/signup' },
  signup: { title: 'Create your account', submit: 'Create account', busy: 'Creating account…', switchText: 'Already have an account?', switchLink: 'Sign in', to: '/signin' },
} as const

export function AuthPage({ mode }: { mode: Mode }) {
  const c = copy[mode]
  const { signIn, signUp, signInWithOAuth } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validate(mode, name, email, password)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    const res = mode === 'signin' ? await signIn(email.trim(), password) : await signUp(name.trim(), email.trim(), password)
    setBusy(false)
    if (res.error) return setError(res.error)
    await navigate({ to: '/app' })
  }

  async function oauth(provider: OAuthProvider) {
    setError(null)
    const res = await signInWithOAuth(provider)
    if (res.error) setError(res.error)
  }

  const field = 'mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-lapis focus:outline-none'

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-10">
      <Link to="/" aria-label="Tessera home">
        <Logo />
      </Link>
      <main className="mt-12 w-full max-w-[380px]">
        <h1 className="font-display text-3xl font-medium tracking-tight">{c.title}</h1>

        <div className="mt-8 grid gap-2.5">
          <button type="button" onClick={() => oauth('google')} className="rounded-md border border-line bg-surface px-4 py-2.5 text-[15px] font-medium hover:bg-plaster-deep">
            Continue with Google
          </button>
          <button type="button" onClick={() => oauth('github')} className="rounded-md border border-line bg-surface px-4 py-2.5 text-[15px] font-medium hover:bg-plaster-deep">
            Continue with GitHub
          </button>
        </div>

        <div className="my-6 flex items-center gap-3 text-sm text-ink-faint">
          <span className="h-px flex-1 bg-line" />
          or use email
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {mode === 'signup' && (
            <label className="text-sm font-medium text-ink-soft">
              Name
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label className="text-sm font-medium text-ink-soft">
            Email
            <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="text-sm font-medium text-ink-soft">
            Password
            <input
              className={field}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className="mt-1 rounded-md bg-ink px-4 py-2.5 text-[15px] font-medium text-plaster hover:opacity-90 disabled:opacity-60">
            {busy ? c.busy : c.submit}
          </button>
        </form>

        <p className="mt-6 text-sm text-ink-soft">
          {c.switchText}{' '}
          <Link to={c.to} className="font-medium text-lapis hover:underline">
            {c.switchLink}
          </Link>
        </p>
      </main>
    </div>
  )
}
