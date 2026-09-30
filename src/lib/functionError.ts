/**
 * functions.invoke() puts the response body's `error` on error.error and leaves message empty.
 * Returns the most useful human-readable message.
 */
export function functionErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err || typeof err !== 'object') return fallback
  const e = err as { message?: unknown; error?: unknown }
  if (typeof e.error === 'string' && e.error.trim()) return e.error
  if (typeof e.message === 'string' && e.message.trim()) return e.message
  return fallback
}
