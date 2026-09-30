import { matchShortcut, shortcutList } from './shortcuts'

const key = (k: Partial<Parameters<typeof matchShortcut>[0]>) => ({ key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: document.body, ...k })

describe('matchShortcut', () => {
  it('uses ⌘ on Mac and Ctrl elsewhere', () => {
    expect(matchShortcut(key({ key: 'k', metaKey: true }), true)).toBe('palette')
    expect(matchShortcut(key({ key: 'k', ctrlKey: true }), true)).toBeNull()
    expect(matchShortcut(key({ key: 'K', ctrlKey: true }), false)).toBe('palette')
    expect(matchShortcut(key({ key: 'k', metaKey: true }), false)).toBeNull()
  })
  it('toggles the sidebar with mod+\\', () => {
    expect(matchShortcut(key({ key: '\\', ctrlKey: true }), false)).toBe('toggleSidebar')
  })
  it('creates a page with Alt+N, even when a Mac turns it into ˜', () => {
    expect(matchShortcut(key({ key: '˜', code: 'KeyN', altKey: true }), true)).toBe('newPage')
    expect(matchShortcut(key({ key: 'n', altKey: true }), false)).toBe('newPage')
    expect(matchShortcut(key({ key: 'n', altKey: true, ctrlKey: true }), false)).toBeNull()
  })
  it('opens help with ? but never while typing', () => {
    expect(matchShortcut(key({ key: '?' }))).toBe('help')
    const input = document.createElement('input')
    expect(matchShortcut(key({ key: '?', target: input }))).toBeNull()
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // jsdom doesn't compute isContentEditable; emulate a browser.
    Object.defineProperty(editable, 'isContentEditable', { value: true })
    expect(matchShortcut(key({ key: '?', target: editable }))).toBeNull()
  })
  it('ignores ordinary typing', () => {
    expect(matchShortcut(key({ key: 'k' }))).toBeNull()
    expect(matchShortcut(key({ key: 'n' }))).toBeNull()
  })
  it('labels shortcuts for the platform', () => {
    expect(shortcutList(true)[0].keys).toEqual(['⌘', 'K'])
    expect(shortcutList(false)[0].keys).toEqual(['Ctrl', 'K'])
  })
})
