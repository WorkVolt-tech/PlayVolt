// ── Supabase singleton ──
let _sb = null;
function getSB() {
  if (!_sb) {
    if (!window.supabase) { console.error('Supabase JS not loaded'); return null; }
    _sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  }
  return _sb;
}

// Helper: generate a short random room code (6 chars, uppercase)
function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Helper: generate a local player UUID (persisted so refresh keeps same ID)
function getOrCreatePlayerId() {
  let id = localStorage.getItem('rb_player_id');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('rb_player_id', id);
  }
  return id;
}

// Helper: get saved player name
function getSavedName() {
  return localStorage.getItem('rb_player_name') || '';
}
function saveName(name) {
  localStorage.setItem('rb_player_name', name);
}
