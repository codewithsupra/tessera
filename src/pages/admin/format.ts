/** A "nice" axis maximum: 1, 2, 5 × 10^n at or above the data max. */
export function niceMax(max: number): number {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  for (const m of [1, 2, 5, 10]) if (m * pow >= max) return m * pow
  return 10 * pow
}

export const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—')
