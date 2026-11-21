import {balancedWinLength} from './rules.js';
/** Store snapshots in local React state, not the server or an online leaderboard. */
export function appendLocalMove(history,previous,next,{seat,column,row,kind='drop',width,height}){
 if(!Array.isArray(history)||!Array.isArray(next?.board)||
 next.board.length!==width*height)return Array.isArray(history)?history:[];
 const playersAfter=(next.scores||[]).map((score,i)=>({
  seat:i+1,score,eliminated:Boolean(next.eliminated?.[i])
 }));
 return [...history,{step:history.length+1,seat,column,row,kind,
  earned:Math.max(0,(next.scores?.[seat-1]||0)-(previous.scores?.[seat-1]||0)),
  round:next.roundNumber||1,floorClears:next.floorClears||0,
  event:next.lastEvent||'',boardAfter:next.board.slice(),playersAfter
 }];
}
export function localReplayDetail(state,{width,height,mode,count,loadout}){
 const moves=Array.isArray(state?.history)?state.history:[];
 return {width,height,mode,winLength:balancedWinLength(count,mode),
  moves,moveCount:moves.length,completeSnapshots:moves.length>0,
  matchNumber:state?.matchNumber||1,winnerSeat:state?.winner??null,
  winnerTeam:state?.winnerTeam??null,
  players:Array.from({length:count},(_,i)=>({
   seat:i+1,name:'Player '+(i+1),
   chipStyle:i===0?(loadout?.chip||'round'):'round',
   avatarStyle:i===0?(loadout?.avatar||'sentinel'):'sentinel',
   score:state?.scores?.[i]||0,won:mode==='team'
    ?state?.winnerTeam===((i%2)+1)&&state?.status==='finished'
    :state?.winner===i+1
  }))};
}
