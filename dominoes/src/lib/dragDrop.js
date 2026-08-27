// Global drag state — shared between DominoTile and Board
let _dragging = null

export function setDragging(data) { _dragging = data }
export function getDragging() { return _dragging }
export function clearDragging() { _dragging = null }
