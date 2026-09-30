export type AuthMode = 'signin' | 'signup'

export function validate(mode: AuthMode, name: string, email: string, password: string): string | null {
  if (mode === 'signup' && !name.trim()) return 'Enter your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.'
  if (password.length < 8) return 'Use at least 8 characters for your password.'
  return null
}
