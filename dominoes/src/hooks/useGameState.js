import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../lib/supabase'
import { chooseTile, getPersonality } from '../lib/botAI'

// ── Pure helpers ────────────────────────────────────────────────────────────
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function generateDominoSet() {
  const tiles = []
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++) tiles.push([a, b])
  return tiles
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function pipCount(hand) {
  return (hand || []).reduce((s, t) => s + t[0] + t[1], 0)
}

export function getPlayableTiles(hand, boardData, roomData) {
  // Round 1, first tile: must play 6-6
  if (!boardData?.tiles?.length) {
    if (roomData?.round === 1) {
      const doubleSix = hand.filter(t => t[0] === 6 && t[1] === 6)
      return doubleSix.length ? doubleSix : hand
    }
    return hand
  }
  const { left_end: L, right_end: R } = boardData
  return hand.filter(t => t[0] === L || t[1] === L || t[0] === R || t[1] === R)
}

export function canPlayOnSide(tile, side, boardData) {
  if (!boardData?.tiles?.length) return true
  const end = side === 'left' ? boardData.left_end : boardData.right_end
  return tile[0] === end || tile[1] === end
}

export function checkDekabess(tile, boardData) {
  if (!tile || tile[0] === tile[1] || !boardData) return false
  const { left_end: L, right_end: R } = boardData
  return (tile[0] === L && tile[1] === R) || (tile[1] === L && tile[0] === R)
}

function computeNewStreak(streak, resolvedSeat, isDek, mode) {
  const winnerKey = mode === 'asosye'
    ? (resolvedSeat === 0 || resolvedSeat === 2 ? 'A' : 'B')
    : resolvedSeat
  const sameWinner = mode === 'asosye' ? streak.team === winnerKey : streak.seat === winnerKey
  if (sameWinner) return { ...streak, count: streak.count + (isDek ? 2 : 1) }
  return { seat: resolvedSeat, team: winnerKey, count: isDek ? 2 : 1 }
}

