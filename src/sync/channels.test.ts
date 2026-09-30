import { ChannelRefs, type ChannelClient } from './channels'

function fakeClient(fail = new Set<string>()) {
  const joined = new Set<string>()
  const client: ChannelClient = {
    async subscribe(ch) {
      if (fail.has(ch)) return { ok: false, error: { message: 'Not authorized' } }
      joined.add(ch)
      return { ok: true }
    },
    unsubscribe(ch) {
      joined.delete(ch)
    },
  }
  return { client, joined }
}

describe('ChannelRefs', () => {
  it('keeps a channel while any holder remains (StrictMode remount race)', async () => {
    const { client, joined } = fakeClient()
    const refs = new ChannelRefs(client)
    const first = await refs.join('doc:1') // mount
    const second = await refs.join('doc:1') // remount before the first cleanup finishes
    first.release?.() // late cleanup from the first mount
    expect(joined.has('doc:1')).toBe(true)
    second.release?.()
    expect(joined.has('doc:1')).toBe(false)
  })

  it('ignores double release', async () => {
    const { client, joined } = fakeClient()
    const refs = new ChannelRefs(client)
    const a = await refs.join('ws:1')
    const b = await refs.join('ws:1')
    a.release?.()
    a.release?.()
    expect(joined.has('ws:1')).toBe(true)
    expect(refs.holders('ws:1')).toBe(1)
    b.release?.()
    expect(refs.holders('ws:1')).toBe(0)
  })

  it('holds nothing when the subscribe is refused or throws', async () => {
    const { client } = fakeClient(new Set(['doc:secret']))
    const refs = new ChannelRefs(client)
    const res = await refs.join('doc:secret')
    expect(res.ok).toBe(false)
    expect(res.release).toBeUndefined()
    expect(refs.holders('doc:secret')).toBe(0)

    const throwing = new ChannelRefs({ subscribe: () => Promise.reject(new Error('socket down')), unsubscribe: () => {} })
    const r2 = await throwing.join('doc:x')
    expect(r2).toMatchObject({ ok: false, error: { code: 'CONNECTION_FAILED' } })
    expect(throwing.holders('doc:x')).toBe(0)
  })
})
