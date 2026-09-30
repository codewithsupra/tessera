import { peersFrom } from './peers'

describe('peersFrom', () => {
  it('lists other users once each, excluding me and anonymous states', () => {
    const states = new Map<number, Record<string, unknown>>([
      [1, { user: { name: 'Me', id: 'u-me' } }],
      [2, { user: { name: 'Me', id: 'u-me' } }], // my other tab
      [3, { user: { name: 'Leo', id: 'u-leo', color: '#123456' } }],
      [4, { user: { name: 'Leo', id: 'u-leo' } }], // Leo's other tab
      [5, { user: { name: 'Asha', id: 'u-asha' } }],
      [6, {}],
    ])
    expect(peersFrom(states, 1, 'u-me')).toEqual([
      { key: 'u-leo', name: 'Leo', color: '#123456' },
      { key: 'u-asha', name: 'Asha', color: '#737d8f' },
    ])
  })
})
