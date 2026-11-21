import {drop,balancedWinLength} from './rules.js';

// Only the Gravity Shift mode changes gravity. Other modes retain existing boards.
export const SHIFT_EVERY=4;
export function applyGravityShift(board,width,height,direction){
 if(!['left','right'].includes(direction)||board.length!==width*height)return board;
 const shifted=Array(board.length).fill(0);
 for(let y=0;y<height;y++){
  const chips=[];
  for(let x=0;x<width;x++)if(board[y*width+x])chips.push(board[y*width+x]);
  const start=direction==='right'?width-chips.length:0;
  chips.forEach((chip,i)=>{shifted[y*width+start+i]=chip;});
 }
 // Re-establish downward gravity so the standard column entry still makes sense.
 const result=Array(board.length).fill(0);
 for(let x=0;x<width;x++){
  let target=height-1;
  for(let y=height-1;y>=0;y--)if(shifted[y*width+x])result[target--*width+x]=shifted[y*width+x];
 }
 return result;
}
export function completedLines(board,width,height,count,length){
 const winners=new Set();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const seat=board[y*width+x];
  if(!Number.isInteger(seat)||seat<1||seat>count)continue;
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
   let ok=true;
   for(let n=1;n<length;n++){
    const xx=x+dx*n,yy=y+dy*n;
    if(xx<0||xx>=width||yy<0||yy>=height||board[yy*width+xx]!==seat){ok=false;break;}
   }
   if(ok)winners.add(seat);
  }
 }
 return [...winners].sort((a,b)=>a-b);
}
export function openWinColumns(board,width,height,seat,length){
 const result=[];
 for(let col=0;col<width;col++){
  const move=drop(board,width,height,col,seat,length);
  if(move?.points>0)result.push(col);
 }
 return result;
}
export function playGravityTurn(old,col,count,width,height){
 if(old.status!=='playing'||!Number.isInteger(old.turn))return old;
 const length=balancedWinLength(count,'gravity');
 const move=drop(old.board,width,height,col,old.turn,length);
 if(!move)return old;
 const nextCount=(old.gravity?.drops||0)+1;
 const priorDirection=old.gravity?.nextDirection||'left';
 let board=move.board,shifted=false,applied=null;
 let winners=completedLines(board,width,height,count,length);
 // A direct win ends play; don't shift the board after someone has won.
 if(winners.length===0&&nextCount%SHIFT_EVERY===0){
  board=applyGravityShift(board,width,height,priorDirection);
  shifted=true;applied=priorDirection;
  winners=completedLines(board,width,height,count,length);
 }
 const winner=winners.length===1?winners[0]:null;
 const finished=winners.length>0||board.every(Boolean);
 const event=shifted?'🌪 GRAVITY SHIFT '+applied.toUpperCase()+'! '+(winners.length>1?'Multiple connections — DRAW!':winner?'Player '+winner+' wins after the shift!':'All chips rearranged!'):
  winner?'Player '+winner+' connected '+length+'!':'';
 return {...old,board,status:finished?'finished':'playing',winner,
  turn:finished?null:old.turn%count+1,
  moveCount:(old.moveCount||0)+1,
  gravity:{drops:nextCount,nextDirection:shifted?(priorDirection==='left'?'right':'left'):priorDirection,lastShift:applied},
  lastEvent:event,lastMove:{seat:old.turn,column:col,row:move.row,kind:'drop',earned:move.points}};
}
export function emptyRivalry(count){return {blocks:Array(count).fill(0),revenge:Array(count).fill(0),deniedBy:Array.from({length:count},()=>[]),lastCallout:''};}
export function registerRivalry(previous,next,count,width,height,mode){
 if(previous===next||!next?.board||!Number.isInteger(previous.turn))return next;
 const length=balancedWinLength(count,mode);
 const current=previous.turn;
 const before=previous.rivalry||emptyRivalry(count);
 const blocks=[...before.blocks],revenge=[...before.revenge];
 const deniedBy=before.deniedBy.map(items=>[...items]);
 const prevented=[];
 for(let opponent=1;opponent<=count;opponent++){
  if(opponent===current||previous.eliminated?.[opponent-1])continue;
  const threats=openWinColumns(previous.board,width,height,opponent,length);
  if(!threats.length)continue;
  const remaining=openWinColumns(next.board,width,height,opponent,length);
  if(threats.some(col=>!remaining.includes(col)))prevented.push(opponent);
 }
 let lastCallout='';
 if(prevented.length){
  blocks[current-1]+=prevented.length;
  const revengeTarget=prevented.find(p=>deniedBy[current-1].includes(p));
  if(revengeTarget){
   revenge[current-1]++;
   lastCallout='🔥 REVENGE BLOCK! Player '+current+' blocked Player '+revengeTarget+' back!';
  }else lastCallout='🚫 DENIED! Player '+current+' blocked '+prevented.map(p=>'Player '+p).join(' & ')+'!';
  for(const opponent of prevented)if(!deniedBy[opponent-1].includes(current))deniedBy[opponent-1].push(current);
 }
 if(next.status==='finished'&&next.winner===current&&deniedBy[current-1].length){
  revenge[current-1]++;
  lastCallout='🔥 REVENGE VICTORY! Player '+current+' wins after being denied!';
 }
 return {...next,rivalry:{blocks,revenge,deniedBy,lastCallout},
   lastEvent:lastCallout||(next.lastEvent||'')};
}
export function boardStanding(game){
 const count=game.players?.length||0, width=game.width, height=game.height;
 if(!Array.isArray(game.board)||!width||!height)return [];
 const length=game.winLength===3?3:4;
 const scored=game.mode==='territory';
 const stats=Array.from({length:count},(_,i)=>{
  const seat=game.players[i].seat;
  const chips=game.board.filter(c=>c===seat).length;
  const threats=openWinColumns(game.board,width,height,seat,length).length;
  const points=Number(game.players[i].score)||0;
  const blocks=game.rivalry?.blocks?.[seat-1]||0;
  const revenge=game.rivalry?.revenge?.[seat-1]||0;
  // Momentum indicates opportunities, never a predicted victory or official score.
  const momentum=chips+threats*4+blocks*2;
  return {seat,name:game.players[i].name,points,chips,threats,blocks,revenge,momentum,
    metric:scored?points:momentum};
 });
 return stats.sort((a,b)=>b.metric-a.metric||b.threats-a.threats||a.seat-b.seat)
  .map((p,i,arr)=>({...p,rank:i+1,leading:!i&&arr.length>1&&p.metric>arr[1].metric,
    tied:arr.length>1&&p.metric===arr[0].metric}));
}
