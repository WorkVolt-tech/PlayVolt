// Pure rules: shared by the no-account local demo and the unit tests.
export function emptyBoard(width, height) { return Array(width * height).fill(0); }
export function drop(board, width, height, column, seat) {
  if (!Number.isInteger(column) || column < 0 || column >= width) return null;
  if (!Number.isInteger(seat) || seat < 1 || seat > 9) return null; // 9 = neutral Chaos Barrier
  let row = -1;
  for (let y = height - 1; y >= 0; y--) {
    if (board[y * width + column] === 0) { row = y; break; }
  }
  if (row === -1) return null;
  const next = [...board];
  next[row * width + column] = seat;
  let points = 0;
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let count = 1;
    for (const sign of [-1, 1]) {
      let x = column + dx * sign, y = row + dy * sign;
      while (x >= 0 && x < width && y >= 0 && y < height && next[y * width + x] === seat) {
        count++; x += dx * sign; y += dy * sign;
      }
    }
    if (count >= 4 && seat <= 8) points++; // neutral Barriers never score
  }
  return { board: next, row, points };
}
export function dimensions(count) {
  return count === 2 ? [7, 6] : count <= 4 ? [9, 8] : count <= 6 ? [12, 9] : [14, 10];
}

/** Remove the bottom row; every higher chip falls exactly one slot. */
export function clearBottomRow(board, width, height) {
  return [...Array(width).fill(0), ...board.slice(0, width * (height - 1))];
}
export function nextActiveSeat(current, eliminated) {
  for (let step = 1; step <= eliminated.length; step++) {
    const seat = (current - 1 + step) % eliminated.length + 1;
    if (!eliminated[seat - 1]) return seat;
  }
  return null;
}
/** Identical rules to the server: local turn simulator for the same-device demo. */
export function playLocalTurn(old, col, count, mode, width, height) {
  if (old.status !== 'playing' || old.eliminated?.[old.turn - 1]) return old;
  const move = drop(old.board, width, height, col, old.turn);
  if (!move) return old;
  const scores = [...old.scores];
  scores[old.turn - 1] += move.points;
  const eliminated = [...(old.eliminated || Array(count).fill(false))];
  const roundNumber = old.roundNumber || 1;
  const floorClears = old.floorClears || 0;
  const base = { ...old, board: move.board, scores, eliminated, roundNumber, floorClears, lastEvent: '' };
  const full = move.board.every(Boolean);
  if (mode === 'elimination') {
    if (move.points > 0) {
      const victim = nextActiveSeat(old.turn, eliminated);
      if (victim && victim !== old.turn) eliminated[victim - 1] = true;
      if (eliminated.filter(v => !v).length === 1) {
        return { ...base, status: 'finished', winner: old.turn, turn: null,
          lastEvent: victim ? 'Player ' + victim + ' eliminated!' : '' };
      }
      return { ...base, board: emptyBoard(width, height),
        turn: nextActiveSeat(old.turn, eliminated), roundNumber: roundNumber + 1,
        lastEvent: 'Player ' + victim + ' eliminated · New round!' };
    }
    if (full) return { ...base, board: emptyBoard(width, height),
      turn: nextActiveSeat(old.turn, eliminated), roundNumber: roundNumber + 1,
      lastEvent: 'Board full · New round!' };
    return { ...base, turn: nextActiveSeat(old.turn, eliminated) };
  }
  if (mode === 'collapse') {
    if (move.points > 0) return { ...base, status: 'finished', winner: old.turn, turn: null };
    if (move.row <= 1) return { ...base, board: clearBottomRow(move.board, width, height),
      turn: old.turn % count + 1, floorClears: floorClears + 1,
      lastEvent: 'Bottom row cleared — all pieces dropped!' };
    return { ...base, turn: old.turn % count + 1 };
  }
  if (mode === 'classic' && move.points > 0) {
    return { ...base, status: 'finished', winner: old.turn, turn: null };
  }
  if (full) {
    const best = Math.max(...scores);
    const winner = mode === 'territory' && scores.filter(s => s === best).length === 1
      ? scores.indexOf(best) + 1 : null;
    return { ...base, status: 'finished', winner, turn: null };
  }
  return { ...base, turn: old.turn % count + 1 };
}

