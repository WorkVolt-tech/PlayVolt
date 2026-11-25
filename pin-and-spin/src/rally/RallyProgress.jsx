import React from 'react';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { Peg } from '../components/Peg.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { cosmeticStyle, normalizeCosmetics } from '../cosmetics.js';
import { formatClock } from '../game/selectors.js';

export function rallyStandings(players) {
  return [...(players || [])].sort((a,b) => (b.rally?.completed || 0)-(a.rally?.completed || 0) ||
    (a.rally?.totalGuesses || 0)-(b.rally?.totalGuesses || 0) ||
    (a.rally?.elapsedMs ?? Infinity)-(b.rally?.elapsedMs ?? Infinity));
}
export function RallyStages() {
  return <div className="rally-stages">{[4,4,5,6].map((n,i)=><div key={i}>
    <strong>STAGE {i+1}</strong><span>{n} balls</span><small>6 guesses · 3 minutes</small>
  </div>)}</div>;
}
export function RallyProgress({game, clock = Date.now(), offset = 0, tv = false}) {
  const finished = game.status === 'finished';
  const players = finished ? rallyStandings(game.players) : game.players;
  return <section className={'rally-progress' + (tv ? ' rally-tv' : '')}>
    <div className="panel-title"><h2>{finished ? 'FINAL STANDINGS' : 'THE RACE'}</h2><span>{finished ? 'RACE OVER' : '4 STAGES'}</span></div>
    {finished && <h2 className="rally-result">{game.winners.length
      ? game.players.filter(p=>game.winners.includes(p.id)).map(p=>p.name).join(' & ')+' wins!'
      : 'No codes solved this time'}</h2>}
    <div className="rally-lanes">{players.map(p=>{
      const r=p.rally || {};
      const time = r.deadline ? formatClock(Math.max(0,Date.parse(r.deadline)-clock-offset)).join(':') : null;
      return <article className={'rally-lane board-theme-'+normalizeCosmetics(p.appearance).board} style={cosmeticStyle(p.appearance)} key={p.id}>
        <div className="rally-player"><PlayerAvatar player={p} size="sm"/><strong>{p.name}{p.id===game.me ? ' (You)' : ''}</strong>{game.winners.includes(p.id) && <span>🏆</span>}</div>
        <div className="rally-track" aria-label={r.completed+' of 4 codes solved'}>{[1,2,3,4].map(s=><span key={s} className={s<=r.completed?'done':s===r.stage && r.state==='racing'&&!finished?'current':''}>{s<=r.completed?'✓':s}</span>)}</div>
        <div className="rally-lane-meta"><b>{r.completed || 0}/4 solved</b><span>{!p.active ? 'Left' : finished ? (r.totalGuesses || 0)+' guesses' : r.state==='out' ? 'Run ended' : time}</span></div>
        {!finished && p.active && r.state==='racing' && <small>Stage {r.stage} · {r.used}/6 guesses{p.away?' · Away':''}</small>}
      </article>;
    })}</div>
    {!finished && <p className="rally-private">🔒 Combinations stay private during the race.</p>}
    {finished && <p className="field-help">First to finish all four wins. Otherwise: codes solved, then fewer guesses, then fastest progress. An exact tie shares the win.</p>}
  </section>;
}
export function RallyHistory({game}) {
  return <div className="rally-history">{game.players.map(p=><details className="surface" key={p.id}>
    <summary>{p.name} · View guesses</summary>
    {[1,2,3,4].map(stage=>{
      const guesses=(game.rallyHistory||[]).filter(g=>g.playerId===p.id&&g.stage===stage);
      return guesses.length>0 && <section key={stage}><h3>Stage {stage}</h3>{guesses.map(g=><div className="rally-history-row" key={g.attempt}>
        <small>{g.attempt}</small><div>{g.colors.map((c,i)=><Peg key={i} value={c} tiny shape={p.appearance?.piece}/>)}</div><Feedback guess={g} slots={g.colors.length} shape={p.appearance?.pin}/>
      </div>)}</section>;
    })}
  </details>)}</div>;
}
