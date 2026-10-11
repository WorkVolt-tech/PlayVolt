// Missing state is never evidence of a block. An empty hand is a normal win.
export function isTableBlocked(board, hands, pileCount = 0, seats = hands?.length) {
  if (!board?.tiles?.length || !Number.isInteger(board.left_end) ||
      !Number.isInteger(board.right_end) || pileCount !== 0 ||
      !Number.isInteger(seats) || seats < 2 || seats > 4 ||
      !Array.isArray(hands) || hands.length !== seats) return false
  for (const hand of hands) {
    if (!Array.isArray(hand) || hand.length === 0) return false
    for (const tile of hand) {
      if (!Array.isArray(tile) || tile.length !== 2 || !tile.every(Number.isInteger)) return false
      if (tile.includes(board.left_end) || tile.includes(board.right_end)) return false
    }
  }
  return true
}
