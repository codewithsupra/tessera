import { Suspense, lazy } from 'react'

// The signed-in app (local DB, sidebar, sync, editor) loads separately from landing/auth.
// React.lazy rather than TanStack's lazyRouteComponent, which trips React 19's conditional-use() check.
const appShell = () => import('./AppShell')
const Layout = lazy(() => appShell().then((m) => ({ default: m.AppLayout })))
const Home = lazy(() => appShell().then((m) => ({ default: m.AppHome })))
const Page = lazy(() => appShell().then((m) => ({ default: m.PageRoute })))

const blank = <div className="min-h-dvh" aria-busy="true" />

export function LazyAppLayout() {
  return <Suspense fallback={blank}><Layout /></Suspense>
}
export function LazyAppHome() {
  return <Suspense fallback={null}><Home /></Suspense>
}
export function LazyPageRoute() {
  return <Suspense fallback={null}><Page /></Suspense>
}

const Engineering = lazy(() => import('./Engineering').then((m) => ({ default: m.Engineering })))
export function LazyEngineering() {
  return <Suspense fallback={blank}><Engineering /></Suspense>
}

const Invite = lazy(() => import('./InvitePage').then((m) => ({ default: m.InvitePage })))
const Save = lazy(() => import('./SavePage').then((m) => ({ default: m.SavePage })))
export function LazyInvite() {
  return <Suspense fallback={blank}><Invite /></Suspense>
}
export function LazySave() {
  return <Suspense fallback={blank}><Save /></Suspense>
}
