import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../lib/supabase'

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

  useEffect(() => { boardRef.current = boardData }, [boardData])
  useEffect(() => { playersRef.current = players }, [players])

  const loadGameState = useCallback(async () => {
    const [{ data: room }, { data: pData }, { data: bData }] = await Promise.all([
      db.from('domino_rooms').select('*').eq('id', myInfo.roomId).single(),
      db.from('domino_players').select('*').eq('room_id', myInfo.roomId).order('seat'),
      db.from('board').select('*').eq('room_id', myInfo.roomId).maybeSingle(),
    ])
    if (room)  setRoomData(room)
    if (pData) setPlayers(pData)
    if (bData !== undefined) setBoardData(bData)
    if ((room?.status === 'finished' || room?.status === 'round_end') && !overlayShownRef.current) {
      overlayShownRef.current = true
      setShowOverlay(true)
    }
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
    if ((roomData.status === 'finished' || roomData.status === 'round_end') && !overlayShownRef.current) {
      overlayShownRef.current = true
      setShowOverlay(true)
    }
  }, [roomData?.current_turn, roomData?.status])

  const me          = players.find(p => p.seat === myInfo?.seat)
  const hand        = me?.hand || []
  const isMyTurn    = roomData?.current_turn === myInfo?.seat && roomData?.status === 'playing'
  const playable    = getPlayableTiles(hand, boardData, roomData)
  const hasTilesOnBoard = !!boardData?.tiles?.length

  const endRound = useCallback(async (winningSeat, isDek) => {
    console.log('[endRound] called, winningSeat:', winningSeat, 'isDek:', isDek)
    try {
      const { data: room, error: roomErr } = await db.from('domino_rooms').select('*').eq('id', myInfo.roomId).single()
      console.log('[endRound] room status:', room?.status, 'error:', roomErr)
      if (!room) { console.log('[endRound] no room found'); return }
      if (room.status !== 'playing') { console.log('[endRound] guard hit, status:', room.status); return }
      
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
      
      console.log('[endRound] resolvedSeat:', resolvedSeat, 'isVyej:', isVyej, 'newStreak:', newStreak)
      
      const [delEvents, delBoard] = await Promise.all([
        db.from('game_events').delete().eq('room_id', myInfo.roomId),
        db.from('board').delete().eq('room_id', myInfo.roomId),
      ])
      console.log('[endRound] deleted events/board, errors:', delEvents.error, delBoard.error)
      
      const { error: updateErr } = await db.from('domino_rooms').update({
        status: isVyej ? 'finished' : 'round_end',
        current_turn: resolvedSeat,
        streak: newStreak,
        match_winner: isVyej ? winnerKey : null,
        pending_point: isDek,
      }).eq('id', myInfo.roomId)
      console.log('[endRound] room update error:', updateErr)
      
      await loadGameState()
      console.log('[endRound] loadGameState done, showOverlay should be true')
      
      // If winner is a bot and we are the host, auto-start next round after delay
      if (!isVyej && myInfo.seat === 0) {
        const winnerPlayer = playersRef.current.find(p => p.seat === resolvedSeat)
        if (winnerPlayer?.is_ai) {
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
          }, 2500)
        }
      }
    } catch(err) {
      console.error('[endRound] EXCEPTION:', err)
      await loadGameState()
    }
  }, [myInfo, loadGameState])

  const advanceTurn = useCallback(async (newHand, lastTile) => {
    if (newHand.length === 0) {
      await endRound(myInfo.seat, lastTile ? checkDekabess(lastTile, boardRef.current) : false)
      return
    }
    // Check if all 4 players passed consecutively — only valid if board has tiles
    if (boardRef.current?.tiles?.length > 0) {
      const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(4)
      if (events?.length === 4 && events.every(e => e.action === 'pass')) { await endRound(null, false); return }
    }
    // Always advance from the seat that just played (myInfo.seat for human, currentPlayer.seat for bots)
    const nextSeat = (myInfo.seat + 1) % 4
    await db.from('domino_rooms').update({ current_turn: nextSeat }).eq('id', myInfo.roomId)
  }, [myInfo, endRound])

  const placeTile = useCallback(async (tile, idx, side) => {
    if (processingRef.current) return
    processingRef.current = true
    setProcessing(true)
    const currentBoard = boardRef.current
    const currentHand  = playersRef.current.find(p => p.seat === myInfo.seat)?.hand || []
    const newHand = currentHand.filter((_, i) => i !== idx)

    if (!currentBoard?.tiles?.length || side === 'first') {
      await db.from('board').update({ tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }).eq('room_id', myInfo.roomId)
      await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
      await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'place', tile })
      await advanceTurn(newHand, tile)
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
      await db.from('board').update({ tiles: newTiles, left_end: newLeftEnd, right_end: newRightEnd }).eq('room_id', myInfo.roomId)
      await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
      await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'place', tile })
      await advanceTurn(newHand, tile)
    }
    setSelectedTile(null)
    setShowPicker(false)
    processingRef.current = false
    setProcessing(false)
  }, [myInfo, advanceTurn])

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
    await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'pass', tile: null })
    await advanceTurn(hand, null)
  }, [hand, myInfo, advanceTurn])

  const startNextRound = useCallback(async () => {
    overlayShownRef.current = false
    setShowOverlay(false)
    // Get current room to find winner seat and round number
    const { data: room } = await db.from('domino_rooms').select('current_turn, round').eq('id', myInfo.roomId).single()
    const winnerSeat = room?.current_turn ?? 0
    const nextRound = (room?.round ?? 1) + 1

    const tiles = shuffle(generateDominoSet())
    const hands = [tiles.slice(0,7), tiles.slice(7,14), tiles.slice(14,21), tiles.slice(21,28)]
    for (let i = 0; i < 4; i++)
      await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myInfo.roomId).eq('seat', i)
    await db.from('board').delete().eq('room_id', myInfo.roomId)
    await db.from('board').insert({ room_id: myInfo.roomId, tiles: [], left_end: null, right_end: null })
    // Winner of last round starts next round
    await db.from('domino_rooms').update({
      status: 'playing',
      current_turn: winnerSeat,
      round: nextRound,
      pending_point: false,
    }).eq('id', myInfo.roomId)
    // Reload state — setShowOverlay stays false since status is now 'playing'
    await loadGameState()
  }, [myInfo, loadGameState])

  const leaveTable = useCallback(async () => {
    if (!confirm('Leave this table?')) return
    if (myInfo.seat === 0) {
      await Promise.all([
        db.from('game_events').delete().eq('room_id', myInfo.roomId),
        db.from('board').delete().eq('room_id', myInfo.roomId),
        db.from('domino_players').delete().eq('room_id', myInfo.roomId),
      ])
      await db.from('domino_rooms').delete().eq('id', myInfo.roomId)
    } else {
      await db.from('domino_players').update({ is_connected: false }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
    }
    sessionStorage.removeItem('domino_player')
    navigate('/')
  }, [myInfo, navigate])

  // AI turns
  useEffect(() => {
    if (!roomData || !players.length || roomData.status !== 'playing') return
    const currentPlayer = players.find(p => p.seat === roomData.current_turn)
    if (!currentPlayer?.is_ai) return
    // Only the host (seat 0) runs AI logic to prevent double-fire
    if (myInfo.seat !== 0) return
    const board = boardRef.current
    const timer = setTimeout(async () => {
      const botHand     = currentPlayer.hand || []
      const botPlayable = getPlayableTiles(botHand, board, roomData)
      if (botPlayable.length === 0) {
        await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'pass', tile: null })
        if (board?.tiles?.length > 0) {
          const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(4)
          if (events?.length === 4 && events.every(e => e.action === 'pass')) { await endRound(null, false); return }
        }
        await db.from('domino_rooms').update({ current_turn: (currentPlayer.seat + 1) % 4 }).eq('id', myInfo.roomId)
        return
      }
      // AI personality based on seat
      // Seat 1 = Djo (Smart), Seat 2 = Ti-Cam (Risky), Seat 3 = Jean (Aggressive)
      let tile
      const seat = currentPlayer.seat
      
      if (seat === 1) {
        // Djo - Smart: prefer non-doubles, avoid getting stuck with doubles
        // unless playing the double frees up options
        const nonDoubles = botPlayable.filter(t => t[0] !== t[1])
        const doubles = botPlayable.filter(t => t[0] === t[1])
        if (nonDoubles.length > 0) {
          // Play the non-double that leaves most options (highest pip value = more connections)
          tile = nonDoubles.sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]))[0]
        } else {
          // Only doubles left, play lowest double
          tile = doubles.sort((a, b) => a[0] - b[0])[0]
        }
      } else if (seat === 2) {
        // Ti-Cam - Risky: play doubles first to clear them, then random
        const doubles = botPlayable.filter(t => t[0] === t[1])
        if (doubles.length > 0) {
          tile = doubles[Math.floor(Math.random() * doubles.length)]
        } else {
          tile = botPlayable[Math.floor(Math.random() * botPlayable.length)]
        }
      } else if (seat === 3) {
        // Jean - Aggressive: play highest pip count to drain hand fast and block others
        tile = botPlayable.sort((a, b) => (b[0] + b[1]) - (a[0] + a[1]))[0]
      } else {
        tile = botPlayable[Math.floor(Math.random() * botPlayable.length)]
      }
      const tileIdx = botHand.findIndex(t => t[0] === tile[0] && t[1] === tile[1])
      const newHand = botHand.filter((_, i) => i !== tileIdx)
      if (!board?.tiles?.length) {
        await db.from('board').update({ tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }).eq('room_id', myInfo.roomId)
        await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', currentPlayer.seat)
        await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'place', tile })
      } else {
        const cL   = canPlayOnSide(tile, 'left', board)
        const cR   = canPlayOnSide(tile, 'right', board)
        const side = (cL && cR) ? (Math.random() < 0.5 ? 'left' : 'right') : cL ? 'left' : 'right'
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
      if (newHand.length === 0) { await endRound(currentPlayer.seat, checkDekabess(tile, board)); return }
      await db.from('domino_rooms').update({ current_turn: (currentPlayer.seat + 1) % 4 }).eq('id', myInfo.roomId)
    }, 1200)
    return () => clearTimeout(timer)
  }, [roomData?.current_turn, roomData?.status])

  return {
    roomData, players, boardData, selectedTile, showPicker,
    showOverlay, toast, isProcessing,
    me, hand, isMyTurn, playable, hasTilesOnBoard,
    selectTile, placeTile, passMove,
    startNextRound, leaveTable, setShowOverlay,
    cancelSelection: () => { setSelectedTile(null); setShowPicker(false) },
  }
}
