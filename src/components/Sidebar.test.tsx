import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { AuthContext, type AuthValue } from '../auth/context'
import { db } from '../data/db'
import { createPage, setPageTitle } from '../data/pages'
import { useUiStore } from '../data/uiStore'
import { localWorkspaceId } from '../data/workspace'
import { Sidebar } from './Sidebar'

const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' }
const ws = localWorkspaceId(user.id)

function renderSidebar() {
  const auth = { user, loading: false, signIn: vi.fn(), signUp: vi.fn(), signInWithOAuth: vi.fn(), signOut: vi.fn() } as AuthValue
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/app', component: Sidebar }),
      createRoute({ getParentRoute: () => root, path: '/app/p/$pageId', component: Sidebar }),
      createRoute({ getParentRoute: () => root, path: '/', component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/app'] }),
  })
  render(
    <AuthContext.Provider value={auth}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

beforeEach(async () => {
  await db.pages.clear()
  useUiStore.setState({ expanded: {} })
})

describe('Sidebar', () => {
  it('shows only this workspace’s pages, nested, with Untitled for blanks', async () => {
    const a = await createPage(ws)
    await setPageTitle(a.id, 'Launch plan')
    await createPage(ws, a.id)
    await createPage('local:someone-else')
    useUiStore.getState().expand(a.id)

    renderSidebar()
    const tree = await screen.findByRole('tree', { name: 'Page tree' })
    expect(await within(tree).findByText('Launch plan')).toBeInTheDocument()
    expect(within(tree).getByText('Untitled')).toBeInTheDocument()
    expect(within(tree).getAllByRole('treeitem')).toHaveLength(2)
  })

  it('creates a page and navigates to it', async () => {
    const router = renderSidebar()
    await userEvent.click(await screen.findByRole('button', { name: 'New page' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/app\/p\//))
    const rows = await db.pages.toArray()
    expect(rows).toHaveLength(1)
    expect(router.state.location.pathname).toBe(`/app/p/${rows[0].id}`)
  })

  it('moves a page to Trash and restores it', async () => {
    const a = await createPage(ws)
    await setPageTitle(a.id, 'Old draft')
    renderSidebar()

    await userEvent.click(await screen.findByRole('button', { name: 'Move Old draft to Trash' }))
    await waitFor(() => expect(screen.getByText('No pages yet.')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /^Trash/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Restore Old draft' }))
    const tree = screen.getByRole('tree', { name: 'Page tree' })
    expect(await within(tree).findByText('Old draft')).toBeInTheDocument()
  })
})
