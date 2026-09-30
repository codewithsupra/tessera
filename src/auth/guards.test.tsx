import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AuthContext, type AuthValue } from './context'

import { PublicOnly, RequireAuth } from './guards'

function renderAt(path: string, auth: Partial<AuthValue>) {
  const value = { user: null, loading: false, signIn: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn(), ...auth } as AuthValue
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/signin', component: () => <PublicOnly><p>signin page</p></PublicOnly> }),
      createRoute({ getParentRoute: () => root, path: '/app', component: () => <RequireAuth><p>private app</p></RequireAuth> }),
    ]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<AuthContext.Provider value={value}><RouterProvider router={router} /></AuthContext.Provider>)
}

const ada = { id: 'u1', email: 'ada@example.com' }

describe('route guards', () => {
  it('redirects signed-out users away from /app', async () => {
    renderAt('/app', { user: null })
    expect(await screen.findByText('signin page')).toBeInTheDocument()
    expect(screen.queryByText('private app')).not.toBeInTheDocument()
  })
  it('lets signed-in users into /app', async () => {
    renderAt('/app', { user: ada })
    expect(await screen.findByText('private app')).toBeInTheDocument()
  })
  it('sends signed-in users from /signin to /app', async () => {
    renderAt('/signin', { user: ada })
    expect(await screen.findByText('private app')).toBeInTheDocument()
  })
  it('renders nothing private while auth is loading', async () => {
    renderAt('/app', { user: null, loading: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText('private app')).not.toBeInTheDocument()
    expect(screen.queryByText('signin page')).not.toBeInTheDocument()
  })
})
