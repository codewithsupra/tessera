import { useState } from 'react'
import { niceMax } from './format'

export type Series = { key: string; label: string; color: string }
export type Point = { day: string; [key: string]: string | number }

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * Daily bars, optionally stacked. Thin bars, 4px rounded tops anchored to the baseline,
 * a 2px surface gap between stacked segments, recessive axis, per-bar hover tooltip.
 */
export function DailyBars({ data, series, height = 180, label }: { data: Point[]; series: Series[]; height?: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const pad = { top: 12, right: 8, bottom: 22, left: 30 }
  const innerW = W - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const totals = data.map((d) => series.reduce((s, x) => s + Number(d[x.key] ?? 0), 0))
  const max = niceMax(Math.max(0, ...totals))
  const slot = innerW / Math.max(1, data.length)
  const barW = Math.max(3, Math.min(18, slot * 0.6))
  const y = (v: number) => (v / max) * innerH

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" role="img" aria-label={label}>
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={pad.top + innerH - y(t)} y2={pad.top + innerH - y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.left - 6} y={pad.top + innerH - y(t) + 4} fontSize={10} textAnchor="end" fill="var(--ink-faint)">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2
          let base = pad.top + innerH
          const segs = series.map((s, si) => {
            const v = Number(d[s.key] ?? 0)
            const h = y(v)
            const isTop = series.slice(si + 1).every((later) => Number(d[later.key] ?? 0) === 0)
            const gap = si > 0 && h > 0 ? 2 : 0
            const top = base - h
            const rect = h > 0 ? <path key={s.key} d={roundedTop(x, top + gap, barW, Math.max(0, h - gap), isTop ? 4 : 0)} fill={s.color} /> : null
            base = top
            return rect
          })
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* hit target larger than the mark */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} fill="transparent" />
              {segs}
            </g>
          )
        })}
        <text x={pad.left} y={height - 6} fontSize={10} fill="var(--ink-faint)">
          {data[0] ? fmtDay(data[0].day) : ''}
        </text>
        <text x={W - pad.right} y={height - 6} fontSize={10} textAnchor="end" fill="var(--ink-faint)">
          {data.at(-1) ? fmtDay(data.at(-1)!.day) : ''}
        </text>
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
          style={{ left: `min(max(0px, ${((pad.left + hover * slot) / W) * 100}% - 60px), calc(100% - 140px))` }}
          role="status"
        >
          <p className="font-medium text-ink">{fmtDay(data[hover].day)}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-1.5 text-ink-soft">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
              {s.label}: <span className="text-ink">{Number(data[hover][s.key] ?? 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-4 text-xs text-ink-soft" aria-label="Legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  )
}

/** Table view of the same data, for screen readers and exact numbers. */
export function DataTable({ data, series }: { data: Point[]; series: Series[] }) {
  return (
    <details className="mt-2 text-xs text-ink-soft">
      <summary className="cursor-pointer select-none hover:text-ink">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            <th className="py-1 font-medium">Day</th>
            {series.map((s) => (
              <th key={s.key} className="py-1 text-right font-medium">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day} className="border-t border-line">
              <td className="py-1">{fmtDay(d.day)}</td>
              {series.map((s) => (
                <td key={s.key} className="py-1 text-right tabular-nums text-ink">{Number(d[s.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** Horizontal bars for a funnel: one series, every bar direct-labeled with its count. */
export function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <ol className="space-y-2">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate text-ink-soft">{s.label}</span>
          <span className="h-3 rounded-r-[4px] bg-viz-1" style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} aria-hidden="true" />
          <span className="text-right tabular-nums text-ink">{s.value}</span>
        </li>
      ))}
    </ol>
  )
}