// ── Main hook ───────────────────────────────────────────────────────────────
export function useGameState(myInfo, navigate) {
  const [roomData, setRoomData]         = useState(null)
  const [players, setPlayers]           = useState([])
  const [boardData, setBoardData]       = useState(null)
  const [selectedTile, setSelectedTile] = useState(null)
  const [showPicker, setShowPicker]     = useState(false)
  const [showOverlay, setShowOverlay]   = useState(false)
  const [toast, setToast]               = useState('')
  const [isProcessing, setProcessing]   = useState(false)

  const toastTimer    = useRef(null)
  const reloadTimer   = useRef(null)
  const processingRef = useRef(false)
  const boardRef      = useRef(null)
  const playersRef    = useRef([])
  const overlayShownRef = useRef(false)
  const botRunningRef   = useRef(false)

  useEffect(() => { boardRef.current = boardData }, [boardData])
  useEffect(() => { playersRef.current = players }, [players])

  // ── Profile stats ─────────────────────────────────────────────────────────
  // Every client records its OWN result. domino_players has no auth user_id,
  // so no single client can write stats for the whole table — each player must
  // record themselves.
  //
  // Recording is keyed on the room's persisted `round` number, NOT on
  // witnessing the status flip live. An earlier version required seeing
  // 'playing' -> 'round_end' in real time, which silently dropped rounds on a
  // refresh, a backgrounded phone, a dropped realtime event, or two reloads
  // coalescing. Keying on the round means a client that arrives late still
  // records it, and the localStorage key makes it idempotent across reloads.
  //
  // Identical in every game mode: it reads only the room row, never who ran
  // endRound and never whether opponents are bots.
  //   current_turn  = winning seat
  //   status 'finished' = Vyèj (streak reached 4)
  //   pending_point = Dekabess
  const statsInFlightRef = useRef(new Set())
  useEffect(() => {
    const room = roomData
    if (!room) return
    if (room.status !== 'round_end' && room.status !== 'finished') return

    const roundNo = room.round ?? 1
    const key = `dekabess_stat:${myInfo.roomId}:${roundNo}`

    if (statsInFlightRef.current.has(key)) return
    try { if (localStorage.getItem(key)) return } catch { /* storage blocked */ }

    // Claim before awaiting so a re-render mid-flight can't double-record.
    statsInFlightRef.current.add(key)

    ;(async () => {
      try {
        const { data: { user } } = await db.auth.getUser()
        if (!user) return

        const iWon  = room.current_turn === myInfo.seat
        const isMatchOver = room.status === 'finished'   // a match ends on a Vyèj
        const iVyej = iWon && isMatchOver
        const iDek  = iWon && !!room.pending_point

        const { error: statsErr } = await db.rpc('increment_profile_stats', {
          p_user_id: user.id,
          // Games counts MATCHES played, so it only ticks when the match ends.
          // Rounds (the total_wins column) counts individual rounds won.
          // Keeping both in their own unit is what stops the counters from
          // contradicting each other — a Vyèj needs 4 round wins, so Rounds
          // will always be >= 4x Vyèj, and Games stays comparable to Vyèj.
          p_games: isMatchOver ? 1 : 0,
          p_wins: iWon ? 1 : 0,
          p_vyej: iVyej ? 1 : 0,
          p_dekabess: iDek ? 1 : 0,
        })

        if (statsErr) {
          console.error('[stats] increment failed:', statsErr.message)
          statsInFlightRef.current.delete(key)   // allow a retry
          return
        }
        // Only mark recorded once the write actually succeeded.
        try { localStorage.setItem(key, '1') } catch { /* storage blocked */ }
      } catch (e) {
        console.error('[stats] exception (non-fatal):', e)
        statsInFlightRef.current.delete(key)
      }
    })()
  }, [roomData, myInfo])

  const loadGameState = useCallback(async () => {
    const [{ data: room }, { data: pData }, { data: bData }] = await Promise.all([
      db.from('domino_rooms').select('*').eq('id', myInfo.roomId).single(),
      db.from('domino_players').select('*').eq('room_id', myInfo.roomId).order('seat'),
      db.from('board').select('*').eq('room_id', myInfo.roomId).maybeSingle(),
    ])
    if (room)  setRoomData(room)
    if (pData) setPlayers(pData)
    if (bData !== undefined) setBoardData(bData)
    // Overlay is triggered by useEffect watching roomData.status
  }, [myInfo?.roomId])

  const scheduleReload = useCallback(() => {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(loadGameState, 50)
  }, [loadGameState])

  useEffect(() => {
    if (!myInfo) { navigate('/'); return }
    loadGameState()
    const ch = db.channel('game-' + myInfo.roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${myInfo.roomId}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_rooms', filter: `id=eq.${myInfo.roomId}` }, (payload) => {
        if (payload.new?.status === 'abandoned' && myInfo.seat !== 0) {
          alert('The host has left. Returning to lobby…')
          sessionStorage.removeItem('domino_player')
          navigate('/')
          return
        }
        scheduleReload()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board', filter: `room_id=eq.${myInfo.roomId}` }, scheduleReload)
      .subscribe()
    return () => { db.removeChannel(ch); clearTimeout(reloadTimer.current) }
  }, [])

  const showToastMsg = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }, [])

  useEffect(() => {
    if (!roomData) return
    const isMyTurn = roomData.current_turn === myInfo.seat && roomData.status === 'playing'
    const active = players.find(p => p.seat === roomData.current_turn)
    if (isMyTurn) showToastMsg('Your turn!')
    else if (active) showToastMsg(`${active.nickname}'s turn`)
    if (roomData.status === 'finished' || roomData.status === 'round_end') {
      overlayShownRef.current = true
      setShowOverlay(true)
    } else if (roomData.status === 'playing') {
      overlayShownRef.current = false
      setShowOverlay(false)
    }
  }, [roomData?.current_turn, roomData?.status])

  const me          = players.find(p => p.seat === myInfo?.seat)
  const hand        = me?.hand || []
  const isMyTurn    = roomData?.current_turn === myInfo?.seat && roomData?.status === 'playing'
  const playable    = getPlayableTiles(hand, boardData, roomData)
  const hasTilesOnBoard = !!boardData?.tiles?.length

  const endRound = useCallback(async (winningSeat, isDek) => {
    try {
      const { data: room, error: roomErr } = await db.from('domino_rooms').select('*').eq('id', myInfo.roomId).single()
      if (!room) return
      if (room.status !== 'playing') {
        if (room.status === 'round_end' || room.status === 'finished') await loadGameState()
        return
      }
      
      const mode   = room.game_mode || 'chien'
      const streak = room.streak || { seat: null, team: null, count: 0 }
      let resolvedSeat = winningSeat
      if (winningSeat === null) {
        const sorted = playersRef.current.map(p => ({ seat: p.seat, pips: pipCount(p.hand) })).sort((a, b) => a.pips - b.pips)
        resolvedSeat = sorted[0].seat
      }
      const newStreak = computeNewStreak(streak, resolvedSeat, isDek, mode)
      const isVyej    = newStreak.count >= 4
      const winnerKey = mode === 'asosye' ? (resolvedSeat === 0 || resolvedSeat === 2 ? 'A' : 'B') : resolvedSeat
      
      // Record Vyèj in Wa Tab La leaderboard — for the winner only
      if (isVyej && resolvedSeat === myInfo.seat) {
        // Get or create persistent player ID
        let playerId = localStorage.getItem('dekabess_player_id')
        if (!playerId) {
          playerId = crypto.randomUUID()
          localStorage.setItem('dekabess_player_id', playerId)
        }
        const weekStart = new Date()
        const day = weekStart.getDay()
        weekStart.setDate(weekStart.getDate() - day + (day === 0 ? -6 : 1))
        const weekStr = weekStart.toISOString().split('T')[0]
        const leaderMode = room.game_mode === 'asosye' ? 'teams' : 'solo'
        const nickname = players.find(p => p.seat === myInfo.seat)?.nickname || 'Player'
        const { error: wtlErr } = await db.rpc('increment_wa_tab_la', {
          p_player_id: playerId,
          p_nickname: nickname,
          p_mode: leaderMode,
          p_week_start: weekStr,
        })
        if (wtlErr) {
          await db.from('wa_tab_la').upsert({
            player_id: playerId,
            player_nickname: nickname,
            mode: leaderMode,
            week_start: weekStr,
            wins: 1,
          }, { onConflict: 'player_id,week_start,mode' })
        }
      }
      
      await Promise.all([
        db.from('game_events').delete().eq('room_id', myInfo.roomId),
        db.from('board').delete().eq('room_id', myInfo.roomId),
      ])
      const { error: updateErr } = await db.from('domino_rooms').update({
        status: isVyej ? 'finished' : 'round_end',
        current_turn: resolvedSeat,
        streak: newStreak,
        match_winner: isVyej ? winnerKey : null,
        pending_point: isDek,
        blocked: winningSeat === null,
      }).eq('id', myInfo.roomId)
      if (updateErr) { await loadGameState(); return }
      // Profile stats are NOT written here. endRound runs on exactly one
      // client (the player whose hand emptied, or the host when a bot wins),
      // so writing stats here only ever recorded that one player — everyone
      // else got nothing, and it behaved differently per game mode. Each
      // client now records its own result from the room row; see the
      // stats-recording effect below.
      await loadGameState()
      
      // If winner is a bot and we are the host, auto-start next round after delay
      if (!isVyej && myInfo.seat === 0) {
        const winnerPlayer = playersRef.current.find(p => p.seat === resolvedSeat)
        if (winnerPlayer?.is_ai) {
          // Wait longer when Dekabess — overlay takes 3.8s + round overlay needs time
          const autoStartDelay = isDek ? 7000 : 4000
          setTimeout(async () => {
            const { data: latestRoom } = await db.from('domino_rooms').select('current_turn, round, status').eq('id', myInfo.roomId).single()
            if (latestRoom?.status !== 'round_end') return
            const nextRound = (latestRoom.round ?? 1) + 1
            const tiles = shuffle(generateDominoSet())
            const hands = [tiles.slice(0,7), tiles.slice(7,14), tiles.slice(14,21), tiles.slice(21,28)]
            for (let i = 0; i < 4; i++)
              await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myInfo.roomId).eq('seat', i)
            await db.from('board').delete().eq('room_id', myInfo.roomId)
            await db.from('board').insert({ room_id: myInfo.roomId, tiles: [], left_end: null, right_end: null })
            overlayShownRef.current = false
            setShowOverlay(false)
            await db.from('domino_rooms').update({
              status: 'playing',
              current_turn: resolvedSeat,
              round: nextRound,
            }).eq('id', myInfo.roomId)
          }, autoStartDelay)
        }
      }
    } catch(err) {
      console.error('[endRound] EXCEPTION:', err)
      await loadGameState()
    }
  }, [myInfo, loadGameState])

  const advanceTurn = useCallback(async (newHand, lastTile, updatedBoard) => {
    if (newHand.length === 0) {
      const boardToCheck = updatedBoard || boardRef.current
      await endRound(myInfo.seat, lastTile ? checkDekabess(lastTile, boardToCheck) : false)
      return
    }
    // Check if all 4 players passed consecutively — only valid if board has tiles
    if (boardRef.current?.tiles?.length > 0) {
      const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(4)
      if (events?.length === 4 && events.every(e => e.action === 'pass')) { await endRound(null, false); return }
    }
    // Read actual current_turn from DB to advance correctly
    const { data: latestRoom } = await db.from('domino_rooms').select('current_turn').eq('id', myInfo.roomId).single()
    const fromSeat = latestRoom?.current_turn ?? myInfo.seat
    const nextSeat = (fromSeat + 1) % 4
    await db.from('domino_rooms').update({ current_turn: nextSeat }).eq('id', myInfo.roomId)
  }, [myInfo, endRound])

  // ── Single-round-trip move ───────────────────────────────────────────────
  // Sends one move to the play_move RPC, which performs the same writes the
  // original code does (board, hand, event, block check, turn advance) in one
  // request and one transaction. All game decisions stay in this file.
  //
  // Returns:
  //   { blocked }  — success
  //   'missing'    — play_move not installed; caller runs the ORIGINAL code
  //   'error'      — any other failure; the transaction rolled back, so
  //                  nothing was written — resync and let the player retry.
  //                  (Deliberately NOT falling back here: if the RPC committed
  //                  but the response was lost, re-running the writes would
  //                  advance the turn twice and skip a player.)
  const commitMove = useCallback(async ({ action, tile, board, hand, advance, checkBlock }) => {
    const { data, error } = await db.rpc('play_move', {
      p_room_id: myInfo.roomId,
      p_seat: myInfo.seat,
      p_action: action,
      p_tile: tile ?? null,
      p_board: board ?? null,
      p_hand: hand ?? null,
      p_advance: advance,
      p_check_block: checkBlock,
    })
    if (error) {
      const missing =
        error.code === 'PGRST202' ||
        error.code === '42883' ||
        /could not find the function/i.test(error.message || '')
      if (missing) return 'missing'
      console.error('[play_move] failed, resyncing:', error.message)
      loadGameState()
      return 'error'
    }
    return { blocked: !!data?.blocked }
  }, [myInfo, loadGameState])

  const placeTile = useCallback(async (tile, idx, side) => {
    if (processingRef.current) return
    processingRef.current = true
    setProcessing(true)
    const currentBoard = boardRef.current
    const currentHand  = playersRef.current.find(p => p.seat === myInfo.seat)?.hand || []
    const newHand = currentHand.filter((_, i) => i !== idx)

    // Fast path. Mirrors advanceTurn exactly: empty hand -> endRound (no
    // advance, no block check); otherwise block check when the board has
    // tiles, then advance. Returns false only when the RPC isn't installed.
    const finishPlace = async (boardPatch, dekBoard) => {
      const handEmpty = newHand.length === 0
      const res = await commitMove({
        action: 'place',
        tile,
        board: boardPatch,
        hand: newHand,
        advance: !handEmpty,
        checkBlock: !handEmpty && boardRef.current?.tiles?.length > 0,
      })
      if (res === 'missing') return false
      if (res === 'error') return true
      if (handEmpty) {
        await endRound(myInfo.seat, checkDekabess(tile, dekBoard || boardRef.current))
      } else if (res.blocked) {
        await endRound(null, false)
      } else {
        // Show the mover their own tile now instead of waiting for the
        // realtime echo. Read-only — same query realtime triggers anyway.
        loadGameState()
      }
      return true
    }

    try {
      // Duplicate-drop guard — mirrors the bot path's existing `alreadyPlayed`
      // check. Board.jsx has several independent drop paths (DropZone registry,
      // custom-drop, tile-touch-drop-board, two native HTML5 handlers) and more
      // than one can fire for a single touch gesture. processingRef only blocks
      // a duplicate arriving DURING the first call; one arriving after it
      // finished would remove a second tile from the hand and could leave
      // newHand empty — falsely triggering the empty-hand win. Every domino is
      // unique in a 28-tile set, so "already on the board" means this exact
      // placement already happened: make it a no-op.
      const alreadyPlayed = currentBoard?.tiles?.some(
        e => e.tile[0] === tile[0] && e.tile[1] === tile[1]
      )
      if (alreadyPlayed) return

      if (!currentBoard?.tiles?.length || side === 'first') {
        const boardPatch = { tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }
        if (!(await finishPlace(boardPatch, undefined))) {
          // Original path (play_move not installed) — unchanged.
          await db.from('board').update({ tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }).eq('room_id', myInfo.roomId)
          await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
          await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'place', tile })
          await advanceTurn(newHand, tile)
        }
      } else {
        const end = side === 'left' ? currentBoard.left_end : currentBoard.right_end
        let flipped = false, newOpenEnd
        if (side === 'right') {
          if (tile[1] === end) { flipped = true; newOpenEnd = tile[0] } else { newOpenEnd = tile[1] }
        } else {
          if (tile[0] === end) { flipped = true; newOpenEnd = tile[1] } else { newOpenEnd = tile[0] }
        }
        const newEntry    = { tile, flipped }
        const newTiles    = side === 'left' ? [newEntry, ...currentBoard.tiles] : [...currentBoard.tiles, newEntry]
        const newLeftEnd  = side === 'left'  ? newOpenEnd : currentBoard.left_end
        const newRightEnd = side === 'right' ? newOpenEnd : currentBoard.right_end
        const oldEnds = { left_end: currentBoard.left_end, right_end: currentBoard.right_end }
        const boardPatch = { tiles: newTiles, left_end: newLeftEnd, right_end: newRightEnd }
        if (!(await finishPlace(boardPatch, oldEnds))) {
          // Original path (play_move not installed) — unchanged.
          await db.from('board').update({ tiles: newTiles, left_end: newLeftEnd, right_end: newRightEnd }).eq('room_id', myInfo.roomId)
          await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
          await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'place', tile })
          // Pass OLD board ends for Dekabess check — tile must match both ends BEFORE it's placed
          await advanceTurn(newHand, tile, { left_end: currentBoard.left_end, right_end: currentBoard.right_end })
        }
      }
    } finally {
      setSelectedTile(null)
      setShowPicker(false)
      processingRef.current = false
      setProcessing(false)
    }
  }, [myInfo, advanceTurn, commitMove, endRound, loadGameState])

  const selectTile = useCallback((tile, idx) => {
    if (!isMyTurn) return
    // Toggle deselect
    if (selectedTile?.idx === idx) { setSelectedTile(null); setShowPicker(false); return }
    setSelectedTile({ tile, idx })
    // Just select — user then drags to board or uses side picker / drop zones
    // Only auto-place first tile (no choice needed)
    if (!hasTilesOnBoard) { placeTile(tile, idx, 'first'); return }
  }, [isMyTurn, selectedTile, hasTilesOnBoard, placeTile])

  const passMove = useCallback(async () => {
    // An empty hand can't legally pass; keep the original handling for it.
    if (hand.length > 0) {
      const res = await commitMove({
        action: 'pass',
        tile: null,
        board: null,
        hand: null,
        advance: true,
        checkBlock: boardRef.current?.tiles?.length > 0,
      })
      if (res === 'error') return
      if (res !== 'missing') {
        if (res.blocked) await endRound(null, false)
        else loadGameState()
        return
      }
    }
    // Original path (play_move not installed) — unchanged.
    await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'pass', tile: null })
    await advanceTurn(hand, null)
  }, [hand, myInfo, advanceTurn, commitMove, endRound, loadGameState])

  const startNextRound = useCallback(async () => {
    overlayShownRef.current = false
    setShowOverlay(false)

    // Get current room
    const { data: room } = await db.from('domino_rooms').select('current_turn, round, game_mode').eq('id', myInfo.roomId).single()
    if (!room) return

    const winnerSeat = room.current_turn ?? 0
    const nextRound = (room.round ?? 1) + 1
    const isSoloMode = room.game_mode === 'solo'

    // Only the winner (or host in solo) deals the next round
    // Everyone else just waits for the subscription to update them
    if (myInfo.seat !== winnerSeat && !isSoloMode) {
      // Non-winner clicked — just close overlay and wait
      await loadGameState()
      return
    }

    const tiles = shuffle(generateDominoSet())
    const hands = [tiles.slice(0,7), tiles.slice(7,14), tiles.slice(14,21), tiles.slice(21,28)]
    for (let i = 0; i < 4; i++)
      await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myInfo.roomId).eq('seat', i)
    await db.from('board').delete().eq('room_id', myInfo.roomId)
    await db.from('board').insert({ room_id: myInfo.roomId, tiles: [], left_end: null, right_end: null })
    await db.from('game_events').delete().eq('room_id', myInfo.roomId)
    await db.from('domino_rooms').update({
      status: 'playing',
      current_turn: winnerSeat,
      round: nextRound,
      pending_point: false,
      blocked: false,
    }).eq('id', myInfo.roomId)
    await loadGameState()
  }, [myInfo, loadGameState])

  const replaceWithBot = useCallback(async (seat) => {
    if (myInfo.seat !== 0) return // only host can do this
    const allBotNames = ['Ti-Djo', 'Ti-Cam', 'Ti-Jean', 'Mémère', 'Ti-Pierre', 'Bouki', 'Bourik']
    const usedNames = players.map(p => p.nickname)
    const available = allBotNames.filter(n => !usedNames.includes(n))
    const botName = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : allBotNames[Math.floor(Math.random() * allBotNames.length)]
    // Give bot a hand from remaining tiles or empty hand
    await db.from('domino_players').update({
      nickname: botName,
      is_ai: true,
      is_connected: true,
    }).eq('room_id', myInfo.roomId).eq('seat', seat)
  }, [myInfo])

  const leaveTable = useCallback(async () => {
    if (!confirm('Leave this table?')) return
    if (myInfo.seat === 0) {
      // Host leaves — end the game
      await Promise.all([
        db.from('game_events').delete().eq('room_id', myInfo.roomId),
        db.from('board').delete().eq('room_id', myInfo.roomId),
        db.from('domino_players').delete().eq('room_id', myInfo.roomId),
      ])
      await db.from('domino_rooms').delete().eq('id', myInfo.roomId)
    } else {
      // Non-host leaves — replace with bot immediately
      const allBotNames = ['Ti-Djo', 'Ti-Cam', 'Ti-Jean']
      const usedNames = players.map(p => p.nickname)
      const available = allBotNames.filter(n => !usedNames.includes(n))
      const botName = available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : allBotNames[Math.floor(Math.random() * allBotNames.length)]
      await db.from('domino_players').update({
        nickname: botName,
        is_ai: true,
        is_connected: true,
      }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
    }
    sessionStorage.removeItem('domino_player')
    navigate('/')
  }, [myInfo, navigate])

  // Watch for disconnected players and replace with bots (host only)
  useEffect(() => {
    if (!roomData || !players.length || roomData.status !== 'playing') return
    if (myInfo.seat !== 0) return
    players.forEach(p => {
      if (!p.is_ai && !p.is_connected && p.seat !== myInfo.seat) {
        const allBotNames = ['Ti-Djo', 'Ti-Cam', 'Ti-Jean']
        const usedNames = players.map(pl => pl.nickname)
        const available = allBotNames.filter(n => !usedNames.includes(n))
        const botName = available.length > 0
          ? available[Math.floor(Math.random() * available.length)]
          : allBotNames[Math.floor(Math.random() * allBotNames.length)]
        db.from('domino_players').update({
          nickname: botName, is_ai: true, is_connected: true,
        }).eq('room_id', myInfo.roomId).eq('seat', p.seat)
      }
    })
  }, [players])

  // AI turns
  useEffect(() => {
    if (!roomData || !players.length || roomData.status !== 'playing') return
    const currentPlayer = players.find(p => p.seat === roomData.current_turn)
    if (!currentPlayer?.is_ai) return
    // Only the host (seat 0) runs AI logic to prevent double-fire
    if (myInfo.seat !== 0) return
    // Prevent double-fire within the same turn
    if (botRunningRef.current) return
    const board = boardRef.current
    // Safety reset — if bot gets stuck for 6s, force unlock
    const safetyTimer = setTimeout(() => { botRunningRef.current = false }, 6000)
    const timer = setTimeout(async () => {
      if (botRunningRef.current) return
      botRunningRef.current = true
      const botHand     = currentPlayer.hand || []
      const botPlayable = getPlayableTiles(botHand, board, roomData)
      if (botPlayable.length === 0) {
        await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'pass', tile: null })
        if (board?.tiles?.length > 0) {
          const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(4)
          if (events?.length === 4 && events.every(e => e.action === 'pass')) { botRunningRef.current = false; await endRound(null, false); return }
        }
        await db.from('domino_rooms').update({ current_turn: (currentPlayer.seat + 1) % 4 }).eq('id', myInfo.roomId)
        botRunningRef.current = false
        return
      }
      // Use personality-based AI engine
      const personality = getPersonality(currentPlayer.nickname)
      const move = chooseTile(personality, botPlayable, botHand, board)
      let tile = move?.tile || botPlayable[0]
      // Override side from AI recommendation if available
      const aiSide = move?.side
      const tileIdx = botHand.findIndex(t => t[0] === tile[0] && t[1] === tile[1])
      const newHand = botHand.filter((_, i) => i !== tileIdx)
      // Verify tile not already on board (prevent duplicate on double-fire)
      const alreadyPlayed = board?.tiles?.some(e => e.tile[0] === tile[0] && e.tile[1] === tile[1])
      if (alreadyPlayed) { botRunningRef.current = false; return }
      if (!board?.tiles?.length) {
        await db.from('board').update({ tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }).eq('room_id', myInfo.roomId)
        await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', currentPlayer.seat)
        await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'place', tile })
      } else {
        const cL   = canPlayOnSide(tile, 'left', board)
        const cR   = canPlayOnSide(tile, 'right', board)
        // Use AI-recommended side if valid, else fallback
        const side = (aiSide && aiSide !== 'first' && ((aiSide === 'left' && cL) || (aiSide === 'right' && cR)))
          ? aiSide
          : (cL && cR) ? (Math.random() < 0.5 ? 'left' : 'right') : cL ? 'left' : 'right'
        const end  = side === 'left' ? board.left_end : board.right_end
        let flipped = false, newOpenEnd
        if (side === 'right') {
          if (tile[1] === end) { flipped = true; newOpenEnd = tile[0] } else { newOpenEnd = tile[1] }
        } else {
          if (tile[0] === end) { flipped = true; newOpenEnd = tile[1] } else { newOpenEnd = tile[0] }
        }
        const newTiles    = side === 'left' ? [{ tile, flipped }, ...board.tiles] : [...board.tiles, { tile, flipped }]
        const newLeftEnd  = side === 'left'  ? newOpenEnd : board.left_end
        const newRightEnd = side === 'right' ? newOpenEnd : board.right_end
        await db.from('board').update({ tiles: newTiles, left_end: newLeftEnd, right_end: newRightEnd }).eq('room_id', myInfo.roomId)
        await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', currentPlayer.seat)
        await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'place', tile })
      }
      if (newHand.length === 0) { botRunningRef.current = false; await endRound(currentPlayer.seat, checkDekabess(tile, board)); return }
      await db.from('domino_rooms').update({ current_turn: (currentPlayer.seat + 1) % 4 }).eq('id', myInfo.roomId)
      botRunningRef.current = false
    }, 1200)
    return () => { clearTimeout(timer); clearTimeout(safetyTimer); botRunningRef.current = false }
  }, [roomData?.current_turn, roomData?.status])

  return {
    roomData, players, boardData, selectedTile, showPicker,
    showOverlay, toast, isProcessing,
    me, hand, isMyTurn, playable, hasTilesOnBoard,
    selectTile, placeTile, passMove,
    startNextRound, leaveTable, setShowOverlay, replaceWithBot,
    cancelSelection: () => { setSelectedTile(null); setShowPicker(false) },
  }
}
