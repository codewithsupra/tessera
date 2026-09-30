import { useNavigate } from '@tanstack/react-router'
import { FilePlus2, LogOut } from 'lucide-react'
import { Logo } from '../components/Logo'
import { useAuth } from '../auth/context'

export function AppShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    await signOut()
    await navigate({ to: '/' })
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-plaster-deep/50 p-4 md:flex">
        <Logo size={24} />
        <p className="mt-6 truncate text-sm font-medium text-ink">{user?.name ?? user?.email}</p>
        <p className="truncate text-xs text-ink-faint">Personal workspace</p>
        <div className="mt-auto">
          <button onClick={onSignOut} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-plaster-deep hover:text-ink">
            <LogOut size={16} aria-hidden="true" /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-3xl font-medium tracking-tight">This workspace is empty</h1>
        <p className="mt-3 max-w-sm text-ink-soft">Pages you create live on this device first and sync when you're online.</p>
        <button disabled className="mt-6 inline-flex items-center gap-2 rounded-md bg-lapis px-4 py-2.5 text-[15px] font-medium text-plaster opacity-60" title="Coming in the next release">
          <FilePlus2 size={18} aria-hidden="true" /> New page
        </button>
        <button onClick={onSignOut} className="mt-4 text-sm text-ink-soft underline md:hidden">
          Sign out
        </button>
      </main>
    </div>
  )
}
