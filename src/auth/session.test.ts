import { isUnreachable, readCachedUser, resolveSession, writeCachedUser } from './session'

const ada = { id: 'u1', email: 'ada@example.com', name: 'Ada' }
const bob = { id: 'u2', email: 'bob@example.com' }

describe('resolveSession', () => {
  it('prefers the server user', () => {
    expect(resolveSession({ user: bob, error: null }, ada)).toEqual(bob)
  })
  it('signs out when the server says there is no session', () => {
    expect(resolveSession({ user: null, error: null }, ada)).toBeNull()
    expect(resolveSession({ user: null, error: { statusCode: 401 } }, ada)).toBeNull()
  })
  it('falls back to the cached user when the server is unreachable', () => {
    for (const statusCode of [0, 408, 502, 503]) {
      expect(resolveSession({ user: null, error: { statusCode } }, ada)).toEqual(ada)
    }
    expect(resolveSession({ user: null, error: {} }, ada)).toEqual(ada)
  })
  it('stays signed out offline when nobody signed in before', () => {
    expect(resolveSession({ user: null, error: { statusCode: 0 } }, null)).toBeNull()
  })
})

describe('isUnreachable', () => {
  it('treats client errors as definitive', () => {
    expect(isUnreachable({ statusCode: 400 })).toBe(false)
    expect(isUnreachable({ statusCode: 403 })).toBe(false)
    expect(isUnreachable(null)).toBe(false)
  })
})

describe('cached user', () => {
  beforeEach(() => localStorage.clear())
  it('round-trips only safe fields', () => {
    writeCachedUser({ ...ada, token: 'secret' } as never)
    expect(readCachedUser()).toEqual(ada)
    expect(localStorage.getItem('tessera:last-user')).not.toContain('secret')
  })
  it('clears on sign out and ignores corrupt data', () => {
    writeCachedUser(ada)
    writeCachedUser(null)
    expect(readCachedUser()).toBeNull()
    localStorage.setItem('tessera:last-user', '{not json')
    expect(readCachedUser()).toBeNull()
    localStorage.setItem('tessera:last-user', '{"id":1}')
    expect(readCachedUser()).toBeNull()
  })
})
