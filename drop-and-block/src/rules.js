// Pure rules: shared by the no-account local demo and the unit tests.
export function emptyBoard(width, height) { return Array(width * height).fill(0); }
export function drop(board, width, height, column, seat) {
  if (!Number.isInteger(column) || column < 0 || column >= width) return null;
  if (!Number.isInteger(seat) || seat < 1 || seat > 8) return null;
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
    if (count >= 4) points++;
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
