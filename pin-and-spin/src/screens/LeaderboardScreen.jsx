import React, { useEffect, useState } from 'react';
import { callGame } from '../game/api.js';
import { play } from '../sound/sfx.js';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const rate = (p) => (p.games ? Math.round((p.wins / p.games) * 100) : 0);

// Multiplayer wins for signed-in PlayVolt players. Last 7 days or all time.
export function LeaderboardScreen({ account, onBack, onSignIn }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    callGame('leaderboard', {}, { period })
      .then((next) => { if (!cancelled) setData(next); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load the leaderboard.'); });
    return () => { cancelled = true; };
  }, [period, account.signedIn]);

  const players = data?.players || [];
  const meShown = players.some((p) => p.me);
  return <section className="screen leaderboard-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); onBack(); }}>← Back</button>
    <h1 className="page-title">🏆 Leaderboard</h1>
    <p className="lb-sub">Multiplayer wins with friends. Ties: fewer games ranks higher.</p>
    <div className="lb-tabs" role="tablist">
      {[['week', 'Last 7 days'], ['all', 'All time']].map(([id, label]) => <button type="button" key={id} role="tab"
        aria-selected={period === id} className={period === id ? 'on' : ''} onClick={() => { play('tab-switch'); setPeriod(id); }}>{label}</button>)}
    </div>

    {error && <div className="surface lb-empty"><p>{error}</p></div>}
    {!error && !data && <div className="surface lb-empty"><p>Loading…</p></div>}
    {data && !players.length && <div className="surface lb-empty"><p>No wins yet{period === 'week' ? ' this week' : ''}.
      Play a match with friends while signed in to get on the board!</p></div>}

    {players.length > 0 && <ol className="lb-list surface">
      <li className="lb-head" aria-hidden="true"><span>#</span><span>Player</span><span>Wins</span><span>Games</span><span>Win %</span></li>
      {players.map((p) => <li key={p.rank + p.name} className={'lb-row' + (p.me ? ' me' : '') + (p.rank <= 3 ? ' top' : '')}>
        <span className="lb-rank">{MEDALS[p.rank] || p.rank}</span>
        <span className="lb-name">{p.name}{p.me ? ' (you)' : ''}</span>
        <span className="lb-wins">{p.wins}</span>
        <span>{p.games}</span>
        <span>{rate(p)}%</span>
      </li>)}
      {data.me && !meShown && <li className="lb-row me lb-mine">
        <span className="lb-rank">{data.me.rank}</span><span className="lb-name">{data.me.name} (you)</span>
        <span className="lb-wins">{data.me.wins}</span><span>{data.me.games}</span><span>{rate(data.me)}%</span>
      </li>}
    </ol>}

    {!account.signedIn
      ? <div className="lb-note surface"><p>Only signed-in players appear on the leaderboard. Guest games don’t count.</p>
          <button type="button" className="primary-btn" onClick={onSignIn}>Sign in / Create account <span>→</span></button></div>
      : data && !data.me && <p className="lb-sub">You’re not on the board {period === 'week' ? 'this week' : ''} yet. Win a match with friends to get on it!</p>}
  </section>;
}
