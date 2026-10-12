// Kept at the original import path so every game mode uses the same Neon client.
import { createAuthClient } from '@neondatabase/auth'
import { SupabaseAuthAdapter } from '@neondatabase/auth/vanilla/adapters'
import { PostgrestClient } from '@supabase/postgrest-js'
import { createRealtime } from './neonRealtime'

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL
const DATA_URL = import.meta.env.VITE_NEON_DATA_URL
if (!AUTH_URL || !DATA_URL) throw new Error('Neon configuration is missing')

export const auth = createAuthClient(AUTH_URL, { adapter: SupabaseAuthAdapter() })
const guestAuth = createAuthClient(AUTH_URL)
let key = localStorage.getItem('dekabess_neon_browser_key')
if (!key) { key = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('dekabess_neon_browser_key', key) }
let guestToken = null, profileUser = null, profilePromise = null
let sessionCache, sessionPromise = null, sessionRevision = 0
// The SDK does not cache a missing session. Keep the guest result so live
// updates do not ask Auth to sign the same guest in on every poll.
auth.onAuthStateChange((event, session) => {
  if (event !== 'INITIAL_SESSION') { sessionRevision++; sessionCache = session }
})
// The adapter's broadcast listener handles other tabs. Also update the local
// cache immediately when this tab signs in or out.
for (const method of ['signUp', 'signInWithPassword', 'signOut']) {
  const original = auth[method].bind(auth)
  auth[method] = async (...args) => {
    const result = await original(...args)
    if (!result.error) {
      sessionRevision++
      sessionCache = method === 'signOut' ? null : result.data?.session
      profileUser = null
    }
    return result
  }
}
function validToken(token) {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp > Date.now() / 1000 + 60 } catch { return false }
}
async function identity() {
  if (sessionCache === undefined || (sessionCache && !validToken(sessionCache.access_token))) {
    const revision = sessionRevision
    if (!sessionPromise) sessionPromise = auth.getSession().then(({ data, error }) => {
      if (error) throw error
      if (revision === sessionRevision) sessionCache = data?.session ?? null
    }).finally(() => { sessionPromise = null })
    await sessionPromise
  }
  if (sessionCache?.access_token) return { token: sessionCache.access_token, uid: sessionCache.user.id }
  if (!validToken(guestToken)) {
    const result = await guestAuth.getAnonymousToken()
    if (result.error || !result.data?.token) throw result.error || new Error('Guest connection unavailable')
    guestToken = result.data.token
  }
  return { token: guestToken, uid: null }
}
async function dataFetch(input, init = {}) {
  const { token, uid } = await identity()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('x-player-key', key)
  if (uid && profileUser !== uid && !String(input).endsWith('/rpc/ensure_profile')) {
    if (!profilePromise) profilePromise = fetch(`${DATA_URL}/rpc/ensure_profile`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-player-key': key },
      body: '{}', signal: AbortSignal.timeout(15000),
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).message || 'Could not load profile'); profileUser = uid })
      .finally(() => { profilePromise = null })
    await profilePromise
  }
  return fetch(input, { ...init, headers, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) })
}
const rest = new PostgrestClient(DATA_URL, { fetch: dataFetch })
export const db = {
  auth,
  from: (...args) => rest.from(...args),
  rpc: (...args) => rest.rpc(...args),
  ...createRealtime((...args) => rest.rpc(...args)),
}
