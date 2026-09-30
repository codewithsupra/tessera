import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { PublicOnly, RequireAuth } from './auth/guards'
import { AuthPage } from './pages/AuthPage'
import { LazyAppHome, LazyAppLayout, LazyEngineering, LazyInvite, LazyPageRoute, LazySave } from './pages/lazyApp'
import { Landing } from './pages/Landing'
import { NotFound } from './pages/NotFound'

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFound })

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
  createRoute({ getParentRoute: () => rootRoute, path: '/invite/$token', component: LazyInvite }),
  createRoute({ getParentRoute: () => rootRoute, path: '/engineering', component: LazyEngineering }),
  createRoute({ getParentRoute: () => rootRoute, path: '/save', component: () => <RequireAuth><LazySave /></RequireAuth> }),
  appRoute.addChildren([createRoute({ getParentRoute: () => appRoute, path: '/', component: LazyAppHome }), pageRoute]),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
