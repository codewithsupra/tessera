import { classifyError, isChannel } from './transport'

describe('classifyError', () => {
  it('treats network failures as offline', () => {
    expect(classifyError({ message: 'TypeError: Failed to fetch' }, 'read')).toBe('offline')
    expect(classifyError({ statusCode: 0, message: 'x' }, 'append')).toBe('offline')
    expect(classifyError({ code: '08006', message: 'connection failure' }, 'read')).toBe('offline')
    expect(classifyError({ statusCode: 503, code: 'PGRST000', message: 'down' }, 'read')).toBe('offline')
  })
  it('treats an append to an unknown page as missing-page (retryable)', () => {
    expect(classifyError({ code: '42501', message: 'new row violates row-level security policy' }, 'append')).toBe('missing-page')
    expect(classifyError({ code: '23503', message: 'violates foreign key constraint' }, 'append')).toBe('missing-page')
  })
  it('treats a permission error on reads as forbidden', () => {
    expect(classifyError({ code: '42501', message: 'permission denied' }, 'read')).toBe('forbidden')
  })
  it('falls back to unknown', () => {
    expect(classifyError(null, 'read')).toBe('unknown')
    expect(classifyError({ code: '22P02', message: 'invalid input' }, 'read')).toBe('unknown')
  })
})

describe('isChannel', () => {
  it('matches the channel with or without the realtime: prefix the server adds', () => {
    expect(isChannel({ channel: 'realtime:doc:abc' }, 'doc:abc')).toBe(true)
    expect(isChannel({ channel: 'doc:abc' }, 'doc:abc')).toBe(true)
    expect(isChannel({ channel: 'realtime:doc:abcd' }, 'doc:abc')).toBe(false)
    expect(isChannel({ channel: 'realtime:ws:abc' }, 'doc:abc')).toBe(false)
    expect(isChannel(undefined, 'doc:abc')).toBe(false)
  })
})
