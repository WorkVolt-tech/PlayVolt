// EDGE FUNCTION 3: roll-dice
// ─────────────────────────────────────────────────────────────
// This is the most important function. It:
//   1. Generates a random roll (clients can't fake this)
//   2. Moves the player to the new position
//   3. Resolves what happens on that tile:
//      - Unowned property → returns 'buy' decision needed
//      - Owned property → triggers mini-game or deducts rent
//      - Event tile → creates an event row
//      - Tax tile → deducts money
//      - Bonus/GO tile → adds money
//
// How to call it from your frontend:
//   const res = await fetch('/functions/v1/roll-dice', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': 'Bearer ' + supabase.auth.session().access_token
//     },
//     body: JSON.stringify({ room_id: 'uuid-here' })
//   });
//   const { roll, new_position, tile, outcome } = await res.json();
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Mini-game types — chosen randomly when a player lands on an owned property
const MINIGAME_TYPES = ['reaction', 'tap_race', 'memory', 'aim', 'color_match', 'number_scramble', 'simon_says', 'dodge']

// Chaos event types — triggered by event tiles
const EVENT_TYPES = [
  'swap_properties',
  'steal_cash',
  'reverse_board',
  'double_rent',
  'everyone_moves_back',
  'powerup_drop',
]

// Tax amounts by tile name
const TAX_AMOUNTS: Record<string, number> = {
  'Income Tax': 100,
  'Luxury Tax': 75,
  'Super Tax': 150,
}

