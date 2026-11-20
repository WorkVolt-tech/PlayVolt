// Server timestamps control the reset; browser animation never permits early
// server moves. The 3-second hold is frozen on each round change.
export const ELIMINATION_RESET_MS=3000;
export function eliminationResetState(game,elapsedMs=0){
 if(game?.mode!=='elimination'||game?.status!=='playing'||!game?.eliminationRoundOpensAt)
  return {active:false,seconds:0,progress:1,phase:'ready'};
 const start=Date.parse(game.eliminationRoundOpensAt);
 const now=Date.parse(game.serverNow);
 if(!Number.isFinite(start)||!Number.isFinite(now))
  return {active:false,seconds:0,progress:1,phase:'ready'};
 const ms=start-now-Math.max(0,Number(elapsedMs)||0);
 if(ms<=0)return {active:false,seconds:0,progress:1,phase:'ready'};
 const progress=Math.max(0,Math.min(1,1-ms/ELIMINATION_RESET_MS));
 return {active:true,seconds:Math.max(1,Math.ceil(ms/1000)),
   progress,phase:progress<.32?'eliminated':progress<.75?'clearing':'countdown',
   targetSeat:Number.isInteger(game.eliminationTargetSeat)?game.eliminationTargetSeat:null,
   scorerSeat:Number.isInteger(game.eliminationScorerSeat)?game.eliminationScorerSeat:null};
}
export function eliminationGhostOpacity(progress){
 if(!Number.isFinite(progress))return 0;
 if(progress<=.3)return 1;
 return Math.max(0,Math.min(1,(.69-progress)/.39));
}