/** Pure Chaos mechanics for the same-device demo; Supabase validates online turns. */
export function blastColumn(board,width,height,column) {
  if (!Number.isInteger(column) || column<0 || column>=width) return null;
  if (!board[(height-1)*width+column]) return null;
  const next=[...board];
  for(let y=height-1;y>=1;y--) next[y*width+column]=next[(y-1)*width+column];
  next[column]=0;
  return next;
}
export function playChaosTurn(old,column,count,width,height,kind='drop') {
  if (old.status!=='playing' || !Number.isInteger(old.turn)) return old;
  if (!['drop','block','blast'].includes(kind)) return old;
  const blockUsed=[...(old.chaosBlockUsed||Array(count).fill(false))];
  const blastUsed=[...(old.chaosBlastUsed||Array(count).fill(false))];
  let board,points=0,lastEvent='';
  if(kind==='blast') {
    if(blastUsed[old.turn-1]) return old;
    board=blastColumn(old.board,width,height,column);
    if(!board)return old;
    blastUsed[old.turn-1]=true;
    lastEvent='Player '+old.turn+' used Blast — a bottom chip vanished!';
  }else if(kind==='block'){
    if(blockUsed[old.turn-1]) return old;
    const placed=drop(old.board,width,height,column,9);
    if(!placed)return old;
    board=placed.board;
    blockUsed[old.turn-1]=true;
    lastEvent='Player '+old.turn+' dropped a Barrier!';
  }else{
    const placed=drop(old.board,width,height,column,old.turn);
    if(!placed)return old;
    board=placed.board;points=placed.points;
  }
  const scores=[...old.scores];scores[old.turn-1]+=points;
  const winner=points?old.turn:null;
  const done=Boolean(winner) || board.every(Boolean);
  return {...old,board,scores,chaosBlockUsed:blockUsed,chaosBlastUsed:blastUsed,lastEvent,
    status:done?'finished':'playing',winner,turn:done?null:old.turn%count+1};
}


/** Team Battle: odd seats share Team Gold, even seats share Team Blue.
 *  Individual shapes and colors remain identifiable. Neutral pieces never count. */
export function teamOfSeat(seat) {
  return Number.isInteger(seat) && seat>=1 && seat<=8 ? (seat%2===1?1:2) : null;
}
export function teamLinePoints(board,width,height,column,row,seat) {
  const team=teamOfSeat(seat);
  if(team===null)return 0;
  let points=0;
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
    let length=1;
    for(const direction of [-1,1]) {
      let x=column+dx*direction,y=row+dy*direction;
      while(x>=0&&x<width&&y>=0&&y<height&&teamOfSeat(board[y*width+x])===team){
        length++;x+=dx*direction;y+=dy*direction;
      }
    }
    if(length>=4)points++;
  }
  return points;
}
export function playTeamTurn(old,column,count,width,height) {
  if(old.status!=='playing'||old.turn===null||count<4||count%2!==0)return old;
  const placed=drop(old.board,width,height,column,old.turn);
  if(!placed)return old;
  const points=teamLinePoints(placed.board,width,height,column,placed.row,old.turn);
  const scores=[...old.scores];
  scores[old.turn-1]+=points;
  const winner=points>0?old.turn:null;
  const full=placed.board.every(Boolean);
  const finished=Boolean(winner)||full;
  return {...old,board:placed.board,scores,status:finished?'finished':'playing',
    winner,winnerTeam:winner?teamOfSeat(winner):null,
    turn:finished?null:old.turn%count+1};
}
