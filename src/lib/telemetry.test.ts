vi.mock('./insforge', () => ({ insforge: {} }))
const { flush, reportError, resetTelemetry, setTelemetrySender, track } = await import('./telemetry')

function fakeSender() {
  const events: { name: string; props: object }[][] = []
  const errors: { message: string; stack: string | null }[] = []
  setTelemetrySender({
    events: async (rows) => void events.push(rows),
    error: async (row) => void errors.push(row),
  })
  return { events, errors }
}

beforeEach(() => resetTelemetry())
afterEach(() => setTelemetrySender(null))

describe('track', () => {
  it('batches events into one request', async () => {
    const s = fakeSender()
    track('page_created')
    track('invite_created', { role: 'editor' })
    await flush()
    expect(s.events).toHaveLength(1)
    expect(s.events[0].map((e) => e.name)).toEqual(['page_created', 'invite_created'])
  })

  it('flushes automatically after a short delay', async () => {
    vi.useFakeTimers()
    try {
      const s = fakeSender()
      track('signed_in')
      await vi.advanceTimersByTimeAsync(2100)
      expect(s.events).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('drops events while offline instead of queueing them', async () => {
    const s = fakeSender()
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    track('page_created')
    await flush()
    spy.mockRestore()
    await flush()
    expect(s.events).toHaveLength(0)
  })

  it('caps the queue', async () => {
    const s = fakeSender()
    for (let i = 0; i < 80; i++) track('page_created')
    await flush()
    expect(s.events[0]).toHaveLength(50)
  })

  it('never throws when sending fails', async () => {
    setTelemetrySender({ events: () => Promise.reject(new Error('down')), error: () => Promise.reject(new Error('down')) })
    track('page_created')
    await expect(flush()).resolves.toBeUndefined()
    expect(() => reportError(new Error('x'))).not.toThrow()
  })
})

describe('reportError', () => {
  it('reports each distinct error once', () => {
    const s = fakeSender()
    const err = new Error('boom')
    reportError(err)
    reportError(err)
    reportError(new Error('other'))
    expect(s.errors.map((e) => e.message)).toEqual(['boom', 'other'])
  })

  it('accepts non-Error values and adds context', () => {
    const s = fakeSender()
    reportError('plain string', 'promise')
    reportError({ code: 42 })
    expect(s.errors[0].message).toBe('[promise] plain string')
    expect(s.errors[1].message).toBe('{"code":42}')
  })

  it('stops after 10 reports per session and clips long fields', () => {
    const s = fakeSender()
    for (let i = 0; i < 15; i++) reportError(new Error(`e${i}`))
    expect(s.errors).toHaveLength(10)
    resetTelemetry()
    const e = new Error('m'.repeat(5000))
    e.stack = 's'.repeat(9000)
    reportError(e)
    expect(s.errors.at(-1)!.message.length).toBe(1000)
    expect(s.errors.at(-1)!.stack!.length).toBe(4000)
  })
})
