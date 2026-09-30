import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { PublicOnly, RequireAuth } from './auth/guards'
import { AuthPage } from './pages/AuthPage'
import { LazyAppHome, LazyAppLayout, LazyPageRoute } from './pages/lazyApp'
import { InvitePage } from './pages/InvitePage'
import { Landing } from './pages/Landing'

const rootRoute = createRootRoute({ component: Outlet })

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: () => (
    <RequireAuth>
      <LazyAppLayout />
    </RequireAuth>
  ),
})

const pageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/p/$pageId',
  component: LazyPageRoute,
})

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <PublicOnly><Landing /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: () => <PublicOnly><AuthPage mode="signin" /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: () => <PublicOnly><AuthPage mode="signup" /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/invite/$token', component: InvitePage }),
  appRoute.addChildren([createRoute({ getParentRoute: () => appRoute, path: '/', component: LazyAppHome }), pageRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
