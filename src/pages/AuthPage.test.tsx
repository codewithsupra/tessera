import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AuthContext, type AuthValue } from '../auth/context'
import { AuthPage } from './AuthPage'
import { validate } from './authValidation'

describe('validate', () => {
  it('requires a name on sign up only', () => {
    expect(validate('signup', ' ', 'a@b.co', '12345678')).toBe('Enter your name.')
    expect(validate('signin', '', 'a@b.co', '12345678')).toBeNull()
  })
  it('rejects malformed emails', () => {
    for (const bad of ['', 'a', 'a@b', 'a b@c.io', '@c.io']) {
      expect(validate('signin', '', bad, '12345678')).toBe('Enter a valid email address.')
    }
  })
  it('enforces the 8 character password minimum', () => {
    expect(validate('signin', '', 'a@b.co', '1234567')).toMatch(/8 characters/)
    expect(validate('signin', '', 'a@b.co', '12345678')).toBeNull()
  })
})

function renderAuth(mode: 'signin' | 'signup', overrides: Partial<AuthValue> = {}) {
  const auth: AuthValue = {
    user: null,
    loading: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn(),
    ...overrides,
  }
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/auth', component: () => <AuthPage mode={mode} /> }),
      createRoute({ getParentRoute: () => root, path: '/app', component: () => <p>app home</p> }),
      createRoute({ getParentRoute: () => root, path: '/signin', component: () => <p>signin</p> }),
      createRoute({ getParentRoute: () => root, path: '/signup', component: () => <p>signup</p> }),
      createRoute({ getParentRoute: () => root, path: '/', component: () => <p>home</p> }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/auth'] }),
  })
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return auth
}

describe('AuthPage', () => {
  it('shows a validation error and does not call the backend', async () => {
    const auth = renderAuth('signin')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.')
    expect(auth.signIn).not.toHaveBeenCalled()
  })

  it('signs in with trimmed email and navigates to the app', async () => {
    const auth = renderAuth('signin')
    await userEvent.type(await screen.findByLabelText('Email'), '  ada@example.com ')
    await userEvent.type(screen.getByLabelText('Password'), 'correct horse')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(auth.signIn).toHaveBeenCalledWith('ada@example.com', 'correct horse')
    await waitFor(() => expect(screen.getByText('app home')).toBeInTheDocument())
  })

  it('shows the backend error and stays on the page', async () => {
    renderAuth('signin', { signIn: vi.fn().mockResolvedValue({ error: 'Invalid credentials' }) })
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass1')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials')
    expect(screen.queryByText('app home')).not.toBeInTheDocument()
  })

  it('signs up with name, email and password', async () => {
    const auth = renderAuth('signup')
    await userEvent.type(await screen.findByLabelText('Name'), 'Ada')
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'longenough')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(auth.signUp).toHaveBeenCalledWith('Ada', 'ada@example.com', 'longenough')
  })

  it('starts OAuth with the chosen provider', async () => {
    const auth = renderAuth('signin')
    await userEvent.click(await screen.findByRole('button', { name: 'Continue with GitHub' }))
    expect(auth.signInWithOAuth).toHaveBeenCalledWith('github', '/app')
  })
})
