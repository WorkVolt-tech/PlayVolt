// Grid shape for the TV live board: up to 10 players fit on one screen (max 2 rows).
export function tvGrid(count) {
  const cols = count <= 2 ? Math.max(1, count) : count <= 4 ? 2 : count <= 6 ? 3 : count <= 8 ? 4 : 5;
  return { cols, rows: Math.max(1, Math.ceil(count / cols)) };
}
