import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MODES } from '../game/constants.js';
import { getSupabase } from '../game/auth.js';
import { play } from '../sound/sfx.js';
import { myInvites, respondInvite } from './friends.js';

// A friend invited you into their room: shown on the home screens (not during a game).
export function InviteBanner({ userId, active, onJoin, notify }) {
  const [invite, setInvite] = useState(null);
  const seen = useRef(new Set());
  const check = useCallback(async () => {
    try {
      const { invites } = await myInvites();
      const next = invites[0] || null;
      if (next && !seen.current.has(next.id)) { seen.current.add(next.id); play('notification-ding'); }
      setInvite(next);
    } catch { /* not signed in or offline: try again later */ }
  }, []);

  useEffect(() => {
    if (!userId || !active) return undefined;
    void check();
    const poll = setInterval(() => { if (!document.hidden) void check(); }, 20000);
    const visible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', visible);
    let off = false, client = null, channel = null;
    getSupabase().then((sb) => {
      if (off) return;
      client = sb;
      channel = sb.channel(`pin-and-spin-invites:${userId}`).on('broadcast', { event: 'invited' }, () => void check()).subscribe();
    }).catch(() => {});
    return () => { off = true; clearInterval(poll); document.removeEventListener('visibilitychange', visible); if (client && channel) void client.removeChannel(channel); };
  }, [userId, active, check]);

  if (!invite || !active) return null;
  async function answer(accept) {
    const current = invite;
    setInvite(null);
    try {
      const r = await respondInvite(current.id, accept);
      if (accept && r.code) { play('click-crisp-primary'); onJoin(r.code); }
    } catch (e) { notify(e.message || 'That invite has expired.'); }
  }
  return <div className="invite-banner" role="alert">
    <span className="invite-banner-icon" aria-hidden="true">🎮</span>
    <div><strong>{invite.from} invited you!</strong><small>Pin &amp; Spin · {MODES[invite.mode]?.label || 'Game'} · Room {invite.code}</small></div>
    <button type="button" className="primary-btn small-btn" onClick={() => void answer(true)}>Join</button>
    <button type="button" className="outline-btn small-btn" aria-label="Decline" onClick={() => void answer(false)}>✕</button>
  </div>;
}
