vi.mock('../lib/insforge', () => ({ insforge: {} }))
const { canEdit, inviteUrl, isPending, newInviteToken, sha256Hex, sortWorkspaces } = await import('./workspaces')

describe('workspace helpers', () => {
  it('orders personal first, then teams by name', () => {
    const list = sortWorkspaces([
      { id: 'b', name: 'Beta', isPersonal: false, role: 'viewer' },
      { id: 'p', name: 'Personal', isPersonal: true, role: 'owner' },
      { id: 'a', name: 'Acme', isPersonal: false, role: 'editor' },
    ])
    expect(list.map((w) => w.id)).toEqual(['p', 'a', 'b'])
  })

  it('knows who can edit', () => {
    expect([canEdit('owner'), canEdit('editor'), canEdit('viewer'), canEdit(undefined)]).toEqual([true, true, false, false])
  })

  it('makes unguessable, URL-safe invite tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, newInviteToken))
    expect(tokens.size).toBe(200)
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes of entropy
    }
    expect(inviteUrl('abc', 'https://x.test')).toBe('https://x.test/invite/abc')
  })

  it('hashes tokens exactly like Postgres sha256()', async () => {
    // select encode(sha256(convert_to('hello', 'UTF8')), 'hex')
    expect(await sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('treats accepted, withdrawn and expired invites as not pending', () => {
    const base = { id: '1', email: 'a@b.co', role: 'editor' as const, acceptedAt: null, revokedAt: null }
    const now = Date.parse('2026-01-10T00:00:00Z')
    expect(isPending({ ...base, expiresAt: '2026-01-11T00:00:00Z' }, now)).toBe(true)
    expect(isPending({ ...base, expiresAt: '2026-01-09T00:00:00Z' }, now)).toBe(false)
    expect(isPending({ ...base, expiresAt: '2026-01-11T00:00:00Z', acceptedAt: 'x' }, now)).toBe(false)
    expect(isPending({ ...base, expiresAt: '2026-01-11T00:00:00Z', revokedAt: 'x' }, now)).toBe(false)
  })
})
