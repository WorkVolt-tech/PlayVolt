// Counts turn changes as they actually happen at the table.
//
// The turn clock (and "this player ran out of time") used to reset only when the
// current turn's seat changed. If the turn went round and came straight back to the
// same seat — say you, then everyone else knocks, then you again — the screen could
// skip the moments in between, the seat looked unchanged, and the old "out of time"
// stayed on: the game played for that player again at once, without their clock
// running down. Each room change the table receives is counted here instead, so a
// returning turn is still a new turn.
export function nextTurnSerial(state, turn) {
  if (state.last === null || state.last === undefined) return { last: turn, serial: state.serial }
  if (turn === state.last) return state
  return { last: turn, serial: state.serial + 1 }
}
