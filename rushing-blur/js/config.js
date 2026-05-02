// ══════════════════════════════════════════════════
// RUSHING BLUR — CONFIG
// Replace SUPABASE_URL and SUPABASE_KEY with your
// own values from your Supabase project dashboard.
// ══════════════════════════════════════════════════

const CONFIG = {
  // ── YOUR SUPABASE CREDENTIALS ──
  SUPABASE_URL: 'https://eybzbtyfafmqbkulyvog.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5YnpidHlmYWZtcWJrdWx5dm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjE0MDksImV4cCI6MjA5MDM5NzQwOX0.65mO6dICDWAlS4nh0gBs7tSNobuNMNo103YY0Ylccq8',

  // ── GAME SETTINGS ──
  DEFAULT_LAPS:      3,
  MAX_PLAYERS:       6,
  NETWORK_TICK_MS:   66,    // broadcast position every ~66ms (15fps net, 60fps render)
  INTERP_BUFFER_MS:  100,   // interpolation buffer for smooth remote cars
  COUNTDOWN_SECS:    3,
  LOBBY_TIMEOUT_MS:  1800000, // auto-delete rooms after 30 min

  // ── HUD ──
  TRACK_LAPS: 3,
};
