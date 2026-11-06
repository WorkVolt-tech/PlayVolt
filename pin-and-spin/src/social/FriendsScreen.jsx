import React, { useCallback, useEffect, useState } from 'react';
import { play } from '../sound/sfx.js';
import { MODES } from '../game/constants.js';
import { Peg } from '../components/Peg.jsx';
import { addFriendByCode, friendLink, isOnline, myFriendCode, myFriends, respondFriend } from './friends.js';

// The shared PlayVolt friends list (the same one as Dekabess): your friend code, add a
// friend by code, answer requests, and see who's online.
// onChallenge(friend, mode): create a room in that mode and invite the friend into it.
export function FriendsScreen({ account, notify, onBack, onSignIn, onChallenge, startCode = '' }) {
  const [challenging, setChallenging] = useState(null);
  const [list, setList] = useState(null);
  const [code, setCode] = useState('');
  const [add, setAdd] = useState(startCode);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);

  const load = useCallback(async () => {
    try {
      const [rows, mine] = await Promise.all([myFriends(), myFriendCode()]);
      setList(rows || []); setCode(mine || '');
    } catch (e) { notify(e.message); setList([]); }
  }, [notify]);
  useEffect(() => { if (account.signedIn) void load(); }, [account.signedIn, load]);

  async function submit(e) {
    e?.preventDefault();
    const c = add.trim();
    if (!c || busy) return;
    setBusy(true);
    try {
      const r = await addFriendByCode(c);
      setReply(r); play(r.ok ? 'confirm-unlock' : 'invalid-thunk');
      if (r.ok) { setAdd(''); void load(); }
    } catch (err) { setReply({ ok: false, message: err.message }); }
    finally { setBusy(false); }
  }
  async function answer(f, accept) {
    play(accept ? 'confirm-unlock' : 'swipe');
    try { await respondFriend(f.id, accept); notify(accept ? `You’re now friends with ${f.nickname}!` : 'Request declined.'); void load(); }
    catch (e) { notify(e.message); }
  }
  async function share() {
    const url = friendLink(code);
    play('select-item');
    try {
      if (navigator.share) await navigator.share({ title: 'Pin & Spin', text: `Add me as a friend on PlayVolt! My friend code is ${code}.`, url });
      else { await navigator.clipboard.writeText(url); notify('Friend link copied!'); }
    } catch (e) { if (e?.name !== 'AbortError') notify('Could not share. Your code is ' + code); }
  }

  if (!account.signedIn) return <section className="screen friends-screen">
    <button className="back-button" onClick={onBack}>← Back</button>
    <h1 className="page-title">👥 Friends</h1>
    <div className="surface lb-note"><p>Your friends list is shared across PlayVolt games like Dekabess. Sign in to add friends
      and invite them to your games.{startCode ? ` Then we’ll send a friend request to ${startCode}.` : ''}</p>
      <button type="button" className="primary-btn" onClick={onSignIn}>Sign in / Create account <span>→</span></button></div>
  </section>;

  const friends = (list || []).filter((f) => f.kind === 'friend').sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.nickname.localeCompare(b.nickname));
  const incoming = (list || []).filter((f) => f.kind === 'incoming');
  const outgoing = (list || []).filter((f) => f.kind === 'outgoing');
  return <section className="screen friends-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); onBack(); }}>← Back</button>
    <h1 className="page-title">👥 Friends</h1>
    <p className="lb-sub">The same friends list as Dekabess and every PlayVolt game.</p>

    <div className="surface friend-code-card">
      <span className="field-label">YOUR FRIEND CODE</span>
      <strong className="friend-code">{code || '…'}</strong>
      <button type="button" className="outline-btn full" disabled={!code} onClick={() => void share()}>↗ Share my friend link</button>
    </div>

    <form className="surface friend-add" onSubmit={submit}>
      <label className="field-label" htmlFor="friendCode">ADD A FRIEND</label>
      <div className="friend-add-row">
        <input id="friendCode" type="text" value={add} autoCapitalize="characters" autoComplete="off" spellCheck={false}
          placeholder="Their friend code" onChange={(e) => { setAdd(e.target.value.toUpperCase()); setReply(null); }} />
        <button type="submit" className="primary-btn" disabled={!add.trim() || busy}>{busy ? '…' : 'Add'}</button>
      </div>
      {reply && <p className={reply.ok ? 'tv-pair-ok' : 'tv-pair-error'} role="status">{reply.message}</p>}
    </form>

    {incoming.length > 0 && <div className="surface">
      <div className="panel-title"><h2>FRIEND REQUESTS</h2><span>{incoming.length}</span></div>
      {incoming.map((f) => <div className="friend-row" key={f.id}>
        <span className="friend-avatar">{f.nickname?.[0]?.toUpperCase() || '?'}</span>
        <strong>{f.nickname}</strong>
        <button type="button" className="primary-btn small-btn" onClick={() => void answer(f, true)}>Accept</button>
        <button type="button" className="outline-btn small-btn" onClick={() => void answer(f, false)}>✕</button>
      </div>)}
    </div>}

    <div className="surface">
      <div className="panel-title"><h2>MY FRIENDS</h2><span>{friends.length}</span></div>
      {!list && <p className="field-help">Loading…</p>}
      {list && !friends.length && <p className="field-help">No friends yet. Share your friend link, or add someone’s code above.</p>}
      {friends.map((f) => <div className="friend-row" key={f.user_id}>
        <span className="friend-avatar">{f.nickname?.[0]?.toUpperCase() || '?'}</span>
        <strong>{f.nickname}</strong>
        <small className={isOnline(f) ? 'online' : ''}>{isOnline(f) ? '● Online' : 'Offline'}</small>
        {onChallenge && <button type="button" className="primary-btn small-btn" onClick={() => { play('drawer-open'); setChallenging(f); }}>🎮 Challenge</button>}
      </div>)}
      {outgoing.length > 0 && <p className="field-help friend-waiting">Waiting for: {outgoing.map((f) => f.nickname).join(', ')}</p>}
    </div>
    {challenging && <div className="sheet-backdrop" onClick={() => setChallenging(null)}>
      <div className="sheet surface" role="dialog" aria-modal="true" aria-label={`Challenge ${challenging.nickname}`} onClick={(e) => e.stopPropagation()}>
        <div className="panel-title"><h2>🎮 Challenge {challenging.nickname}</h2>
          <button type="button" className="sheet-close" onClick={() => setChallenging(null)} aria-label="Close">✕</button></div>
        <p className="field-help">Pick a mode. We’ll open a room and send {challenging.nickname} an invite to join it
          (they need to be signed in to Pin &amp; Spin). You can invite more friends from the room.</p>
        <div className="challenge-modes">
          {Object.entries(MODES).map(([id, m]) => <button type="button" key={id} className="mode-option challenge-mode"
            onClick={() => { const f = challenging; setChallenging(null); play('click-crisp-primary'); onChallenge(f, id); }}>
            <Peg value={m.color} tiny />
            <span className="mode-body"><strong>{m.label}</strong><small>{m.hint}</small></span>
          </button>)}
        </div>
      </div>
    </div>}
  </section>;
}
