/** Cursor colors: distinct hues that stay legible on both plaster and lapis-night backgrounds. */
export const CURSOR_COLORS = ['#2F6FDB', '#C2410C', '#15803D', '#9333EA', '#DB2777', '#0E7490', '#B45309', '#4F46E5']

export function colorFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return CURSOR_COLORS[h % CURSOR_COLORS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase()
}
