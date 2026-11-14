import { db } from './supabase'
import { RESET_SENT, checkNewPassword, looksLikeEmail, resetLinkTarget } from './passwordRules'

export { RESET_SENT, checkNewPassword, resetLinkTarget }

// Forgot password (shared PlayVolt accounts).
// 1. On the sign-in page the player asks for a reset link (requestReset).
// 2. Supabase emails a link back to this site's /auth?reset=1; opening it signs the
//    player in for that purpose only (a "password recovery" sign-in).
// 3. The sign-in page then shows "Choose a new password" (setNewPassword).
// If the link lands on another page of the site, ResetWatcher (App.jsx) sends the
// player to the new-password screen.

// The reset link opened this page (its address carries type=recovery until the
// sign-in library reads it).
export const openedFromResetLink = typeof location !== 'undefined' && /type=recovery/.test(location.hash)

export async function requestReset(email) {
  const clean = (email || '').trim()
  if (!looksLikeEmail(clean)) return { ok: false, message: 'Enter the email you signed up with.' }
  const { error } = await db.auth.resetPasswordForEmail(clean, { redirectTo: resetLinkTarget() })
  if (error && /rate|too many|seconds/i.test(error.message || '')) {
    return { ok: false, message: 'Too many tries. Wait a minute, then ask again.' }
  }
  return { ok: true, message: RESET_SENT }
}

export async function setNewPassword(password, again) {
  const problem = checkNewPassword(password, again)
  if (problem) return { ok: false, message: problem }
  const { data } = await db.auth.getSession()
  if (!data?.session) return { ok: false, expired: true, message: 'This reset link has expired or was already used. Ask for a new one.' }
  const { error } = await db.auth.updateUser({ password })
  if (error) {
    if (/different from the old/i.test(error.message || '')) return { ok: false, message: 'Choose a password different from your old one.' }
    return { ok: false, message: error.message || 'Could not save your new password. Try again.' }
  }
  return { ok: true, message: 'Password changed! You’re signed in.' }
}
