// EDGE FUNCTION 5: advance-phase
// ─────────────────────────────────────────────────────────────
// This is the game clock. It moves the room from phase to phase
// and handles timeouts (AFK players, expired mini-games).
//
// Call this in TWO ways:
//   A) From a Supabase Cron Job every 5 seconds (recommended)
//   B) From the frontend as a fallback if no cron is set up
//
// To set up a cron job in Supabase:
//   Dashboard → Database → Extensions → enable pg_cron
//   Then in SQL Editor:
//     select cron.schedule(
//       'advance-phases',
//       '5 seconds',
//       $$select net.http_post(
//         url := 'https://YOUR_PROJECT.supabase.co/functions/v1/advance-phase',
//         headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
//       )$$
//     );
//
// Phase flow per round:
//   rolling (10s) → resolving (5s) → [minigame (15s)] → income (3s) → rolling
//
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Phase durations in milliseconds
const PHASE_DURATIONS = {
  rolling:   10_000,  // 10 seconds to roll dice
  resolving:  5_000,  // 5 seconds to show tile resolution
  minigame:  15_000,  // 15 seconds for mini-game (set by roll-dice)
  income:     3_000,  // 3 seconds to show income tick
}

// How many rounds before tiles reshuffle
const SHUFFLE_EVERY_N_ROUNDS = 3

// Money earned for passing/landing on GO
const GO_INCOME = 200

// Passive income per owned property per round
const PASSIVE_INCOME_PER_PROPERTY = 10

