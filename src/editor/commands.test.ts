import { filterCommands, slashCommands } from './commands'
import { useSlashStore } from './slashStore'

const ids = (q: string) => filterCommands(q).map((c) => c.id)

describe('filterCommands', () => {
  it('returns everything for an empty query', () => {
    expect(filterCommands('  ')).toHaveLength(slashCommands.length)
  })
  it('ranks title prefix matches first', () => {
    expect(ids('head')).toEqual(['h1', 'h2', 'h3'])
    expect(ids('to')[0]).toBe('todo')
  })
  it('matches word prefixes and keywords', () => {
    expect(ids('list')).toEqual(['todo', 'bullet', 'numbered'])
    expect(ids('task')).toEqual(['todo'])
    expect(ids('hr')).toEqual(['divider'])
    expect(ids('```')).toEqual(['code'])
  })
  it('is case-insensitive and returns nothing for gibberish', () => {
    expect(ids('QUOTE')).toEqual(['quote'])
    expect(ids('zzzz')).toEqual([])
  })
})

describe('slash store', () => {
  beforeEach(() => useSlashStore.getState().hide())

  it('wraps selection with arrow keys and clamps on refilter', () => {
    const s = useSlashStore.getState
    s().show(slashCommands.slice(0, 3), null, () => {})
    s().move(-1)
    expect(s().index).toBe(2)
    s().move(1)
    expect(s().index).toBe(0)
    s().move(1)
    s().move(1)
    s().show(slashCommands.slice(0, 1), null, () => {})
    expect(s().index).toBe(0)
  })

  it('resets on hide and ignores moves with no items', () => {
    const s = useSlashStore.getState
    s().show([], null, () => {})
    s().move(1)
    expect(s().index).toBe(0)
    s().hide()
    expect(s().open).toBe(false)
  })
})
