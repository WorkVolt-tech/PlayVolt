// EDGE FUNCTION 1: create-room
// ─────────────────────────────────────────────────────────────
// What it does:
//   1. Creates a new room row
//   2. Adds the calling player as the first player
//   3. Generates all 40 tiles for the board
//
// How to call it from your frontend:
//   const res = await fetch('/functions/v1/create-room', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': 'Bearer ' + supabase.auth.session().access_token
//     },
//     body: JSON.stringify({ display_name: 'Player 1' })
//   });
//   const { room_id } = await res.json();
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TILE TEMPLATES — the 40 spaces that make up the board.
// Properties have a base_price and color_group.
// Special tiles (go, tax, event, bonus) have no price.
const TILE_TEMPLATES = [
  { type: 'go',       name: 'GO',              base_price: null, color_group: null },
  { type: 'property', name: 'Old Kent Road',   base_price: 60,   color_group: 'brown' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Whitechapel Rd',  base_price: 60,   color_group: 'brown' },
  { type: 'tax',      name: 'Income Tax',      base_price: null, color_group: null },
  { type: 'property', name: 'Kings Cross',     base_price: 200,  color_group: 'station' },
  { type: 'property', name: 'The Angel',       base_price: 100,  color_group: 'light-blue' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Euston Road',     base_price: 100,  color_group: 'light-blue' },
  { type: 'property', name: 'Pentonville Rd',  base_price: 120,  color_group: 'light-blue' },
  { type: 'bonus',    name: 'Free Parking',    base_price: null, color_group: null },
  { type: 'property', name: 'Pall Mall',       base_price: 140,  color_group: 'pink' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Whitehall',       base_price: 140,  color_group: 'pink' },
  { type: 'property', name: 'Northumb. Ave',   base_price: 160,  color_group: 'pink' },
  { type: 'property', name: 'Marylebone',      base_price: 200,  color_group: 'station' },
  { type: 'property', name: 'Bow Street',      base_price: 180,  color_group: 'orange' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Marlborough St',  base_price: 180,  color_group: 'orange' },
  { type: 'property', name: 'Vine Street',     base_price: 200,  color_group: 'orange' },
  { type: 'event',    name: 'Power-Up Drop',   base_price: null, color_group: null },
  { type: 'property', name: 'Strand',          base_price: 220,  color_group: 'red' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Fleet Street',    base_price: 220,  color_group: 'red' },
  { type: 'property', name: 'Trafalgar Sq',    base_price: 240,  color_group: 'red' },
  { type: 'property', name: 'Fenchurch St',    base_price: 200,  color_group: 'station' },
  { type: 'property', name: 'Leicester Sq',    base_price: 260,  color_group: 'yellow' },
  { type: 'property', name: 'Coventry St',     base_price: 260,  color_group: 'yellow' },
  { type: 'tax',      name: 'Luxury Tax',      base_price: null, color_group: null },
  { type: 'property', name: 'Piccadilly',      base_price: 280,  color_group: 'yellow' },
  { type: 'bonus',    name: 'Payday',          base_price: null, color_group: null },
  { type: 'property', name: 'Regent Street',   base_price: 300,  color_group: 'green' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Oxford Street',   base_price: 300,  color_group: 'green' },
  { type: 'property', name: 'Bond Street',     base_price: 320,  color_group: 'green' },
  { type: 'property', name: 'Liverpool St',    base_price: 200,  color_group: 'station' },
  { type: 'event',    name: 'Chaos Card',      base_price: null, color_group: null },
  { type: 'property', name: 'Park Lane',       base_price: 350,  color_group: 'dark-blue' },
  { type: 'tax',      name: 'Super Tax',       base_price: null, color_group: null },
  { type: 'property', name: 'Mayfair',         base_price: 400,  color_group: 'dark-blue' },
]

// Seeded shuffle — same seed always produces same board order.
// This means all 15 clients derive the same board without us
// storing all 40 positions individually.
function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array]
  // Simple mulberry32 PRNG
  let s = seed
  function rand() {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ s >>> 15, 1 | s)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  // Fisher-Yates shuffle using the seeded PRNG
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

Deno.serve(async (req) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { display_name } = await req.json()

    if (!display_name || typeof display_name !== 'string') {
      return new Response(
        JSON.stringify({ error: 'display_name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with SERVICE ROLE key — bypasses RLS.
    // Never expose this key to the frontend.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get the calling user from their JWT token
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 1: Create the room ──────────────────────────────
    const boardSeed = Math.floor(Math.random() * 1_000_000)

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({ board_seed: boardSeed, status: 'lobby' })
      .select()
      .single()

    if (roomError) throw roomError

    // ── STEP 2: Add the creator as first player ──────────────
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        room_id: room.id,
        auth_user_id: user.id,
        display_name: display_name.trim().slice(0, 20), // max 20 chars
        money: 1000,
        position: 0,
      })
      .select()
      .single()

    if (playerError) throw playerError

    // ── STEP 3: Generate the 40 tiles ───────────────────────
    // Shuffle using the board seed so clients can reproduce the order
    const shuffledTemplates = seededShuffle(TILE_TEMPLATES, boardSeed)

    const tilesPayload = shuffledTemplates.map((template, index) => ({
      room_id: room.id,
      position: index,          // 0–39
      type: template.type,
      name: template.name,
      base_price: template.base_price,
      color_group: template.color_group,
      zone: null,               // zones get applied by advance-phase later
    }))

    const { error: tilesError } = await supabase
      .from('tiles')
      .insert(tilesPayload)

    if (tilesError) throw tilesError

    // ── STEP 4: Create property rows for buyable tiles ───────
    const { data: propertyTiles, error: ptError } = await supabase
      .from('tiles')
      .select('id, base_price')
      .eq('room_id', room.id)
      .eq('type', 'property')

    if (ptError) throw ptError

    const propertiesPayload = propertyTiles.map(tile => ({
      tile_id: tile.id,
      owner_id: null,           // unowned at start
      level: 0,
      current_rent: Math.floor(tile.base_price * 0.1), // 10% of price as base rent
    }))

    const { error: propError } = await supabase
      .from('properties')
      .insert(propertiesPayload)

    if (propError) throw propError

    // ── Done ─────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        room_id: room.id,
        player_id: player.id,
        board_seed: boardSeed,
        message: 'Room created. Share room_id with other players to join.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('create-room error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
