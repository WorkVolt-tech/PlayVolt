// EDGE FUNCTION 4: submit-score
// ─────────────────────────────────────────────────────────────
// What it does:
//   1. Validates that the player is a participant in the mini-game
//   2. Records their score
//   3. If all participants have submitted, resolves the winner
//   4. Applies the outcome (winner pays less/no rent, loser pays full)
//   5. Advances room phase back to 'rolling'
//
// How to call it from your frontend (after the player finishes a mini-game):
//   const res = await fetch('/functions/v1/submit-score', {
//     method: 'POST',
//     headers: {
//       'Content-Type': 'application/json',
//       'Authorization': 'Bearer ' + supabase.auth.session().access_token
//     },
//     body: JSON.stringify({
//       minigame_id: 'uuid-here',
//       score: 450   // e.g. reaction time in ms, or points
//     })
//   });
//   const { resolved, winner_id } = await res.json();
// ─────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const { minigame_id, score } = await req.json()

    if (!minigame_id || score === undefined) {
      return new Response(
        JSON.stringify({ error: 'minigame_id and score are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (typeof score !== 'number' || score < 0 || score > 60_000) {
      return new Response(
        JSON.stringify({ error: 'Score must be a number between 0 and 60000' }),
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

    // ── STEP 1: Load the mini-game ───────────────────────────
    const { data: minigame, error: mgError } = await supabase
      .from('mini_games')
      .select('*')
      .eq('id', minigame_id)
      .single()

    if (mgError || !minigame) {
      return new Response(
        JSON.stringify({ error: 'Mini-game not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (minigame.status === 'resolved') {
      return new Response(
        JSON.stringify({ error: 'Mini-game already resolved' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check it hasn't expired
    if (new Date(minigame.expires_at) < new Date()) {
      // Auto-resolve with whoever submitted first if time ran out
      if (Object.keys(minigame.scores).length > 0) {
        await resolveMinigame(supabase, minigame)
      }
      return new Response(
        JSON.stringify({ error: 'Mini-game has expired' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 2: Verify the caller is a participant ───────────
    // Get the player row for this user in this room
    const { data: player } = await supabase
      .from('players')
      .select('id')
      .eq('auth_user_id', user.id)
      .in('room_id', [
        (await supabase.from('rooms').select('id').eq('id', minigame.room_id).single()).data?.id
      ])
      .single()

    if (!player || !minigame.participants.includes(player.id)) {
      return new Response(
        JSON.stringify({ error: 'You are not a participant in this mini-game' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Don't let them submit twice
    if (minigame.scores[player.id] !== undefined) {
      return new Response(
        JSON.stringify({ error: 'You already submitted a score' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // ── STEP 3: Record the score ─────────────────────────────
    const updatedScores = { ...minigame.scores, [player.id]: score }

    await supabase
      .from('mini_games')
      .update({ scores: updatedScores })
      .eq('id', minigame_id)

    // ── STEP 4: Check if all participants have submitted ─────
    const allSubmitted = minigame.participants.every(
      (pid: string) => updatedScores[pid] !== undefined
    )

    if (allSubmitted) {
      const result = await resolveMinigame(
        supabase,
        { ...minigame, scores: updatedScores }
      )
      return new Response(
        JSON.stringify({ resolved: true, ...result }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Still waiting for other players
    return new Response(
      JSON.stringify({
        resolved: false,
        waiting_for: minigame.participants.filter(
          (pid: string) => updatedScores[pid] === undefined
        ).length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('submit-score error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

// ── Resolve the mini-game outcome ────────────────────────────
// For reaction/tap_race: lower score = faster = winner
// For memory/aim: higher score = more points = winner
async function resolveMinigame(
  supabase: ReturnType<typeof createClient>,
  minigame: Record<string, unknown>
) {
  const scores = minigame.scores as Record<string, number>
  const participants = minigame.participants as string[]
  const type = minigame.type as string

  const isLowerBetter = type === 'reaction' || type === 'tap_race'

  // Find winner
  let winnerId = participants[0]
  let bestScore = scores[participants[0]] ?? (isLowerBetter ? Infinity : -Infinity)

  for (const pid of participants) {
    const s = scores[pid] ?? (isLowerBetter ? Infinity : -Infinity)
    if (isLowerBetter ? s < bestScore : s > bestScore) {
      bestScore = s
      winnerId = pid
    }
  }

  const loserId = participants.find(pid => pid !== winnerId)!

  // ── Apply rent outcome ────────────────────────────────────
  // Find the property this mini-game was for.
  // The property tile's position was recorded when roll-dice created the mini-game.
  // We look up the most recent unresolved property interaction in this room.
  const { data: loserPlayer } = await supabase
    .from('players')
    .select('money, position, room_id')
    .eq('id', loserId)
    .single()

  if (loserPlayer) {
    const { data: landedTile } = await supabase
      .from('tiles')
      .select('id')
      .eq('room_id', loserPlayer.room_id)
      .eq('position', loserPlayer.position)
      .single()

    if (landedTile) {
      const { data: property } = await supabase
        .from('properties')
        .select('current_rent, owner_id')
        .eq('tile_id', landedTile.id)
        .single()

      if (property && property.owner_id) {
        const { data: ownerPlayer } = await supabase
          .from('players')
          .select('money, comeback_buff')
          .eq('id', property.owner_id)
          .single()

        if (ownerPlayer) {
          // Winner pays nothing or reduced rent; loser pays full rent
          const loserPays  = winnerId === loserId  ? 0 : property.current_rent
          const winnerPays = winnerId !== loserId  ? 0 : Math.floor(property.current_rent * 0.5)

          const amountToTransfer = winnerId === property.owner_id
            ? loserPays   // challenger lost, pays owner
            : winnerPays  // owner lost, challenger pays half

          if (amountToTransfer > 0) {
            // Deduct from loser/half-payer
            const payerId = winnerId === property.owner_id ? loserId : winnerId
            const { data: payer } = await supabase
              .from('players')
              .select('money')
              .eq('id', payerId)
              .single()

            if (payer) {
              await supabase
                .from('players')
                .update({ money: Math.max(0, payer.money - amountToTransfer) })
                .eq('id', payerId)

              // Pay the owner
              await supabase
                .from('players')
                .update({ money: ownerPlayer.money + amountToTransfer })
                .eq('id', property.owner_id)
            }
          }
        }
      }
    }
  }

  // ── Mark mini-game resolved ──────────────────────────────
  await supabase
    .from('mini_games')
    .update({ status: 'resolved', winner_id: winnerId })
    .eq('id', minigame.id)

  // ── Advance room phase back to rolling ───────────────────
  const PHASE_DURATION_MS = 10_000 // 10 seconds per rolling phase
  await supabase
    .from('rooms')
    .update({
      phase: 'rolling',
      phase_ends_at: new Date(Date.now() + PHASE_DURATION_MS).toISOString(),
    })
    .eq('id', minigame.room_id)

  return {
    winner_id: winnerId,
    loser_id: loserId,
    scores,
  }
}
