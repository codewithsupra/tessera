import { CURSOR_COLORS, colorFor, initials } from './identity'

describe('identity', () => {
  it('gives each user a stable color from the palette', () => {
    expect(colorFor('user-1')).toBe(colorFor('user-1'))
    expect(CURSOR_COLORS).toContain(colorFor('anything'))
    const spread = new Set(Array.from({ length: 50 }, (_, i) => colorFor(`u${i}`)))
    expect(spread.size).toBeGreaterThan(4)
  })
  it('derives initials from names and emails', () => {
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(initials('ada@example.com')).toBe('AE')
    expect(initials('Plato')).toBe('P')
    expect(initials('  ')).toBe('?')
  })
})
