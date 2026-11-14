// Forgot password: the plain checks (no network), kept apart so they can be tested.

// Always the same answer, whether or not the email has an account (so nobody can
// use this to find out who plays).
export const RESET_SENT = 'If an account uses this email, a reset link is on its way. Check your inbox (and spam folder).'

export const resetLinkTarget = () => `${location.origin}/auth?reset=1`

export const looksLikeEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim())

export function checkNewPassword(password, again) {
  if ((password || '').length < 6) return 'Password must be at least 6 characters.'
  if (password !== again) return 'The two passwords don’t match.'
  return null
}
