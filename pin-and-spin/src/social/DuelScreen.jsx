import React, { useCallback, useEffect, useState } from 'react';
import { callGame } from '../game/api.js';
import { EMPTY_GUESS } from '../game/constants.js';
import { placeColor } from '../game/selectors.js';
import { GuessPanel } from '../screens/GuessPanel.jsx';
import { PegRow } from '../components/Peg.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { myFriends } from './friends.js';

const call = (action, data = {}) => callGame('duel_' + action, {}, data);
const titles = { win: 'You win!', loss: 'Your friend wins', tie: 'It’s a tie!', unsolved: 'Neither player cracked it' };

export function DuelScreen({ account, appearance, notify, onBack, onSignIn }) {
  const [duels, setDuels] = useState(null);
  const [friends, setFriends] = useState([]);
  const [query, setQuery] = useState('');
  const [id, open] = useState(null);
  const [draft, setDraft] = useState(EMPTY_GUESS);
  const [selected, select] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setDuels(await call('list')); setError(''); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    if (!account.signedIn) return undefined;
    void refresh();
    let active = true;
    myFriends().then(rows => {
      if (active) setFriends((rows || []).filter(row => row.kind === 'friend'));
    }).catch(e => { if (active) notify(e.message); });
    const timer = setInterval(() => void refresh(), 15000);
    return () => { active = false; clearInterval(timer); };
  }, [account.signedIn, refresh, notify]);

  const duel = duels?.find(item => item.id === id);
  function clear() { setDraft(EMPTY_GUESS); select(0); }
  async function act(action, payload) {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await call(action, payload);
      setDuels(items => [updated, ...(items || []).filter(item => item.id !== updated.id)]);
      open(updated.id); clear();
    } catch (e) { notify(e.message); }
    finally { setBusy(false); }
  }

  return <section className="screen solo-screen">
    <button className="back-button" disabled={busy} onClick={() => { if (id) { open(null); clear(); void refresh(); } else onBack(); }}>← {id ? 'Duels' : 'Back'}</button>
    <h1 className="page-title">{duel ? `Duel with ${duel.opponent}` : 'Duel'}</h1>
    {!account.signedIn ? <div className="surface solo-card">
      <p>Sign in to challenge a PlayVolt friend.</p>
      <button className="primary-btn" onClick={onSignIn}>Sign in / Create account</button>
    </div> : !duel ? <>
      <p className="lb-sub">Same code. Eight guesses each. Play whenever you’re free.</p>
      <div className="surface solo-card">
        <div className="friend-add-row"><input aria-label="Friend’s username" placeholder="Search friends by username" value={query}
          onChange={e => setQuery(e.target.value)} autoComplete="off" /></div>
        {query.trim() && (friends.some(f => f.nickname?.toLowerCase().includes(query.trim().toLowerCase()))
          ? friends.filter(f => f.nickname?.toLowerCase().includes(query.trim().toLowerCase())).map(f =>
            <div className="friend-row" key={f.user_id}><strong>{f.nickname}</strong>
              <button className="outline-btn small-btn" disabled={busy} onClick={() => void act('create', { friend: f.user_id })}>Challenge</button></div>)
          : <p className="field-help">No matching PlayVolt friends.</p>)}
      </div>
      <div className="surface solo-card">
        <div className="panel-title"><h2>MY DUELS</h2><button className="outline-btn small-btn" onClick={() => void refresh()}>Refresh</button></div>
        {error && <p role="alert">{error}</p>}
        {!duels && !error && <p>Loading…</p>}
        {duels?.length === 0 && <p>No duels yet.</p>}
        {duels?.map(item => <div className="friend-row" key={item.id}>
          <strong>{item.opponent}</strong>
          <small>{item.status === 'pending' ? (item.incoming ? 'Invite received' : 'Invite sent')
            : item.status === 'playing' ? (item.mine.done ? 'Waiting for friend' : 'Ready to play')
            : item.status === 'finished' ? titles[item.result] : item.status}</small>
          <button className="outline-btn small-btn" onClick={() => { open(item.id); clear(); }}>Open</button>
        </div>)}
      </div>
    </> : <>
      {duel.status === 'pending' && <div className="surface solo-card">
        <p>{duel.incoming ? 'Accept to start guessing. Your friend can play whenever they’re ready.' : 'Challenge sent. Your friend can accept from their Duel screen.'}</p>
        {duel.incoming && <button className="primary-btn" disabled={busy} onClick={() => void act('respond', { id, response: 'accept' })}>Accept</button>}
        <button className="outline-btn full" disabled={busy} onClick={() => void act('respond', { id, response: duel.incoming ? 'decline' : 'cancel' })}>
          {duel.incoming ? 'Decline' : 'Cancel invite'}</button>
      </div>}
      {duel.status === 'playing' && !duel.mine.done && <GuessPanel mine={duel.mine.guesses} limit={8}
        attempt={duel.mine.guesses.length + 1} canSubmit={!busy} draft={draft} selected={selected} onSelect={select}
        appearance={appearance} onClear={clear} onColor={color => {
          const next = placeColor(draft, selected, color); setDraft(next.draft); select(next.selected);
        }} onSubmit={() => void act('guess', { id, attempt: duel.mine.guesses.length + 1, colors: draft })}
        help={duel.theirs?.done ? 'Your friend finished. Both boards reveal when you finish.' : 'Your friend will see your guesses when you’ve both finished.'} />}
      {duel.status === 'playing' && duel.mine.done && <div className="surface solo-card" role="status">
        <h2>{duel.mine.solved ? 'You cracked it!' : 'Out of guesses'}</h2>
        <p>Waiting for {duel.opponent} to finish.</p>
        <DuelBoard name="Your guesses" run={duel.mine} appearance={appearance} />
      </div>}
      {duel.status === 'finished' && <div className="surface solo-card">
        <h2>{titles[duel.result]}</h2>
        <p>The code</p><PegRow colors={duel.answer} tiny shape={appearance?.piece} />
        <DuelBoard name="Your guesses" run={duel.mine} appearance={appearance} />
        <DuelBoard name={duel.opponent + '’s guesses'} run={duel.theirs} appearance={appearance} />
      </div>}
      {['declined', 'cancelled'].includes(duel.status) && <p className="surface solo-card">This challenge was {duel.status}.</p>}
    </>}
  </section>;
}

function DuelBoard({ name, run, appearance }) {
  return <div className="solo-recap">
    <h3>{name}</h3>
    {run.guesses.map(guess => <div className="solo-recap-row" key={guess.attempt}>
      <PegRow colors={guess.colors} tiny shape={appearance?.piece} />
      <Feedback guess={guess} shape={appearance?.pin} />
    </div>)}
  </div>;
}
