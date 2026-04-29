// EDGE FUNCTION 2: join-room
// ─────────────────────────────────────────────────────────────
// What it does:
//   1. Validates the room exists and is still in 'lobby' status
//   2. Checks the room isn't full (max 15 players)
//   3. Adds the calling player to the room
//
// How to call it from your frontend:
//   const res = await fetch('/functions/v1/join-room', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': 'Bearer ' + supabase.auth.session().access_token
//     },
//     body: JSON.stringify({ room_id: 'uuid-here', display_name: 'Player 2' })
//   });
//   const { player_id } = await res.json();
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_PLAYERS = 15

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { room_id, display_name } = await req.json()

    if (!room_id || !display_name) {
      return new Response(
        JSON.stringify({ error: 'room_id and display_name are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Authenticate the caller
    const token = req.headers.get('Authorization')!.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 1: Check the room exists and is joinable ────────
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, status')
      .eq('id', room_id)
      .single()

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: 'Room not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (room.status !== 'lobby') {
      return new Response(
        JSON.stringify({ error: 'Game already started' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 2: Check player count ───────────────────────────
    const { count, error: countError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room_id)

    if (countError) throw countError

    if ((count ?? 0) >= MAX_PLAYERS) {
      return new Response(
        JSON.stringify({ error: 'Room is full' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 3: Check player isn't already in the room ───────
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room_id)
      .eq('auth_user_id', user.id)
      .single()

    if (existing) {
      // Already in — just return their existing player ID
      return new Response(
        JSON.stringify({ player_id: existing.id, rejoined: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 4: Add the player ───────────────────────────────
    const { data: player, error: insertError } = await supabase
      .from('players')
      .insert({
        room_id,
        auth_user_id: user.id,
        display_name: display_name.trim().slice(0, 20),
        money: 1000,
        position: 0,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return new Response(
      JSON.stringify({
        player_id: player.id,
        room_id,
        message: 'Joined successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('join-room error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
