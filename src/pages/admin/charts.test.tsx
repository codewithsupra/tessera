import { fireEvent, render, screen } from '@testing-library/react'
import { DailyBars, Funnel, Legend } from './charts'
import { niceMax, pct } from './format'

describe('chart helpers', () => {
  it('rounds the axis up to 1-2-5 steps', () => {
    expect([0, 1, 3, 7, 12, 49, 51, 999].map(niceMax)).toEqual([1, 1, 5, 10, 20, 50, 100, 1000])
  })
  it('formats percentages and guards divide-by-zero', () => {
    expect(pct(1, 4)).toBe('25%')
    expect(pct(3, 0)).toBe('—')
  })
})

describe('DailyBars', () => {
  const data = [
    { day: '2026-09-28', real: 2, guest: 1 },
    { day: '2026-09-29', real: 0, guest: 0 },
    { day: '2026-09-30', real: 1, guest: 3 },
  ]
  const series = [
    { key: 'real', label: 'Accounts', color: 'var(--viz-1)' },
    { key: 'guest', label: 'Guests', color: 'var(--viz-2)' },
  ]
  it('draws one mark per non-zero segment and names the chart', () => {
    const { container } = render(<DailyBars data={data} series={series} label="Sign-ups" />)
    expect(screen.getByRole('img', { name: 'Sign-ups' })).toBeInTheDocument()
    expect(container.querySelectorAll('path')).toHaveLength(4)
  })
  it('shows a tooltip with every series on hover', () => {
    const { container } = render(<DailyBars data={data} series={series} label="Sign-ups" />)
    fireEvent.mouseEnter(container.querySelectorAll('svg > g')[3 + 2]) // after 3 gridline groups
    const tip = screen.getByRole('status')
    expect(tip).toHaveTextContent('Accounts: 1')
    expect(tip).toHaveTextContent('Guests: 3')
  })
})

describe('Legend and Funnel', () => {
  it('omits the legend for a single series', () => {
    const { container } = render(<Legend series={[{ key: 'a', label: 'A', color: 'red' }]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('labels every funnel step with its count', () => {
    render(<Funnel steps={[{ label: 'Visited', value: 10 }, { label: 'Signed up', value: 2 }]} />)
    expect(screen.getByText('Visited').nextSibling?.nextSibling).toHaveTextContent('10')
    expect(screen.getByText('Signed up').nextSibling?.nextSibling).toHaveTextContent('2')
  })
})
