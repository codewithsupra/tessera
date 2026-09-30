import { isGuestEmail, newGuestCredentials, readGuest, writeGuest } from './guest'

describe('guest identity', () => {
  it('generates unique credentials in the reserved shape', () => {
    const a = newGuestCredentials()
    const b = newGuestCredentials()
    expect(isGuestEmail(a.email)).toBe(true)
    expect(a.email).not.toBe(b.email)
    expect(a.password.length).toBeGreaterThanOrEqual(40)
  })

  it('matches the server’s definition exactly', () => {
    expect(isGuestEmail('guest-8f14e45f-ceea-467a-9575-7d1e3f2a0b11@guest.tessera-notes.app')).toBe(true)
    expect(isGuestEmail('GUEST-8F14E45F-CEEA-467A-9575-7D1E3F2A0B11@GUEST.TESSERA-NOTES.APP')).toBe(true)
    for (const bad of ['ada@example.com', 'guest-x@guest.tessera-notes.app', 'guest-8f14e45f-ceea-467a-9575-7d1e3f2a0b11@evil.app', '', null, undefined])
      expect(isGuestEmail(bad)).toBe(false)
  })

  it('remembers guests on this device and rejects tampered entries', () => {
    const g = newGuestCredentials()
    writeGuest(g)
    expect(readGuest()).toEqual(g)
    writeGuest(null)
    expect(readGuest()).toBeNull()
    localStorage.setItem('tessera:guest', JSON.stringify({ email: 'ada@example.com', password: 'x' }))
    expect(readGuest()).toBeNull()
    localStorage.setItem('tessera:guest', '{broken')
    expect(readGuest()).toBeNull()
  })
})
