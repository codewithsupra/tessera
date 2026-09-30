import { Outlet, createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { PublicOnly, RequireAuth } from './auth/guards'
import { AuthPage } from './pages/AuthPage'
import { Landing } from './pages/Landing'

const rootRoute = createRootRoute({ component: Outlet })

// The signed-in app (local DB, sidebar, editor) loads separately from the landing and auth pages.
const AppLayout = lazyRouteComponent(() => import('./pages/AppShell'), 'AppLayout')
const AppHome = lazyRouteComponent(() => import('./pages/AppShell'), 'AppHome')
const PageRoute = lazyRouteComponent(() => import('./pages/AppShell'), 'PageRoute')

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: () => (
    <RequireAuth>
      <AppLayout />
    </RequireAuth>
  ),
})

const pageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/p/$pageId',
  component: PageRoute,
})

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <PublicOnly><Landing /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: () => <PublicOnly><AuthPage mode="signin" /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: () => <PublicOnly><AuthPage mode="signup" /></PublicOnly> }),
  appRoute.addChildren([createRoute({ getParentRoute: () => appRoute, path: '/', component: AppHome }), pageRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
