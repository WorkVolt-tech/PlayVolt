// Pure, safe replay transformations. Never infer board changes from a move:
// post-effect snapshots from Supabase include floor clears and round resets.
export function clampStep(value,max) {
 const n=Number(value);
 return Number.isFinite(n)?Math.min(Math.max(0,Math.trunc(n)),Math.max(0,max)):0;
}
export function replayFrame(detail,step) {
 if(!detail)return null;
 const moves=Array.isArray(detail.moves)?detail.moves:[];
 const index=clampStep(step,moves.length);
 if(index===0) {
  return {step:0,board:Array(detail.width*detail.height).fill(0),
   round:1,floorClears:0,players:(detail.players||[]).map(p=>({seat:p.seat,score:0,eliminated:false})),
   kind:null,seat:null,column:null,event:'Before the first move'};
 }
 const move=moves[index-1];
 return {step:index,board:move.boardAfter,round:move.round??1,
   floorClears:move.floorClears??0,players:move.playersAfter||[],
   kind:move.kind,seat:move.seat,column:move.column,event:move.event||'',earned:move.earned||0};
}
export function canPlayReplay(detail) {
 return Boolean(detail?.completeSnapshots) && Array.isArray(detail?.moves) &&
  detail.moves.length>0 && detail.moves.every(m=>Array.isArray(m.boardAfter) &&
  m.boardAfter.length===detail.width*detail.height);
}
export function outcomeLabel(value) {
 return value==='win'?'Victory':value==='loss'?'Defeat':'Draw';
}
export const modeLabels={classic:'Classic',territory:'Territory',elimination:'Elimination',
 collapse:'Bottom Drop',chaos:'Chaos',team:'Team Battle'};
