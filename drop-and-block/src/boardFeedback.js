// Read-only presentation rules shared by phones, demo and TV.
// Server-recorded move metadata is the source of truth for online games.
const DIRECTIONS=[[1,0],[0,1],[1,1],[1,-1]];
function validBoard(board,width,height){
 return Array.isArray(board)&&Number.isInteger(width)&&Number.isInteger(height)&&
  width>0&&height>0&&board.length===width*height;
}
function isShifted(move){
 return Boolean(move?.shifted ||
   (typeof move?.event==='string'&&move.event.startsWith('🌪 GRAVITY SHIFT ')));
}
function validMove(move,width,height){
 return Boolean(move)&&Number.isInteger(move.column)&&move.column>=0&&move.column<width&&
  Number.isInteger(move.row)&&move.row>=0&&move.row<height;
}
export function lastMoveCell(board,width,height,move){
 if(!validBoard(board,width,height)||!validMove(move,width,height))return null;
 // The post-shift board is authoritative: a chip might no longer occupy
 // the coordinate where it originally landed.
 if(isShifted(move))return null;
 if(move.kind!=='drop'&&move.kind!=='block')return null;
 const i=move.row*width+move.column;
 const expected=move.kind==='block'?9:move.seat;
 return board[i]===expected?i:null;
}
export function winningCells(board,width,height,winnerSeat,mode,lastMove,winLength=4){
 // Gravity may give the win to someone other than the player who just
 // dropped a chip; scan the final shifted board instead of anchoring at
 // the old drop coordinate, which is no longer meaningful after a shift.
 if(mode==='gravity'&&isShifted(lastMove)&&validBoard(board,width,height)&&
    Number.isInteger(winnerSeat)&&winnerSeat>=1&&winnerSeat<=8){
   const completed=new Set();
   const targetLength=winLength===3?3:4;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     if(board[y*width+x]!==winnerSeat)continue;
     for(const [dx,dy] of DIRECTIONS){
       const indices=[];
       for(let k=0;k<targetLength;k++){
         const xx=x+k*dx,yy=y+k*dy;
         if(xx<0||xx>=width||yy<0||yy>=height||board[yy*width+xx]!==winnerSeat)break;
         indices.push(yy*width+xx);
       }
       if(indices.length===targetLength)indices.forEach(i=>completed.add(i));
     }
   }
   return [...completed].sort((a,b)=>a-b);
 }
 if(!validBoard(board,width,height)||!Number.isInteger(winnerSeat)||winnerSeat<1||
 winnerSeat>8||!validMove(lastMove,width,height)||lastMove.kind!=='drop'||
 lastMove.seat!==winnerSeat||mode==='territory')return [];
 const anchor=lastMove.row*width+lastMove.column;
 if(board[anchor]!==winnerSeat)return [];
 const matches=(seat)=>Number.isInteger(seat)&&seat>=1&&seat<=8&&
   (mode==='team'?seat%2===winnerSeat%2:seat===winnerSeat);
 const all=new Set();
 for(const [dx,dy] of DIRECTIONS){
   const line=[anchor];
   for(const sign of [-1,1]){
     let x=lastMove.column+dx*sign,y=lastMove.row+dy*sign;
     while(x>=0&&x<width&&y>=0&&y<height&&matches(board[y*width+x])){
       line.push(y*width+x);x+=dx*sign;y+=dy*sign;
     }
   }
   if(line.length>=(winLength===3?3:4))for(const i of line)all.add(i);
 }
 return [...all].sort((a,b)=>a-b);
}
export function matchSummary(game){
 if(game?.status!=='finished')return null;
 const players=Array.isArray(game.players)?game.players:[];
 const win=players.find(p=>p.seat===game.winnerSeat);
 if(!win){
   const highest=game.mode==='territory'&&players.length?
    Math.max(...players.map(p=>Number(p.score)||0)):null;
   return {title:'IT’S A DRAW!',subtitle:highest===null?'No winner this round.':'Top score: '+highest+' points · tied',
      winners:[],draw:true};
 }
 if(game.mode==='team'){
   const team=win.seat%2?'GOLD':'BLUE';
   const winners=players.filter(p=>p.seat%2===win.seat%2);
   return {title:'TEAM '+team+' WINS!',subtitle:winners.map(p=>p.name).join(' & '),
    winners,draw:false,team};
 }
 return {title:win.name+' WINS!',subtitle:game.mode==='territory'?
  'Top score: '+(Number(win.score)||0)+' points':game.mode==='elimination'?
  'Last player standing':(game.winLength===3?'Three':'Four')+' connected. Victory!',
  winners:[win],draw:false};
}
