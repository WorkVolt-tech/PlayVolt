import {drop, balancedWinLength} from './rules.js';

export const POWER_COSTS=Object.freeze({shield:70,freeze:80,bomb:100,double:100});
export function initPowerState(count){return {energy:Array(count).fill(0),shields:[],frozen:null,doublePending:false};}
export function powerTargetAllowed(state,kind,column,width,height){
 if(!Number.isInteger(column)||column<0||column>=width)return false;
 const p=state.turn, board=state.board;
 if(kind==='drop'||kind==='double')return state.frozen?.column!==column && board[column]===0;
 if(kind==='freeze')return state.frozen?.column!==column&&board[column]===0;
 // Shield and bomb select the uppermost occupied piece of a column.
 const row=Array.from({length:height},(_,i)=>i).find(y=>board[y*width+column]!==0);
 if(row===undefined)return false;
 return kind==='bomb'||(kind==='shield'&&board[row*width+column]===p&&!state.shields.includes(row*width+column));
}
function settle(board,shields,width,height){
 const next=Array(board.length).fill(0), newShields=[];
 for(let x=0;x<width;x++){
  let dest=height-1;
  for(let y=height-1;y>=0;y--){
   const idx=y*width+x;
   if(board[idx]){
    const newIndex=dest*width+x;
    next[newIndex]=board[idx];
    if(shields.includes(idx))newShields.push(newIndex);
    dest--;
   }
  }
 }
 return {board:next,shields:newShields};
}
function winners(board,width,height,length,count){
 const found=new Set();
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const seat=board[y*width+x];if(!seat||seat>count)continue;
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
   let ok=true;
   for(let k=1;k<length;k++){
    const xx=x+dx*k,yy=y+dy*k;
    if(xx<0||xx>=width||yy<0||yy>=height||board[yy*width+xx]!==seat){ok=false;break;}
   }
   if(ok)found.add(seat);
  }
 }
 return [...found];
}
function threats(board,width,height,seat,length){
 let n=0;
 for(let c=0;c<width;c++){
  const d=drop(board,width,height,c,seat,length);
  if(d?.points)n++;
 }
 return n;
}
export function playPowerTurn(old,column,count,width,height,kind='drop'){
 if(old.status!=='playing'||!Number.isInteger(old.turn))return old;
 if(!Object.hasOwn(POWER_COSTS,kind)&&kind!=='drop')return old;
 if(old.doublePending&&kind!=='double')return old;
 if(!old.doublePending&&kind==='double')return old;
 const ps={...initPowerState(count),...old.power};
 if(!powerTargetAllowed({...old,...ps},kind,column,width,height))return old;
 const seat=old.turn, length=balancedWinLength(count,'power'), energy=[...ps.energy];
 const shields=[...ps.shields];
 let board=[...old.board],newShields=shields, frozen=ps.frozen, pending=ps.doublePending;
 const beforeThreats=threats(board,width,height,seat,length);
 const wasBlocking=Array.from({length:count},(_,i)=>i+1).some(other=>other!==seat&&threats(board,width,height,other,length)>0);
 let event='', row=height-1;
 if(kind==='drop'||kind==='double'){
  const move=drop(board,width,height,column,seat,length);if(!move)return old;
  board=move.board;row=move.row;
  if(kind==='double')pending=Math.max(0,Number(pending)-1);
  energy[seat-1]=Math.min(100,energy[seat-1]+10);
 }else{
  const cost=POWER_COSTS[kind];
  if(energy[seat-1]<cost)return old;
  energy[seat-1]-=cost;
  row=Array.from({length:height},(_,i)=>i).find(y=>board[y*width+column]!==0);
  if(kind==='shield'){newShields=[...shields,row*width+column];event='Player '+seat+' activated SHIELD!';}
  if(kind==='freeze'){frozen={column,owner:seat};event='Player '+seat+' froze column '+(column+1)+'!';}
  if(kind==='bomb'){
   for(const x of [column-1,column,column+1]){
    if(x<0||x>=width)continue;
    const index=row*width+x;
    if(board[index]&&!shields.includes(index))board[index]=0;
    else if(shields.includes(index))newShields=newShields.filter(i=>i!==index);
   }
   const settled=settle(board,newShields,width,height);
   board=settled.board;newShields=settled.shields;event='Player '+seat+' used BOMB!';
  }
 }
 const afterThreats=threats(board,width,height,seat,length);
 if(kind==='drop'||kind==='double'){
  if(afterThreats>beforeThreats)energy[seat-1]=Math.min(100,energy[seat-1]+15);
  if(wasBlocking&&!Array.from({length:count},(_,i)=>i+1).some(other=>other!==seat&&threats(board,width,height,other,length)>0))
   energy[seat-1]=Math.min(100,energy[seat-1]+20);
 }
 const lines=winners(board,width,height,length,count);
 const winner=lines.length===1?lines[0]:null;
 const finished=lines.length>0||board.every(Boolean);
 // A simultaneous connection resolves to a draw (no arbitrary winner).
 const turn=finished?null:pending?seat:seat%count+1;
 if(frozen&&frozen.owner===turn)frozen=null;
 return {...old,board,turn,winner,status:finished?'finished':'playing',
   power:{energy,shields:newShields,frozen,doublePending:pending},
   lastEvent:lines.length>1?'SIMULTANEOUS CONNECTION — DRAW!':event,
   lastMove:{seat,column,row,kind,earned:0},moveCount:(old.moveCount||0)+1};
}
export function activateDouble(old,count){
 if(old.status!=='playing'||old.power?.doublePending)return old;
 const p=old.turn,energy=[...old.power.energy];
 if(energy[p-1]<POWER_COSTS.double)return old;
 energy[p-1]-=POWER_COSTS.double;
 return {...old,power:{...old.power,energy,doublePending:2},
  lastEvent:'Player '+p+' activated DOUBLE DROP — select the extra chip!'};
}
