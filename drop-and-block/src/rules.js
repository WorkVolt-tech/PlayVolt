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
