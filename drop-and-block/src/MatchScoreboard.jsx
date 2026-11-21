import React from 'react';
import {boardStanding} from './arcadeModes.js';

export function MatchScoreboard({game}){
 if(!game?.players?.length||!Array.isArray(game.board))return null;
 const standings=boardStanding(game);
 const isTerritory=game.mode==='territory';
 const leader=standings.find(x=>x.leading);
 const sessionWins=Array.isArray(game.sessionWins)?game.sessionWins:null;
 const sessionTop=sessionWins?Math.max(...sessionWins):0;
 const sessionLeaders=sessionWins?sessionWins.map((n,i)=>n===sessionTop?i+1:null).filter(Boolean):[];
 return <section className="match-scoreboard" aria-label="Match scoreboard">
  <div className="scoreboard-heading">
   <div><strong>🏆 LIVE SCOREBOARD</strong><small>{isTerritory?'Official connection points':'Board momentum · unofficial'}</small></div>
   <span className="scoreboard-leader">{leader?'👑 '+leader.name+' leads': '⚖ Tied for the lead'}</span>
  </div>
  {sessionWins&&<div className="session-scoreline">🏆 SESSION WINS: {sessionWins.map((wins,i)=><span key={i} className={sessionLeaders.includes(i+1)&&sessionTop>0?'session-wins-leader':''}>Player {i+1} <strong>{wins}</strong></span>)}<small>Reset session clears these results</small></div>}
  <div className="scoreboard-grid">
   {standings.map(p=><div key={p.seat} className={'scoreboard-player'+(p.leading?' is-leading':'')+(game.turnSeat===p.seat?' is-active':'')}>
    <span className={'scoreboard-seat seat-border-'+p.seat}>#{p.rank} · {p.name}</span>
    <strong>{p.metric}<small>{isTerritory?' PTS':' MOM'}</small></strong>
    <div className="scoreboard-detail">{p.chips} chips · {p.threats} winning {p.threats===1?'move':'moves'}{game.rivalry?' · '+p.blocks+' blocks':''}</div>
    {game.rivalry&&p.revenge>0&&<div className="scoreboard-revenge">🔥 {p.revenge} revenge</div>}
   </div>)}
  </div>
  {!isTerritory&&<p className="scoreboard-disclaimer">Momentum = chips on board + 4 per available winning move + 2 per recorded block. It shows board control, not guaranteed victory. First valid connection still wins.</p>}
 </section>;
}
