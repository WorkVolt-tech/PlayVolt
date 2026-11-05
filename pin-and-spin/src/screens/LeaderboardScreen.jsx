import React, { useEffect, useState } from 'react';
import { callGame } from '../game/api.js';
import { play } from '../sound/sfx.js';

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// Each board: its tab, the line under the title, the empty message and its columns.
// The server sends two numbers per player: a (ranked first) and b (detail).
export const BOARDS = {
  multi: { tab: 'Multiplayer', sub: 'Wins with friends. Ties: fewer games ranks higher.', empty: 'Win a match with friends while signed in to get on the board!',
    cols: [['Wins', (p) => p.a], ['Games', (p) => p.b], ['Win %', (p) => `${pct(p.a, p.b)}%`]] },
  daily: { tab: 'Daily', sub: 'Daily puzzles solved. Ties: fewer tries on average.', empty: 'Solve a daily puzzle to get on the board!',
    cols: [['Solved', (p) => p.a], ['Avg tries', (p) => Number(p.b).toFixed(1)]] },
  clock: { tab: 'Clock', sub: 'Best Beat the Clock score (codes cracked in 3 minutes).', empty: 'Play Beat the Clock to get on the board!',
    cols: [['Best', (p) => p.a], ['Games', (p) => p.b]] },
  story: { tab: 'Story', sub: 'Story mode stars (all time).', empty: 'Clear a story level to get on the board!',
    cols: [['Stars', (p) => `⭐ ${p.a}`], ['Levels', (p) => p.b]] },
};

// Leaderboards for signed-in PlayVolt players. Last 7 days or all time (story: all time).
export function LeaderboardScreen({ account, onBack, onSignIn }) {
  const [board, setBoard] = useState('multi');
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const cfg = BOARDS[board];

  useEffect(() => {
    let cancelled = false;
    setData(null); setError('');
    callGame('leaderboard', {}, { period, board })
      .then((next) => { if (!cancelled) setData(next); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load the leaderboard.'); });
    return () => { cancelled = true; };
  }, [period, board, account.signedIn]);

  const players = data?.players || [];
  const meShown = players.some((p) => p.me);
  const gridStyle = { gridTemplateColumns: `38px 1fr ${cfg.cols.map(() => '58px').join(' ')}` };
  const row = (p, mine) => <li key={p.rank + p.name} style={gridStyle}
    className={'lb-row' + (mine || p.me ? ' me' : '') + (p.rank <= 3 ? ' top' : '') + (mine ? ' lb-mine' : '')}>
    <span className="lb-rank">{MEDALS[p.rank] || p.rank}</span>
    <span className="lb-name">{p.name}{mine || p.me ? ' (you)' : ''}</span>
    {cfg.cols.map(([label, value], i) => <span key={label} className={i === 0 ? 'lb-wins' : ''}>{value(p)}</span>)}
  </li>;

  return <section className="screen leaderboard-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); onBack(); }}>← Back</button>
    <h1 className="page-title">🏆 Leaderboard</h1>
    <div className="lb-tabs lb-boards" role="tablist" aria-label="Leaderboard">
      {Object.entries(BOARDS).map(([id, b]) => <button type="button" key={id} role="tab"
        aria-selected={board === id} className={board === id ? 'on' : ''} onClick={() => { play('tab-switch'); setBoard(id); }}>{b.tab}</button>)}
    </div>
    <p className="lb-sub">{cfg.sub}</p>
    {board !== 'story' && <div className="lb-tabs lb-period" role="tablist" aria-label="Period">
      {[['week', 'Last 7 days'], ['all', 'All time']].map(([id, label]) => <button type="button" key={id} role="tab"
        aria-selected={period === id} className={period === id ? 'on' : ''} onClick={() => { play('tab-switch'); setPeriod(id); }}>{label}</button>)}
    </div>}

    {error && <div className="surface lb-empty"><p>{error}</p></div>}
    {!error && !data && <div className="surface lb-empty"><p>Loading…</p></div>}
    {data && !players.length && <div className="surface lb-empty"><p>Nobody yet{board !== 'story' && period === 'week' ? ' this week' : ''}. {cfg.empty}</p></div>}

    {players.length > 0 && <ol className="lb-list surface">
      <li className="lb-head" aria-hidden="true" style={gridStyle}><span>#</span><span>Player</span>{cfg.cols.map(([label]) => <span key={label}>{label}</span>)}</li>
      {players.map((p) => row(p, false))}
      {data.me && !meShown && row(data.me, true)}
    </ol>}

    {!account.signedIn
      ? <div className="lb-note surface"><p>Only signed-in players appear on the leaderboards. Guest games don’t count.</p>
          <button type="button" className="primary-btn" onClick={onSignIn}>Sign in / Create account <span>→</span></button></div>
      : data && !data.me && <p className="lb-sub">You’re not on this board{board !== 'story' && period === 'week' ? ' this week' : ''} yet.</p>}
  </section>;
}