// Bonus amounts by tile name
const BONUS_AMOUNTS: Record<string, number> = {
  'GO': 200,
  'Free Parking': 50,
  'Payday': 150,
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { room_id } = await req.json()

    if (!room_id) {
      return new Response(
        JSON.stringify({ error: 'room_id is required' }),
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

    // ── STEP 1: Get player and room state ────────────────────
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', room_id)
      .eq('auth_user_id', user.id)
      .single()

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: 'Player not found in this room' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', room_id)
      .single()

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: 'Room not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (room.status !== 'playing') {
      return new Response(
        JSON.stringify({ error: 'Game is not in progress' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (room.phase !== 'rolling') {
      return new Response(
        JSON.stringify({ error: `Not the rolling phase — current phase: ${room.phase}` }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 2: Generate the roll ────────────────────────────
    // Two dice, 1–6 each. Server-generated — client cannot influence this.
    const die1 = Math.floor(Math.random() * 6) + 1
    const die2 = Math.floor(Math.random() * 6) + 1
    const roll = die1 + die2

    // Move player — wrap around 40 tiles
    const newPosition = (player.position + roll) % 40

    // Check if player passed GO (position wrapped around)
    const passedGo = newPosition < player.position

    // ── STEP 3: Find the tile they landed on ─────────────────
    const { data: tile, error: tileError } = await supabase
      .from('tiles')
      .select('*')
      .eq('room_id', room_id)
      .eq('position', newPosition)
      .single()

    if (tileError || !tile) throw tileError ?? new Error('Tile not found')

    // ── STEP 4: Resolve tile outcome ─────────────────────────
    let moneyDelta = 0
    let outcome: string
    let outcomeData: Record<string, unknown> = {}

    if (passedGo) {
      moneyDelta += 200 // Collect £200 for passing GO
    }

    if (tile.type === 'go') {
      // ── GO tile ──────────────────────────────────────────
      moneyDelta += BONUS_AMOUNTS['GO'] ?? 200
      outcome = 'go'

    } else if (tile.type === 'bonus') {
      // ── Bonus tile ───────────────────────────────────────
      moneyDelta += BONUS_AMOUNTS[tile.name] ?? 50
      outcome = 'bonus'
      outcomeData = { amount: BONUS_AMOUNTS[tile.name] ?? 50 }

    } else if (tile.type === 'tax') {
      // ── Tax tile ─────────────────────────────────────────
      const taxAmount = TAX_AMOUNTS[tile.name] ?? 100
      moneyDelta -= taxAmount
      outcome = 'tax'
      outcomeData = { amount: taxAmount }

    } else if (tile.type === 'event') {
      // ── Event tile — pick a random chaos event ───────────
      const eventType = randomFrom(EVENT_TYPES)
      const expiresInRounds = ['double_rent', 'reverse_board'].includes(eventType)
        ? room.round + 2  // lasts 2 rounds
        : null            // instant effect

      const { error: eventError } = await supabase
        .from('events')
        .insert({
          room_id,
          type: eventType,
          expires_at_round: expiresInRounds,
          resolved: expiresInRounds === null, // instant events are immediately resolved
        })

      if (eventError) throw eventError

      // Apply instant event effects
      if (eventType === 'steal_cash') {
        // Take 100 from the richest player
        const { data: richest } = await supabase
          .from('players')
          .select('id, money')
          .eq('room_id', room_id)
          .eq('status', 'active')
          .neq('id', player.id)
          .order('money', { ascending: false })
          .limit(1)
          .single()

        if (richest) {
          await supabase.from('players').update({ money: richest.money - 100 }).eq('id', richest.id)
          moneyDelta += 100
        }
      } else if (eventType === 'everyone_moves_back') {
        // Move all other active players back 3 spaces
        const { data: others } = await supabase
          .from('players')
          .select('id, position')
          .eq('room_id', room_id)
          .eq('status', 'active')
          .neq('id', player.id)

        if (others) {
          for (const other of others) {
            const newPos = (other.position - 3 + 40) % 40
            await supabase.from('players').update({ position: newPos }).eq('id', other.id)
          }
        }
      }

      outcome = 'event'
      outcomeData = { event_type: eventType }

    } else if (tile.type === 'property') {
      // ── Property tile ────────────────────────────────────
      const { data: property } = await supabase
        .from('properties')
        .select('*, owner:owner_id(id, display_name)')
        .eq('tile_id', tile.id)
        .single()

      if (!property || property.owner_id === null) {
        // Unowned — player can buy it
        outcome = 'unowned_property'
        outcomeData = {
          tile_id: tile.id,
          price: tile.base_price,
          name: tile.name,
          can_buy: player.money >= tile.base_price,
        }
      } else if (property.owner_id === player.id) {
        // Own it — nothing happens
        outcome = 'own_property'
        outcomeData = { message: 'You own this property' }
      } else {
        // Someone else owns it — trigger a mini-game!
        const MINIGAME_DURATION_MS = 15_000 // 15 seconds

        const minigameType = randomFrom(MINIGAME_TYPES)

        // Apply zone modifier to rent if applicable
        let rentModifier = 1
        if (tile.zone === 'double_rent') rentModifier = 2
        const rentAtStake = Math.floor(property.current_rent * rentModifier)

        const { data: minigame, error: mgError } = await supabase
          .from('mini_games')
          .insert({
            room_id,
            type: minigameType,
            participants: [player.id, property.owner_id],
            scores: {},
            status: 'active',
            expires_at: new Date(Date.now() + MINIGAME_DURATION_MS).toISOString(),
          })
          .select()
          .single()

        if (mgError) throw mgError

        // Update room phase to 'minigame'
        await supabase
          .from('rooms')
          .update({
            phase: 'minigame',
            phase_ends_at: new Date(Date.now() + MINIGAME_DURATION_MS).toISOString(),
          })
          .eq('id', room_id)

        outcome = 'minigame'
        outcomeData = {
          minigame_id: minigame.id,
          minigame_type: minigameType,
          rent_at_stake: rentAtStake,
          owner_name: property.owner?.display_name,
          expires_at: minigame.expires_at,
        }
      }
    } else {
      outcome = 'nothing'
    }

    // ── STEP 5: Update the player's position + money ─────────
    const { error: updateError } = await supabase
      .from('players')
      .update({
        position: newPosition,
        last_roll: roll,
        money: Math.max(0, player.money + moneyDelta), // never go below 0
      })
      .eq('id', player.id)

    if (updateError) throw updateError

    // Check if player is now bankrupt
    if (player.money + moneyDelta <= 0) {
      await supabase
        .from('players')
        .update({ status: 'bankrupt' })
        .eq('id', player.id)
    }

    // Update comeback_buff — player in last place gets it
    await updateComebackBuffs(supabase, room_id)

    // ── Done ─────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        roll: { die1, die2, total: roll },
        new_position: newPosition,
        passed_go: passedGo,
        tile: { name: tile.name, type: tile.type },
        outcome,
        outcome_data: outcomeData,
        money_after: Math.max(0, player.money + moneyDelta),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('roll-dice error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// Give the poorest active player a comeback_buff
async function updateComebackBuffs(supabase: ReturnType<typeof createClient>, roomId: string) {
  const { data: activePlayers } = await supabase
    .from('players')
    .select('id, money')
    .eq('room_id', roomId)
    .eq('status', 'active')
    .order('money', { ascending: true })

  if (!activePlayers || activePlayers.length < 2) return

  const poorestId = activePlayers[0].id

  // Clear all buffs then set only the poorest player's
  await supabase
    .from('players')
    .update({ comeback_buff: false })
    .eq('room_id', roomId)

  await supabase
    .from('players')
    .update({ comeback_buff: true })
    .eq('id', poorestId)
}
