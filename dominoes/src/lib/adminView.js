import { useEffect, useState } from 'react'
import { db } from './supabase'

// ── Admin view ───────────────────────────────────────────────────────────────
// For the owner only: shows every opponent's tiles face-up.
//
// The hidden switch: tap the name at the top left of a game screen
// ("Dekabess!", "Solo", "Practice" or the Story chapter) 5 times within
// 2 seconds to turn it on, and twice within 1 second to turn it off. It does nothing for anyone the database doesn't list as an admin
// (am_i_admin / admin_room_hands in dekabess_database.sql), so finding this
// code in the public repo gives nobody else anything. The view stays on for
// this browser tab until switched off the same way, or on signing out.

const EVENT = 'dekabess-admin-view'
const KEY = 'dk_admin_view'
const TARGET = '.top-bar .game-title, .top-bar .sc-chapter'

let adminCache = null            // null = not asked yet; true / false after
let adminFor = null              // whose answer adminCache is

export async function checkAdmin() {
  try {
    const { data: { session } } = await db.auth.getSession()
    const uid = session?.user?.id || null
    if (!uid) { adminCache = false; adminFor = null; return false }
    if (adminCache !== null && adminFor === uid) return adminCache
    const { data, error } = await db.rpc('am_i_admin')
    adminCache = !error && data === true
    adminFor = uid
    return adminCache
  } catch {
    return false
  }
}

function viewOn() {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}
function setView(on) {
  try { on ? sessionStorage.setItem(KEY, '1') : sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }))
}

// a small note only the admin ever sees
function note(text) {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = 'position:fixed;left:50%;top:calc(56px + env(safe-area-inset-top,0px));transform:translateX(-50%);' +
    'z-index:9999;padding:6px 12px;border-radius:14px;background:rgba(10,9,7,.88);color:#e8c96a;' +
    'border:1px solid rgba(201,168,76,.5);font:12px/1.2 "DM Mono",monospace;letter-spacing:.06em;pointer-events:none'
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 1600)
}

let installed = false
function install() {
  if (installed || typeof document === 'undefined') return
  installed = true
  let taps = []
  let quietUntil = 0      // right after a switch, extra taps from the same burst are ignored
  document.addEventListener('click', async e => {
    if (!e.target?.closest?.(TARGET)) return
    const now = Date.now()
    if (now < quietUntil) { taps = []; return }
    const on = viewOn()
    // on: a quick double tap turns it off; off: five quick taps turn it on
    const need = on ? 2 : 5
    const within = on ? 1000 : 2000
    taps = taps.filter(t => now - t < within)
    taps.push(now)
    if (taps.length < need) return
    taps = []
    quietUntil = now + 1200
    if (!(await checkAdmin())) return          // not an admin: nothing happens, nothing shows
    const next = !viewOn()
    setView(next)
    note(next ? 'Admin view on' : 'Admin view off')
  })
  // signing out (or switching account) turns it off and forgets the answer
  db.auth.onAuthStateChange((event, session) => {
    if (adminFor && session?.user?.id !== adminFor) { adminCache = null; adminFor = null; if (viewOn()) setView(false) }
    if (event === 'SIGNED_OUT' && viewOn()) setView(false)
  })
}

// true while the admin view is on (and this account really is an admin)
export function useAdminView() {
  install()
  const [on, setOn] = useState(viewOn)
  useEffect(() => {
    const onChange = e => setOn(!!e.detail)
    window.addEventListener(EVENT, onChange)
    // a view left on from earlier is only honoured for a confirmed admin
    if (viewOn()) checkAdmin().then(ok => { if (!ok) setView(false) })
    return () => window.removeEventListener(EVENT, onChange)
  }, [])
  return on
}

// every seat's hand in an online room, for the admin view
export async function fetchRoomHands(roomId) {
  const { data, error } = await db.rpc('admin_room_hands', { p_room: roomId })
  if (error) return null
  return Object.fromEntries((data || []).map(r => [r.seat, Array.isArray(r.hand) ? r.hand : []]))
}
