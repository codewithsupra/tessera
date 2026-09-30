import { paletteFilter } from './paletteFilter'

describe('palette ranking', () => {
  it('ranks a page by its own title above pages filed under it', () => {
    const parent = paletteFilter('page p1', 'launch plan', ['Launch plan', ''])
    const child = paletteFilter('page p2', 'launch plan', ['Partner list', 'Launch plan'])
    expect(parent).toBeGreaterThan(child)
    expect(child).toBeGreaterThan(0) // still findable by where it lives
  })

  it('still finds commands by their synonyms', () => {
    expect(paletteFilter('toggle theme', 'dark', ['Change theme', 'dark', 'light'])).toBeGreaterThan(0)
  })

  it('hides items that match nothing', () => {
    expect(paletteFilter('page p1', 'zebra', ['Launch plan', ''])).toBe(0)
  })
})
