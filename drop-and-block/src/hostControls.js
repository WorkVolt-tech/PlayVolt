// Only UI visibility: the Supabase RPC remains the authority for all actions.
export function isNoContest(room) {
  return room?.status==='cancelled' && room?.endReason==='stalled_no_contest';
}
export function isClosedLobby(room) {
  return room?.status==='cancelled' && room?.endReason==='closed_lobby';
}
export function canCloseLobby(room) {
  return room?.host === true && room?.status==='lobby';
}
export function canEndStalled(room) {
  return room?.host === true && room?.status==='playing' && room?.canNoContest===true;
}
export function canRematch(room) {
  return room?.host===true && (room?.status==='finished' || isNoContest(room));
}
