import {balancedWinLength} from './rules.js';
/** Always use the frozen server rule after Start, not the room's capacity. */
export function winRuleDisplay({mode='classic',winLength,playerCount=2,lobby=false}={}){
 const length=lobby?balancedWinLength(playerCount,mode):winLength===3?3:4;
 const outcome=mode==='territory'?'TO SCORE':mode==='elimination'?'TO ELIMINATE':
  mode==='team'?'TEAM CHIPS TO WIN':'TO WIN';
 return {length,headline:'CONNECT '+length,outcome,
  note:lobby?'Based on '+playerCount+' joined player'+(playerCount===1?'':'s'):'Locked for this match'};
}
