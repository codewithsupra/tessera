import { act, fireEvent, render, screen } from '@testing-library/react'
import { useToasts, toast } from './toastStore'
import { Toaster } from './Toaster'
import { applyTheme, useTheme } from '../lib/theme'

vi.mock('../lib/insforge', () => ({ insforge: {} }))
const telemetry = await import('../lib/telemetry')
const { ErrorBoundary } = await import('./ErrorBoundary')

describe('toasts', () => {
  beforeEach(() => useToasts.setState({ toasts: [] }))

  it('shows, dedupes, caps and dismisses', () => {
    render(<Toaster />)
    act(() => {
      toast.info('Copied')
      toast.info('Copied')
      toast.success('Two')
      toast.error('Three')
      toast.info('Four')
    })
    expect(screen.queryAllByText('Copied')).toHaveLength(0) // pushed out by the cap of 3
    expect(screen.getByText('Four')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Three')
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0])
    expect(useToasts.getState().toasts).toHaveLength(2)
  })

  it('expires on its own', () => {
    vi.useFakeTimers()
    try {
      act(() => void useToasts.getState().push('Brief', 'info', 1000))
      act(() => void vi.advanceTimersByTime(1100))
      expect(useToasts.getState().toasts).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ErrorBoundary', () => {
  it('renders a recovery UI and reports the error', () => {
    const errors: string[] = []
    telemetry.resetTelemetry()
    telemetry.setTelemetrySender({ events: async () => {}, error: async (r) => void errors.push(r.message) })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let explode = true
    function Bomb() {
      if (explode) throw new Error('kaboom')
      return <p>recovered</p>
    }
    render(
      <ErrorBoundary label="page">
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong here')
    expect(errors).toEqual(['[page] kaboom'])
    explode = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
    spy.mockRestore()
    telemetry.setTelemetrySender(null)
  })
})

describe('theme', () => {
  it('cycles system → light → dark and persists', () => {
    const root = document.documentElement
    useTheme.getState().set('system')
    expect(root.hasAttribute('data-theme')).toBe(false)
    useTheme.getState().cycle()
    expect(root.getAttribute('data-theme')).toBe('light')
    useTheme.getState().cycle()
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('tessera:theme')).toBe('dark')
    useTheme.getState().cycle()
    expect(root.hasAttribute('data-theme')).toBe(false)
    applyTheme('light', root)
    expect(root.getAttribute('data-theme')).toBe('light')
    applyTheme('system', root)
  })
})
