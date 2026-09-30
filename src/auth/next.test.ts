import { rememberNext, safeNext, takeRememberedNext, withNext } from './next'

describe('safeNext', () => {
  it('accepts in-app paths', () => {
    expect(safeNext('?next=%2Finvite%2Fabc')).toBe('/invite/abc')
    expect(safeNext('?next=/app/p/1?x=1#h')).toBe('/app/p/1?x=1#h')
  })
  it('rejects anything that could leave the app', () => {
    for (const bad of ['?next=https://evil.test', '?next=//evil.test', '?next=/\\evil.test', '?next=javascript:alert(1)', '?next=evil', '', '?next='])
      expect(safeNext(bad)).toBe('/app')
  })
  it('round-trips through withNext', () => {
    expect(safeNext(withNext('/signin', '/invite/t0k3n').slice('/signin'.length))).toBe('/invite/t0k3n')
  })
})

describe('remembered next (OAuth round-trip)', () => {
  it('is consumed once and re-validated', () => {
    rememberNext('/invite/abc')
    expect(takeRememberedNext()).toBe('/invite/abc')
    expect(takeRememberedNext()).toBeNull()
    sessionStorage.setItem('tessera:after-oauth', 'https://evil.test')
    expect(takeRememberedNext()).toBeNull()
    rememberNext('/app')
    expect(takeRememberedNext()).toBeNull()
  })
})
