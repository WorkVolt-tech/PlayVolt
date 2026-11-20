// Presentation ONLY: compare confirmed server boards. Never predict moves or
// change a room's authoritative board while an animation is playing.
export function arcadeChipFlights(before,after,width,height,opts={}){
 if(!Array.isArray(before)||!Array.isArray(after)||
   !Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
   before.length!==width*height||after.length!==width*height||
   opts.reset||opts.blast||opts.floorCleared)return [];
 const entries=[];
 for(let index=0;index<after.length;index++){
  const seat=Number(after[index]),old=Number(before[index]);
  if(old!==0||!Number.isInteger(seat)||seat<1||seat>9)continue;
  entries.push({index,seat,column:index%width,row:Math.floor(index/width)});
 }
 // Network wake-ups can span several rounds: show the complete board instead
 // of inventing a long, inaccurate catch-up animation.
 if(entries.length>8)return [];
 const ranks=new Map();
 for(const row of [...(opts.previousOrder||[]),...(opts.speedOrder||[])]){
  if(Number.isInteger(row?.seat)&&Number.isInteger(row?.place))ranks.set(row.seat,row.place);
 }
 entries.sort((a,b)=>{
  const rankA=ranks.get(a.seat),rankB=ranks.get(b.seat);
  if(rankA!==undefined&&rankB!==undefined&&rankA!==rankB)return rankA-rankB;
  // Chips accepted earlier in the same column must appear below later chips.
  if(a.column===b.column)return b.row-a.row;
  if(opts.lastMove?.seat===a.seat)return 1;
  if(opts.lastMove?.seat===b.seat)return -1;
  return a.index-b.index;
 });
 return entries.map((flight,n)=>({
  ...flight,
  delay:Math.min(n*100,650),
  duration:Math.min(760,400+flight.row*47)
 }));
}

export function shouldAnimateBoard(previous,next){
 if(!previous||!next)return false;
 return previous.matchNumber===next.matchNumber&&
  previous.width===next.width&&previous.height===next.height&&
  Array.isArray(previous.board)&&Array.isArray(next.board)&&
  previous.board.length===next.board.length;
}
