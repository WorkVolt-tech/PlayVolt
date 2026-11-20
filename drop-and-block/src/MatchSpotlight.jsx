import React from 'react';
import {matchSummary} from './boardFeedback.js';
import {AvatarBadge} from './looks.jsx';
import {ArcadeConfetti} from './ArcadeConfetti.jsx';

export function MatchSpotlight({game}) {
 const result=matchSummary(game);
 if(!result)return null;
 return <div className={'match-spotlight'+(result.draw?' is-draw':'')+
   (result.team?' team-'+result.team.toLowerCase():'')} role="status" aria-label="Match result">
   {!result.draw&&<ArcadeConfetti matchNumber={game.matchNumber||1} winnerSeat={game.winnerSeat}/>}
   <div className="match-spotlight-mark" aria-hidden="true">{result.draw?'⚖':'🏆'}</div>
   <div className="match-spotlight-copy">
    <small>MATCH {game.matchNumber||1} · FINAL RESULT</small>
    <strong>{result.title}</strong>
    <span>{result.subtitle}</span>
   </div>
   {result.winners.length>0&&<div className="match-winner-avatars" aria-label="Winning players">
     {result.winners.map(p=><span className="match-winner" key={p.seat}>
        <AvatarBadge id={p.avatarStyle||'sentinel'} small/>
        <span>{p.name}</span>
      </span>)}
   </div>}
 </div>;
}
