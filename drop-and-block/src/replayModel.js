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

// Highlight reel: prioritize earned lines, special powers, round transitions and
// the deciding move. Include the preceding frame when possible for context.
export function highlightSteps(detail,maxSteps=14) {
 if(!canPlayReplay(detail))return [];
 const moves=detail.moves;
 if(!moves.length)return [];
 const cap=Math.max(2,Math.floor(maxSteps)||14);
 const n=moves.length;
 const notable=[];
 for(let i=0;i<n;i++){
  const m=moves[i];
  const prev=moves[i-1];
  const score=(i===n-1?120:0)
   +(Number(m.earned)>0?85:0)
   +(m.kind==='blast'||m.kind==='block'?65:0)
   +(m.event?55:0)
   +(prev&&m.round!==prev.round?75:0)
   +(prev&&m.floorClears>prev.floorClears?75:0);
  if(score>0)notable.push({step:i+1,score});
 }
 // Always include the final move and context. Pick the strongest moments first.
 const selected=new Set([n]);
 if(n>1)selected.add(n-1);
 notable.sort((a,b)=>b.score-a.score||b.step-a.step);
 for(const h of notable){
  if(selected.size>=cap)break;
  selected.add(h.step);
  if(h.step>1&&selected.size<cap)selected.add(h.step-1);
 }
 if(selected.size<Math.min(cap,5)){
  for(let i=n-2;i>=1&&selected.size<Math.min(cap,5);i--)selected.add(i);
 }
 return [...selected].sort((a,b)=>a-b);
}
export function replayTimeline(detail,mode='full') {
 if(!canPlayReplay(detail))return [];
 return mode==='highlights'?[0,...highlightSteps(detail)]:
  Array.from({length:detail.moves.length+1},(_,i)=>i);
}
export function highlightLabel(detail,step) {
 const move=detail?.moves?.[step-1];
 if(!move)return 'Start';
 if(step===detail.moves.length)return 'Final move';
 if(move.kind==='blast')return 'Blast!';
 if(move.kind==='block')return 'Barrier';
 if(move.event)return move.event;
 if(Number(move.earned)>0)return 'Scoring line';
 return 'Move '+step;
}
