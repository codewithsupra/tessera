import { functionErrorMessage } from './functionError'

describe('functionErrorMessage', () => {
  it('prefers the server message from the body', () => {
    expect(functionErrorMessage({ message: '', error: 'The save link expired.' })).toBe('The save link expired.')
  })
  it('falls back to message, then a default', () => {
    expect(functionErrorMessage({ message: 'Network down' })).toBe('Network down')
    expect(functionErrorMessage({ message: '', error: '  ' })).toBe('Something went wrong. Please try again.')
    expect(functionErrorMessage(null, 'x')).toBe('x')
  })
})
