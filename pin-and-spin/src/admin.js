// ── Admin view (like Dekabess) ───────────────────────────────────────────────
// For PlayVolt admins only: shows the secret code faintly in your empty guess slots.
//
// The hidden switch: tap the "Pin & Spin" title at the top 5 times within 2 seconds to
// turn it on, and twice within 1 second to turn it off. It does nothing for anyone the
// database doesn't list as an admin (am_i_admin, and pin_and_spin_admin_peek checks the
// admins list again on the server), so finding this code in the public repo gives nobody
// else anything. The view stays on for this tab until switched off, or on signing out.
import { useEffect, useState } from 'react';
import { callGame } from './game/api.js';
import { getSupabase } from './game/auth.js';

const EVENT = 'pin-and-spin-admin-view';
const KEY = 'pin_and_spin_admin_view';
const TARGET = '.topbar .brand';

let adminCache = null; // null = not asked yet
let adminFor = null;

export async function checkAdmin() {
  try {
    const sb = await getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    const uid = session?.user?.id || null;
    if (!uid) { adminCache = false; adminFor = null; return false; }
    if (adminCache !== null && adminFor === uid) return adminCache;
    const { data, error } = await sb.rpc('am_i_admin');
    adminCache = !error && data === true;
    adminFor = uid;
    return adminCache;
  } catch { return false; }
}

const viewOn = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
function setView(on) {
  try { if (on) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }));
}

// A small note only the admin ever sees.
function note(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:fixed;left:50%;top:calc(64px + env(safe-area-inset-top,0px));transform:translateX(-50%);'
    + 'z-index:9999;padding:6px 12px;border-radius:14px;background:rgba(13,12,34,.92);color:#ffd76a;'
    + 'border:1px solid rgba(255,215,106,.5);font:700 12px/1.2 system-ui,sans-serif;letter-spacing:.06em;pointer-events:none';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

let installed = false;
function install() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  let taps = [];
  let quietUntil = 0; // right after a switch, extra taps from the same burst are ignored
  document.addEventListener('click', async (e) => {
    if (!e.target?.closest?.(TARGET)) return;
    const now = Date.now();
    if (now < quietUntil) { taps = []; return; }
    const on = viewOn();
    const need = on ? 2 : 5, within = on ? 1000 : 2000; // on: double tap turns it off; off: five taps turn it on
    taps = taps.filter((t) => now - t < within);
    taps.push(now);
    if (taps.length < need) return;
    taps = [];
    quietUntil = now + 1200;
    if (!(await checkAdmin())) return; // not an admin: nothing happens, nothing shows
    const next = !viewOn();
    setView(next);
    note(next ? 'Admin view on' : 'Admin view off');
  });
  getSupabase().then((sb) => sb.auth.onAuthStateChange((event, session) => {
    if (adminFor && session?.user?.id !== adminFor) { adminCache = null; adminFor = null; if (viewOn()) setView(false); }
    if (event === 'SIGNED_OUT' && viewOn()) setView(false);
  })).catch(() => {});
}

// True while the admin view is on (and this account really is an admin).
export function useAdminView() {
  install();
  const [on, setOn] = useState(viewOn);
  useEffect(() => {
    const onChange = (e) => setOn(Boolean(e.detail));
    window.addEventListener(EVENT, onChange);
    if (viewOn()) checkAdmin().then((ok) => { if (!ok) setView(false); });
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return on;
}

// The secret of a game being played, fetched from the server while the admin view is on.
// target: { code } for a room or { id } for your solo/story game; key changes when the code does.
export function usePeek(enabled, target, key) {
  const [secret, setSecret] = useState(null);
  const json = JSON.stringify(target || {});
  useEffect(() => {
    if (!enabled) { setSecret(null); return undefined; }
    let off = false;
    callGame('admin_peek', {}, JSON.parse(json)).then((r) => { if (!off) setSecret(Array.isArray(r.secret) ? r.secret : null); })
      .catch(() => { if (!off) setSecret(null); });
    return () => { off = true; };
  }, [enabled, json, key]);
  return enabled ? secret : null;
}
