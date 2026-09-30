import { Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { PublicOnly, RequireAuth } from './auth/guards'
import { AppShell } from './pages/AppShell'
import { AuthPage } from './pages/AuthPage'
import { Landing } from './pages/Landing'

const rootRoute = createRootRoute({ component: Outlet })

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <PublicOnly><Landing /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signin', component: () => <PublicOnly><AuthPage mode="signin" /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signup', component: () => <PublicOnly><AuthPage mode="signup" /></PublicOnly> }),
  createRoute({ getParentRoute: () => rootRoute, path: '/app', component: () => <RequireAuth><AppShell /></RequireAuth> }),
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
