import React, { useEffect, useState } from 'react';
import { play } from '../sound/sfx.js';
import { inviteFriend, isOnline, myFriends } from './friends.js';

// Lobby sheet: invite friends from your PlayVolt friends list into this room.
export function InviteFriends({ game, onClose }) {
  const [friends, setFriends] = useState(null);
  const [sent, setSent] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    myFriends().then((rows) => setFriends((rows || []).filter((f) => f.kind === 'friend')
      .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.nickname.localeCompare(b.nickname))))
      .catch((e) => setError(e.message));
  }, []);
  const inRoom = new Set((game.players || []).filter((p) => p.active).map((p) => p.name));

  async function invite(f) {
    setSent((s) => ({ ...s, [f.user_id]: 'sending' }));
    try { await inviteFriend(f.user_id, game.code); play('message-sent-swish'); setSent((s) => ({ ...s, [f.user_id]: 'sent' })); }
    catch (e) { play('invalid-thunk'); setSent((s) => ({ ...s, [f.user_id]: undefined })); setError(e.message); }
  }

  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet surface" role="dialog" aria-modal="true" aria-label="Invite friends" onClick={(e) => e.stopPropagation()}>
      <div className="panel-title"><h2>👥 Invite friends</h2><button type="button" className="sheet-close" onClick={onClose} aria-label="Close">✕</button></div>
      <p className="field-help">They get a pop-up to join this room (signed in to Pin &amp; Spin on their phone). Invites last 10 minutes.</p>
      {error && <p className="tv-pair-error" role="alert">{error}</p>}
      {!friends && !error && <p className="field-help">Loading your friends…</p>}
      {friends && !friends.length && <p className="field-help">You have no friends on PlayVolt yet. Add them from the home
        screen → <b>Friends 👥</b> (share your friend link), or in Dekabess. For now, share the room code instead.</p>}
      {friends?.map((f) => <div className="friend-row" key={f.user_id}>
        <span className="friend-avatar">{f.nickname?.[0]?.toUpperCase() || '?'}</span>
        <strong>{f.nickname}</strong>
        <small className={isOnline(f) ? 'online' : ''}>{isOnline(f) ? '● Online' : 'Offline'}</small>
        {inRoom.has(f.nickname) ? <span className="friend-in">In the room</span>
          : <button type="button" className={(sent[f.user_id] === 'sent' ? 'outline-btn' : 'primary-btn') + ' small-btn'}
              disabled={Boolean(sent[f.user_id])} onClick={() => void invite(f)}>
              {sent[f.user_id] === 'sent' ? 'Invited ✓' : sent[f.user_id] ? '…' : 'Invite'}</button>}
      </div>)}
    </div>
  </div>;
}