Deno.serve(async (req) => {
  // This endpoint is called by cron or frontend — accepts GET or POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // ── Find all rooms that need phase advancement ───────────
    // A room needs advancing when phase_ends_at is in the past
    const { data: expiredRooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('status', 'playing')
      .lt('phase_ends_at', new Date().toISOString())

    if (error) throw error
    if (!expiredRooms || expiredRooms.length === 0) {
      return new Response(
        JSON.stringify({ advanced: 0, message: 'No rooms need advancing' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const results = []

    for (const room of expiredRooms) {
      try {
        const result = await advanceRoom(supabase, room)
        results.push({ room_id: room.id, ...result })
      } catch (roomErr) {
        console.error(`Error advancing room ${room.id}:`, roomErr)
        results.push({ room_id: room.id, error: 'Failed' })
      }
    }

    return new Response(
      JSON.stringify({ advanced: results.length, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('advance-phase error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function advanceRoom(
  supabase: ReturnType<typeof createClient>,
  room: Record<string, unknown>
) {
  const currentPhase = room.phase as string
  const currentRound = room.round as number
  const roomId = room.id as string

  // ── Handle each phase transition ────────────────────────────

  if (currentPhase === 'rolling') {
    // Time ran out — any player who didn't roll gets marked AFK
    const { data: players } = await supabase
      .from('players')
      .select('id, last_roll')
      .eq('room_id', roomId)
      .eq('status', 'active')

    if (players) {
      for (const p of players) {
        if (p.last_roll === null) {
          // Didn't roll — mark AFK for this round (not permanent)
          await supabase
            .from('players')
            .update({ status: 'afk' })
            .eq('id', p.id)
        }
      }
    }

    // Advance to resolving
    await supabase
      .from('rooms')
      .update({
        phase: 'resolving',
        phase_ends_at: new Date(Date.now() + PHASE_DURATIONS.resolving).toISOString(),
      })
      .eq('id', roomId)

    return { previous: 'rolling', next: 'resolving' }

  } else if (currentPhase === 'resolving') {
    // Check for any unresolved mini-games — if there are active ones, wait
    const { data: activeMiniGames } = await supabase
      .from('mini_games')
      .select('id')
      .eq('room_id', roomId)
      .eq('status', 'active')

    if (activeMiniGames && activeMiniGames.length > 0) {
      // There's a mini-game in progress — let mini-game phase handle it
      return { previous: 'resolving', next: 'minigame (already active)' }
    }

    // No mini-games — skip straight to income
    await supabase
      .from('rooms')
      .update({
        phase: 'income',
        phase_ends_at: new Date(Date.now() + PHASE_DURATIONS.income).toISOString(),
      })
      .eq('id', roomId)

    return { previous: 'resolving', next: 'income' }

  } else if (currentPhase === 'minigame') {
    // Mini-game timed out — auto-resolve with whoever submitted
    const { data: activeMiniGame } = await supabase
      .from('mini_games')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .single()

    if (activeMiniGame) {
      const scores = activeMiniGame.scores as Record<string, number>
      const participants = activeMiniGame.participants as string[]
      const submitters = Object.keys(scores)

      let winnerId: string
      if (submitters.length === 0) {
        // Nobody submitted — pick at random (both lose in spirit, pick defender)
        winnerId = participants[1] ?? participants[0]
      } else {
        // Give win to whoever submitted (they showed up)
        winnerId = submitters[0]
      }

      await supabase
        .from('mini_games')
        .update({ status: 'resolved', winner_id: winnerId })
        .eq('id', activeMiniGame.id)
    }

    // Advance to income
    await supabase
      .from('rooms')
      .update({
        phase: 'income',
        phase_ends_at: new Date(Date.now() + PHASE_DURATIONS.income).toISOString(),
      })
      .eq('id', roomId)

    return { previous: 'minigame', next: 'income' }

  } else if (currentPhase === 'income') {
    // ── Income tick ──────────────────────────────────────────
    // 1. Pay passive income to property owners
    // 2. Restore AFK players to active
    // 3. Check win condition
    // 4. Maybe reshuffle the board
    // 5. Advance to next rolling phase

    const newRound = currentRound + 1

    // Pay passive income per owned property
    const { data: allProperties } = await supabase
      .from('properties')
      .select('owner_id, current_rent')
      .not('owner_id', 'is', null)
      .in('tile_id', (
        await supabase
          .from('tiles')
          .select('id')
          .eq('room_id', roomId)
      ).data?.map(t => t.id) ?? [])

    if (allProperties) {
      // Group passive income by owner
      const incomeByOwner: Record<string, number> = {}
      for (const prop of allProperties) {
        const ownerId = prop.owner_id as string
        incomeByOwner[ownerId] = (incomeByOwner[ownerId] ?? 0) + PASSIVE_INCOME_PER_PROPERTY
      }

      // Apply income
      for (const [ownerId, income] of Object.entries(incomeByOwner)) {
        const { data: owner } = await supabase
          .from('players')
          .select('money')
          .eq('id', ownerId)
          .single()

        if (owner) {
          await supabase
            .from('players')
            .update({ money: owner.money + income })
            .eq('id', ownerId)
        }
      }
    }

    // Restore AFK players
    await supabase
      .from('players')
      .update({ status: 'active', last_roll: null })
      .eq('room_id', roomId)
      .eq('status', 'afk')

    // Reset last_roll for active players too (new round)
    await supabase
      .from('players')
      .update({ last_roll: null })
      .eq('room_id', roomId)
      .eq('status', 'active')

    // Expire old events
    await supabase
      .from('events')
      .update({ resolved: true })
      .eq('room_id', roomId)
      .lte('expires_at_round', newRound)
      .eq('resolved', false)

    // ── Check win condition ──────────────────────────────────
    // Game ends at round 10 (about 10–15 min) or if only 1 player left
    const { data: activePlayers } = await supabase
      .from('players')
      .select('id, money, display_name')
      .eq('room_id', roomId)
      .eq('status', 'active')
      .order('money', { ascending: false })

    if (
      (activePlayers && activePlayers.length <= 1) ||
      newRound > 10
    ) {
      await supabase
        .from('rooms')
        .update({ status: 'finished', round: newRound })
        .eq('id', roomId)

      return {
        previous: 'income',
        next: 'finished',
        winner: activePlayers?.[0]?.display_name ?? 'Nobody',
      }
    }

    // ── Reshuffle board every N rounds ──────────────────────
    let newSeed = room.board_seed as number
    if (newRound % SHUFFLE_EVERY_N_ROUNDS === 0) {
      newSeed = Math.floor(Math.random() * 1_000_000)

      // Update tile positions — clients use the new seed to re-render
      // We just update board_seed; clients derive new positions from it
      // (same seededShuffle function used in create-room)
      await supabase
        .from('rooms')
        .update({ board_seed: newSeed })
        .eq('id', roomId)

      // Reset zone modifiers
      await supabase
        .from('tiles')
        .update({ zone: null })
        .eq('room_id', roomId)

      // Randomly assign new zones to a few tiles
      const { data: propTiles } = await supabase
        .from('tiles')
        .select('id')
        .eq('room_id', roomId)
        .eq('type', 'property')

      if (propTiles && propTiles.length > 0) {
        const zoneTypes = ['double_rent', 'no_buy', 'minigame_only']
        // Apply zones to ~20% of property tiles
        const zoneCount = Math.floor(propTiles.length * 0.2)
        const shuffled = propTiles.sort(() => Math.random() - 0.5).slice(0, zoneCount)

        for (const tile of shuffled) {
          const zone = zoneTypes[Math.floor(Math.random() * zoneTypes.length)]
          await supabase.from('tiles').update({ zone }).eq('id', tile.id)
        }
      }
    }

    // ── Advance to next rolling phase ────────────────────────
    await supabase
      .from('rooms')
      .update({
        round: newRound,
        phase: 'rolling',
        board_seed: newSeed,
        phase_ends_at: new Date(Date.now() + PHASE_DURATIONS.rolling).toISOString(),
      })
      .eq('id', roomId)

    return {
      previous: 'income',
      next: 'rolling',
      new_round: newRound,
      reshuffled: newRound % SHUFFLE_EVERY_N_ROUNDS === 0,
    }
  }

  return { previous: currentPhase, next: 'unknown' }
}
