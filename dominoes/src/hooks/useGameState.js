import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from '../lib/supabase'
import { weekStartUTC } from '../lib/skins'
import { chooseTile, getPersonality, isExpertBot } from '../lib/botAI'

// Turn timing. Off by default; switch it on from the console with
//   localStorage.setItem('domino_timing','1')   (then reload)
// and off again with localStorage.removeItem('domino_timing').
const TIMING = (() => {
  try { return !!localStorage.getItem('domino_timing') } catch { return false }
})()
const tlog = (...a) => { if (TIMING) console.log('[timing]', ...a) }

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

// ── Dealing for 2, 3 or 4 players (every tile dealt) ──
//   4 players: 7 each.  3 players: the 0-0 is set aside, 9 each.  2 players: 14 each.
// ── The pile variant (2 or 3 players): 7 tiles each, the rest face down in a
//    pile — a player who can't play draws instead of knocking.
export function dealTable(n = 4, variant = 'all') {
  if (variant === 'pile' && n < 4) {
    const tiles = shuffle(generateDominoSet())
    const hands = Array.from({ length: n }, (_, i) => tiles.slice(i * 7, i * 7 + 7))
    return { hands, pile: tiles.slice(n * 7) }
  }
  return { hands: dealHands(n), pile: [] }
}

export function dealHands(n = 4) {
  let tiles = shuffle(generateDominoSet())
  if (n === 3) {
    tiles = tiles.filter(t => !(t[0] === 0 && t[1] === 0))
    return [0, 1, 2].map(i => tiles.slice(i * 9, i * 9 + 9))
  }
  if (n === 2) return [0, 1].map(i => tiles.slice(i * 14, i * 14 + 14))
  return [0, 1, 2, 3].map(i => tiles.slice(i * 7, i * 7 + 7))
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
  // Round 1, first tile: must play 6-6 — or, with a pile, the double the room
  // names (the 6-6 may be in the pile; then the highest double opens)
  if (!boardData?.tiles?.length) {
    if (Array.isArray(roomData?.opening_tile)) {
      const [a, b] = roomData.opening_tile
      const req = hand.filter(t => (t[0] === a && t[1] === b) || (t[0] === b && t[1] === a))
      if (req.length) return req
    }
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
  // True while this device re-reads the table before acting on its turn.
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)

  // ── Who is actually at the table ──────────────────────────────────────────
  // Every device announces its seat over the game's live connection
  // (Supabase presence), so everyone knows who's really connected — a phone
  // that dies simply drops out of this set. null until the first update.
  const [presentSeats, setPresentSeats] = useState(null)

  // The device that runs the bots and deals for them: the lowest seat among
  // the humans who are actually here. It used to be seat 0, always — so if
  // seat 0's phone died, every bot at the table stopped with it.
  const runnerSeat = (() => {
    if (!presentSeats) return 0
    const here = players
      .filter(p => !p.is_ai && presentSeats.has(p.seat))
      .map(p => p.seat)
      .sort((a, b) => a - b)
    return here.length ? here[0] : 0
  })()
  const amRunner = !!myInfo && runnerSeat === myInfo.seat
  // how many seats are in play at this table (2, 3 or 4)
  const seatCountRef = useRef(4)
  seatCountRef.current = roomData?.seat_count || 4
  // ── Five doubles: reshuffle or play on (not in partner games) ─────────────
  // Open while the round has no tiles, a human holds 5+ doubles, nobody has
  // decided for this deal, and it's within 10 seconds of this screen first
  // seeing the deal. While it's open nobody plays and bots wait.
  const dealKey = roomData ? `${roomData.round || 1}:${roomData.deal_no || 0}` : ''
  const countDbl = h => (h || []).filter(t => Array.isArray(t) && t[0] === t[1]).length
  const offerHolders = (roomData?.status === 'playing' && !(boardData?.tiles?.length)
      && !['asosye', 'duo'].includes(roomData?.game_mode) && roomData?.deal_decided !== dealKey)
    ? (players || []).filter(p => !p.is_ai && countDbl(p.hand) >= 5) : []
  const offerSeen = useRef({ key: '', at: 0 })
  const offerKey = `${myInfo?.roomId}:${dealKey}`
  if (offerHolders.length && offerSeen.current.key !== offerKey) offerSeen.current = { key: offerKey, at: Date.now() }
  const [, setOfferTick] = useState(0)
  useEffect(() => {
    if (!offerHolders.length) return
    const left = offerSeen.current.at + 10000 - Date.now()
    if (left <= 0) return
    const t = setTimeout(() => setOfferTick(x => x + 1), left + 60)   // re-check when the 10 s are up
    return () => clearTimeout(t)
  }, [offerHolders.length, offerKey])
  const offerOpen = offerHolders.length > 0 && Date.now() < offerSeen.current.at + 10000
  const offerOpenRef = useRef(false)
  offerOpenRef.current = offerOpen
  const offerMine = offerOpen && offerHolders.some(p => p.seat === myInfo?.seat)

  const dealVariantRef = useRef('all')
  dealVariantRef.current = roomData?.deal_variant || 'all'
  const pileRef = useRef(0)
  pileRef.current = Array.isArray(roomData?.pile) ? roomData.pile.length : 0
  const amRunnerRef = useRef(amRunner)
  amRunnerRef.current = amRunner

  // ── The turn clock ────────────────────────────────────────────────────────
  // Every player gets 2 minutes. When they run out, the game plays that one
  // turn for them — the move a sensible regular would make, or a knock if
  // they can't play — and the next turn is theirs again with a fresh clock.
  // It's never a takeover.
  const TURN_LIMIT_MS = 120000
  const [turnStart, setTurnStart] = useState(() => Date.now())
  const [timedOutSeat, setTimedOutSeat] = useState(null)
  const timedOutRef = useRef(null)

  // How long each turn actually takes, from this device's point of view.
  const turnClock = useRef({ seat: null, at: 0 })
  useEffect(() => {
    if (!TIMING || !roomData) return
    const now = performance.now()
    const prev = turnClock.current
    if (prev.seat !== null && prev.seat !== roomData.current_turn) {
      const who = players.find(p => p.seat === prev.seat)
      tlog(`seat ${prev.seat} (${who?.nickname || '?'}${who?.is_ai ? ', bot' : ''}) ` +
           `took ${((now - prev.at) / 1000).toFixed(2)}s — now seat ${roomData.current_turn}`)
    }
    turnClock.current = { seat: roomData.current_turn, at: now }
  }, [roomData?.current_turn, players])

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

    // Practice games never count toward anyone's record.
    if (room.practice) return

    // The round-ender records the whole table; only fall back to recording
    // ourselves if that didn't happen.
    if (room.stats_recorded) return

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

        // Round, Vyèj and Dekabess all follow the game's own scoring: in
        // asosyé the round is a TEAM win (endRound uses winnerKey 'A' = seats
        // 0&2, 'B' = seats 1&3, and the round overlay shows it as your team's
        // win), so when your partner goes out — or makes a Dekabess — it
        // counts for you too. In every other mode it's your seat only.
        const mode   = room.game_mode || 'chien'
        const teamOf = s => (s === 0 || s === 2) ? 'A' : 'B'
        const iWon = mode === 'asosye'
          ? teamOf(room.current_turn) === teamOf(myInfo.seat)
          : room.current_turn === myInfo.seat
        const isMatchOver = room.status === 'finished'   // a match ends on a Vyèj
        const iVyej = iWon && isMatchOver
        const iDek  = iWon && !!room.pending_point

        const { error: statsErr } = await db.rpc('increment_profile_stats', {
          p_user_id: user.id,
          // Games counts MATCHES played, so it only ticks when the match ends.
          // p_wins is this round's result (1 won / 0 lost); the database uses
          // it to advance or reset round_streak. It is not stored as a total.
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
    const queued = performance.now()
    reloadTimer.current = setTimeout(async () => {
      const began = performance.now()
      await loadGameState()
      tlog(`reload: waited ${(began - queued).toFixed(0)}ms, queries took ${(performance.now() - began).toFixed(0)}ms`)
    }, 50)
  }, [loadGameState])

  // Safety net: an occasional full re-read, and one whenever the tab comes
  // back into view, so a missed message can never leave a device out of sync.
  useEffect(() => {
    if (!myInfo?.roomId) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadGameState() }, 20000)
    const onShow = () => { if (document.visibilityState === 'visible') loadGameState() }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [myInfo?.roomId, loadGameState])

  // The sync gate. Changes now arrive one table at a time, and could in
  // principle arrive out of order — the turn moving on before the tile that
  // moved it. Placing a tile builds the new board from the one this device
  // holds, so before this device acts (your turn, or a bot's turn on the
  // host) it re-reads the table once. Only the device about to act does this,
  // so it's one read per move instead of one per player.
  // It restarts only when the turn itself changes or this device's job
  // changes (it now acts / no longer acts) — not whenever the choice of bot
  // runner is recalculated, which happens every time anyone's connection
  // flickers; each restart used to throw the read away and start over while
  // the player's hand stayed locked.
  // A stalled request on a weak connection can't hold the turn either: each
  // attempt gets 2.5 s, then it tries again (4 tries); if none gets through,
  // play is released anyway (the server still rejects a move made out of turn).
  const seatAtTurnNow = players.find(p => p.seat === roomData?.current_turn)
  const iActNow = !!roomData && roomData.status === 'playing' && !!myInfo
    && (roomData.current_turn === myInfo.seat || (amRunner && !!seatAtTurnNow?.is_ai))
  const syncKey = `${roomData?.round}:${roomData?.current_turn}:${roomData?.status}`
  useEffect(() => {
    if (!iActNow) { syncingRef.current = false; setSyncing(false); return }
    let cancelled = false
    syncingRef.current = true
    setSyncing(true)
    const began = performance.now()
    ;(async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        const ok = await Promise.race([
          loadGameState().then(() => true, () => false),
          new Promise(r => setTimeout(() => r(false), 2500)),
        ])
        if (ok) break
        tlog(`sync attempt ${attempt + 1} stalled — trying again`)
      }
      if (cancelled) return
      syncingRef.current = false
      setSyncing(false)
      // your own clock starts when you can actually play, not when the turn arrived
      if (roomData?.current_turn === myInfo?.seat) setTurnStart(Date.now())
      tlog(`synced before acting: ${(performance.now() - began).toFixed(0)}ms`)
    })()
    return () => { cancelled = true }
  }, [syncKey, iActNow])

  useEffect(() => {
    if (!myInfo) { navigate('/'); return }
    loadGameState()
    // Each change notification already carries the changed row, so apply it
    // directly. This used to reload the whole table — three queries on every
    // device for every move. Anything that looks incomplete still falls back
    // to a full reload, and the device whose turn it is re-reads the table
    // before acting (see the sync effect below), so a message arriving out
    // of order can't lead to a move built on a stale board.
    const ch = db.channel('game-' + myInfo.roomId, {
      config: { presence: { key: String(myInfo.seat) } },
    })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        setPresentSeats(new Set(Object.keys(state).map(Number).filter(n => !Number.isNaN(n))))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${myInfo.roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = payload.old?.id
          if (!id) { scheduleReload(); return }
          setPlayers(prev => prev.filter(p => p.id !== id))
          return
        }
        const row = payload.new
        if (!row?.id || !Array.isArray(row.hand)) { scheduleReload(); return }
        setPlayers(prev => {
          const i = prev.findIndex(p => p.id === row.id)
          const next = i >= 0 ? prev.map((p, j) => (j === i ? { ...p, ...row } : p)) : [...prev, row]
          return next.sort((a, b) => a.seat - b.seat)
        })
        tlog(`applied player change (seat ${row.seat})`)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_rooms', filter: `id=eq.${myInfo.roomId}` }, (payload) => {
        if (payload.new?.status === 'abandoned' && myInfo.seat !== 0) {
          alert('The host has left. Returning to lobby…')
          sessionStorage.removeItem('domino_player')
          navigate('/')
          return
        }
        const row = payload.new
        if (!row?.id || row.current_turn === undefined || !row.status) { scheduleReload(); return }
        setRoomData(prev => ({ ...(prev || {}), ...row }))
        tlog(`applied room change (turn ${row.current_turn}, ${row.status})`)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board', filter: `room_id=eq.${myInfo.roomId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          // only clear it if it's OUR board being removed
          if (!payload.old?.id || payload.old.id === boardRef.current?.id) setBoardData(null)
          return
        }
        const row = payload.new
        if (!row?.id || !Array.isArray(row.tiles)) { scheduleReload(); return }
        setBoardData(row)
        tlog(`applied board change (${row.tiles.length} tiles)`)
      })
      .subscribe(status => {
        // (re)connected: anything could have been missed while we were away
        if (status === 'SUBSCRIBED') {
          scheduleReload()
          ch.track({ seat: myInfo.seat, at: Date.now() })   // "I'm at the table"
        }
      })
    return () => { db.removeChannel(ch); clearTimeout(reloadTimer.current) }
  }, [])

  const showToastMsg = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }, [])

  useEffect(() => {
    if (!roomData) return
    const isMyTurn = roomData.current_turn === myInfo.seat && roomData.status === 'playing' && !offerOpenRef.current
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
  const isMyTurn    = roomData?.current_turn === myInfo?.seat && roomData?.status === 'playing' && !syncing && !offerOpen
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
        const weekStr = weekStartUTC().toISOString().slice(0, 10)
        const leaderMode = room.game_mode === 'asosye' ? 'teams' : 'solo'
        const nickname = players.find(p => p.seat === myInfo.seat)?.nickname || 'Player'
        // wa_tab_la_win also records your account, so the week's prize table
        // can be awarded to you; the older call is kept as a fallback
        let { error: wtlErr } = await db.rpc('wa_tab_la_win', {
          p_player_id: playerId, p_nickname: nickname, p_mode: leaderMode, p_week_start: weekStr,
        })
        if (wtlErr) ({ error: wtlErr } = await db.rpc('increment_wa_tab_la', {
          p_player_id: playerId,
          p_nickname: nickname,
          p_mode: leaderMode,
          p_week_start: weekStr,
        }))
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
      
      // ORDER MATTERS: end the round FIRST, clear the table afterwards.
      // Clearing first meant that if the room update then failed, the board
      // and hands were already gone while the room still said 'playing' —
      // no overlay, no tiles, no way to continue. Doing the status write
      // first means a later failure leaves only stale board/event rows,
      // which the next round deletes anyway.
      const roundEndPayload = {
        status: isVyej ? 'finished' : 'round_end',
        current_turn: resolvedSeat,
        streak: newStreak,
        match_winner: isVyej ? winnerKey : null,
        pending_point: isDek,
        blocked: winningSeat === null,
      }
      let { error: updateErr } = await db.from('domino_rooms').update(roundEndPayload).eq('id', myInfo.roomId)
      if (updateErr) {
        // One retry — this write is what ends the round for everyone.
        console.error('[endRound] room update failed, retrying:', updateErr.message)
        ;({ error: updateErr } = await db.from('domino_rooms').update(roundEndPayload).eq('id', myInfo.roomId))
      }
      if (updateErr) {
        console.error('[endRound] room update FAILED twice — round not ended:', updateErr.message)
        await loadGameState()
        return
      }

      // ── Record EVERY player's result in one call ────────────────────────
      // Each device used to record only itself, so anyone whose app was shut
      // at round end was never counted — and a missed loss left their streak
      // wrongly intact. Seats now carry the account, so whoever ends the round
      // records the whole table. If this fails, each device still falls back
      // to recording itself (see the effect above), which is why the room is
      // only marked recorded on success.
      try {
        if (room.practice) throw new Error('practice room — not recorded')
        const teamOf = sq => (sq === 0 || sq === 2) ? 'A' : 'B'
        const winTeam = teamOf(resolvedSeat)
        // trophies only count against humans and expert bots (a stand-in
        // for a dropped player counts as that human)
        const EXPERTS = ['Ti-Jòj', 'Ti-Tid', 'Ti-Roro', 'Ti-Chasè', 'Ti-Frè', 'Ti-Chaj', 'Ti-Pyèj', 'Ti-Wa']
        const trophy = (playersRef.current || []).every(p => !p.is_ai || p.stand_in || EXPERTS.includes(p.nickname))
        const results = (playersRef.current || [])
          .filter(p => p.user_id && !p.is_ai)
          .map(p => {
            const won = mode === 'asosye'
              ? teamOf(p.seat) === winTeam
              : p.seat === resolvedSeat
            return {
              user_id: p.user_id,
              won,
              vyej: won && isVyej,
              dekabess: won && isDek,
              match_over: isVyej,      // "Games" counts matches, not rounds
              trophy,
            }
          })
        if (results.length) {
          const { error: sErr } = await db.rpc('record_round_stats', { p_results: results })
          if (sErr) console.error('[stats] table-wide record failed:', sErr.message)
          else await db.from('domino_rooms').update({ stats_recorded: true }).eq('id', myInfo.roomId)
        }
      } catch (e) {
        console.error('[stats] table-wide record threw (non-fatal):', e)
      }

      // The board stays as it ended: everyone sees the final chain behind the
      // results, and the Dekabess plays on it. (Deleting it here raced the
      // round-end update — on some screens the table went blank first and the
      // Dekabess animation had nothing to play on.) The next deal clears it.
      await db.from('game_events').delete().eq('room_id', myInfo.roomId)
      // Profile stats are NOT written here. endRound runs on exactly one
      // client (the player whose hand emptied, or the host when a bot wins),
      // so writing stats here only ever recorded that one player — everyone
      // else got nothing, and it behaved differently per game mode. Each
      // client now records its own result from the room row; see the
      // stats-recording effect below.
      await loadGameState()
      
      // If winner is a bot and we are the host, auto-start next round after delay
      if (!isVyej && amRunnerRef.current) {
        const winnerPlayer = playersRef.current.find(p => p.seat === resolvedSeat)
        if (winnerPlayer?.is_ai) {
          // Wait longer when Dekabess — overlay takes 3.8s + round overlay needs time
          const autoStartDelay = isDek ? 7000 : 4000
          setTimeout(async () => {
            const { data: latestRoom } = await db.from('domino_rooms').select('current_turn, round, status').eq('id', myInfo.roomId).single()
            if (latestRoom?.status !== 'round_end') return
            const nextRound = (latestRoom.round ?? 1) + 1
            const { hands, pile } = dealTable(seatCountRef.current, dealVariantRef.current)
            for (let i = 0; i < hands.length; i++)
              await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myInfo.roomId).eq('seat', i)
            await db.from('board').delete().eq('room_id', myInfo.roomId)
            await db.from('board').insert({ room_id: myInfo.roomId, tiles: [], left_end: null, right_end: null })
            overlayShownRef.current = false
            setShowOverlay(false)
            await db.from('domino_rooms').update({
              status: 'playing',
              current_turn: resolvedSeat,
              round: nextRound,
              pile,                    // (empty unless this is a pile game)
              opening_tile: null,      // a winner opens with any tile
            }).eq('id', myInfo.roomId)
          }, autoStartDelay)
        }
      }
    } catch(err) {
      console.error('[endRound] EXCEPTION:', err)
      await loadGameState()
    }
  }, [myInfo, loadGameState])

  // ── Stuck-round watchdog ─────────────────────────────────────────────────
  // A round ends when someone empties their hand. If that player's browser
  // dies (or loses the network) between playing the last tile and writing
  // the round result, the room stays on 'playing' with an empty-handed
  // player and nobody can move — the table is stranded.
  //
  // Any client that notices this finishes the round. endRound re-reads the
  // room and returns immediately unless it is still 'playing', so several
  // clients noticing at once is harmless. The winner's own client acts
  // first; others wait ~3s so it normally heals itself silently.
  const watchdogRef = useRef(null)
  useEffect(() => {
    clearTimeout(watchdogRef.current)
    if (!roomData || roomData.status !== 'playing' || !players.length) return
    const emptyHanded = players.find(p => Array.isArray(p.hand) && p.hand.length === 0)
    if (!emptyHanded) return
    const iAmTheWinner = emptyHanded.seat === myInfo.seat
    watchdogRef.current = setTimeout(() => {
      // Was the last tile a Dekabess? Playing a tile that matches BOTH open
      // ends leaves the two ends equal, so if the board is still on the table
      // that tells us without needing the move history. If the board is
      // already gone we can't know, and score it as an ordinary win.
      const b = boardRef.current
      const wasDekabess = !!(b && Array.isArray(b.tiles) && b.tiles.length > 1 &&
        b.left_end != null && b.left_end === b.right_end)
      console.warn('[watchdog] round never ended for seat', emptyHanded.seat,
        '— finishing it, dekabess:', wasDekabess)
      endRound(emptyHanded.seat, wasDekabess)
    }, iAmTheWinner ? 1200 : 3500)
    return () => clearTimeout(watchdogRef.current)
  }, [roomData?.status, players, myInfo, endRound])

  const advanceTurn = useCallback(async (newHand, lastTile, updatedBoard) => {
    if (newHand.length === 0) {
      const boardToCheck = updatedBoard || boardRef.current
      await endRound(myInfo.seat, lastTile ? checkDekabess(lastTile, boardToCheck) : false)
      return
    }
    // Check if all 4 players passed consecutively — only valid if board has tiles
    if (boardRef.current?.tiles?.length > 0) {
      const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(seatCountRef.current)
      if (events?.length === seatCountRef.current && events.every(e => e.action === 'pass')) { await endRound(null, false); return }
    }
    // Read actual current_turn from DB to advance correctly
    const { data: latestRoom } = await db.from('domino_rooms').select('current_turn').eq('id', myInfo.roomId).single()
    const fromSeat = latestRoom?.current_turn ?? myInfo.seat
    const nextSeat = (fromSeat + 1) % seatCountRef.current
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
  const commitMove = useCallback(async ({ seat, action, tile, board, hand, advance, checkBlock }) => {
    const t0 = performance.now()
    const { data, error } = await db.rpc('play_move', {
      p_room_id: myInfo.roomId,
      // Humans move for their own seat; the host passes a bot's seat.
      p_seat: seat ?? myInfo.seat,
      p_action: action,
      p_tile: tile ?? null,
      p_board: board ?? null,
      p_hand: hand ?? null,
      p_advance: advance,
      p_check_block: checkBlock,
    })
    tlog(`play_move (${action}, seat ${seat ?? myInfo.seat}) took ${(performance.now() - t0).toFixed(0)}ms`)
    if (error) {
      const missing =
        error.code === 'PGRST202' ||
        error.code === '42883' ||
        /could not find the function/i.test(error.message || '')
      if (missing) return 'missing'
      console.error('[play_move] failed, retrying once:', error.message)
      // Retry is safe: the server only accepts a move from the seat whose
      // turn it is, so if the first attempt actually committed and only its
      // response was lost, the retry comes back 'stale' instead of moving
      // twice. Without this, a lost response on someone's LAST tile left the
      // round finished in the database but never ended in the game.
      const retry = await db.rpc('play_move', {
        p_room_id: myInfo.roomId,
        p_seat: seat ?? myInfo.seat,
        p_action: action,
        p_tile: tile ?? null,
        p_board: board ?? null,
        p_hand: hand ?? null,
        p_advance: advance,
        p_check_block: checkBlock,
      })
      if (retry.error) {
        console.error('[play_move] failed twice, resyncing:', retry.error.message)
        loadGameState()
        return 'error'
      }
      return { blocked: !!retry.data?.blocked, stale: !!retry.data?.stale }
    }
    return { blocked: !!data?.blocked, stale: !!data?.stale }
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
      if (res.stale) {
        // Not our turn anymore (duplicate drop) — server wrote nothing.
        loadGameState()
        return true
      }
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
    // Selecting never places a tile — not even the first one on an empty
    // board. The player drags it to the table, or taps a drop zone.
  }, [isMyTurn, selectedTile])

  // Five doubles: call the reshuffle, or play on (and count it toward trophies)
  const callReshuffle = useCallback(async () => {
    if (!myInfo) return
    await db.rpc('reshuffle_round', { p_room_id: myInfo.roomId, p_seat: myInfo.seat })
  }, [myInfo])
  const keepDeal = useCallback(async () => {
    if (!myInfo) return
    try { localStorage.setItem('dk-5d', JSON.stringify({ room: myInfo.roomId, round: roomData?.round || 1 })) } catch { /* ignore */ }
    await db.rpc('keep_deal', { p_room_id: myInfo.roomId })
  }, [myInfo, roomData?.round])

  // Draw from the pile (pile games): your turn, nothing playable, tiles left.
  const drawTile = useCallback(async () => {
    if (processingRef.current || !myInfo) return
    processingRef.current = true
    setProcessing(true)
    try {
      await db.rpc('draw_tile', { p_room_id: myInfo.roomId, p_seat: myInfo.seat })
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }, [myInfo])

  const passMove = useCallback(async () => {
    // Double-tap guard — the same one placeTile has always had. passMove
    // never had it, so two quick taps fired two passes.
    if (processingRef.current) return
    if (pileRef.current > 0) return          // with tiles in the pile you draw, not knock
    processingRef.current = true
    setProcessing(true)
    try {
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
          if (res.stale) loadGameState()          // duplicate tap — nothing written
          else if (res.blocked) await endRound(null, false)
          else loadGameState()
          return
        }
      }
      // Original path (play_move not installed) — unchanged.
      await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'pass', tile: null })
      await advanceTurn(hand, null)
    } finally {
      processingRef.current = false
      setProcessing(false)
    }
  }, [hand, myInfo, advanceTurn, commitMove, endRound, loadGameState])

  const startNextRound = useCallback(async () => {
    overlayShownRef.current = false
    setShowOverlay(false)

    // Get current room
    const { data: room } = await db.from('domino_rooms').select('current_turn, round, game_mode, status').eq('id', myInfo.roomId).single()
    if (!room) return
    // Only ever deal from between rounds. A tournament can end the match
    // at a round's end (the knockout) — dealing then would reopen it.
    if (room.status !== 'round_end') { await loadGameState(); return }

    const winnerSeat = room.current_turn ?? 0
    const nextRound = (room.round ?? 1) + 1
    const isSoloMode = room.game_mode === 'solo'

    // Only the winner (or host in solo) deals the next round
    // Everyone else just waits for the subscription to update them
    //
    // A bot can win the round too — in solo, in "asosyé vs AI", and in PvP
    // when a bot replaced someone who disconnected. A bot has no client to
    // deal, so the host (seat 0) deals on its behalf; otherwise every human
    // would sit waiting for a dealer that doesn't exist.
    const winnerIsBot = !!playersRef.current.find(p => p.seat === winnerSeat)?.is_ai
    const iDeal = myInfo.seat === winnerSeat || isSoloMode || (winnerIsBot && amRunnerRef.current)
    if (!iDeal) {
      // Non-winner clicked — just close overlay and wait
      await loadGameState()
      return
    }

    const { hands, pile } = dealTable(seatCountRef.current, dealVariantRef.current)
    for (let i = 0; i < hands.length; i++)
      await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myInfo.roomId).eq('seat', i)
    await db.from('board').delete().eq('room_id', myInfo.roomId)
    await db.from('board').insert({ room_id: myInfo.roomId, tiles: [], left_end: null, right_end: null })
    await db.from('game_events').delete().eq('room_id', myInfo.roomId)
    await db.from('domino_rooms').update({
      status: 'playing',
      current_turn: winnerSeat,
      round: nextRound,
      pile,
      opening_tile: null,
      pending_point: false,
      blocked: false,
      stats_recorded: false,
    }).eq('id', myInfo.roomId)
    await loadGameState()
  }, [myInfo, loadGameState])

  // ── Who decides about a missing player's seat ─────────────────────────────
  // Team games: their PARTNER. Every-man games: the HOST (seat 0). If that
  // person isn't at the table either, the next player present decides — so
  // there is always someone who can act.
  const deciderSeat = useCallback((seat) => {
    const ps = playersRef.current || []
    const here = s2 => (presentSeats ? presentSeats.has(s2) : true)
    const human = s2 => { const p = ps.find(x => x.seat === s2); return !!p && !p.is_ai }
    if (roomData?.game_mode === 'asosye') {
      const partner = (seat + 2) % 4
      if (human(partner) && here(partner)) return partner
    }
    if (seat !== 0 && human(0) && here(0)) return 0
    const others = ps.filter(p => !p.is_ai && p.seat !== seat && here(p.seat)).map(p => p.seat).sort((a, b) => a - b)
    return others.length ? others[0] : null
  }, [presentSeats, roomData?.game_mode])

  // Replace a player who LEFT with a bot of the decider's choosing — for good.
  // The seat takes the bot's name and stops belonging to the player's account.
  const replaceWithBot = useCallback(async (seat, botName) => {
    if (!myInfo || !botName) return
    if (deciderSeat(seat) !== myInfo.seat) return
    await db.from('domino_players').update({
      nickname: botName,
      is_ai: true,
      stand_in: false,
      left_at: null,
      user_id: null,
      is_connected: true,
    }).eq('room_id', myInfo.roomId).eq('seat', seat)
    scheduleReload()
  }, [myInfo, deciderSeat])

  const leaveTable = useCallback(async () => {
    if (!confirm('Leave this table?')) return
    const status = roomData?.status
    const gameOn = status === 'playing' || status === 'round_end'
    const othersHere = (playersRef.current || []).some(p => !p.is_ai && p.seat !== myInfo.seat)

    if (gameOn && othersHere) {
      // Leaving mid-game no longer ends it for everyone, and no longer hands
      // the seat to a random bot. The seat is marked as left, a stand-in keeps
      // play moving, and the partner (team games) or host chooses the bot
      // that replaces you. Until they do, you can rejoin with the room code.
      await db.from('domino_players').update({
        is_ai: true,
        stand_in: true,
        left_at: new Date().toISOString(),
        is_connected: false,
      }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
    } else if (myInfo.seat === 0 || !othersHere) {
      // The last person at the table, or the host of a finished game: close it.
      await Promise.all([
        db.from('game_events').delete().eq('room_id', myInfo.roomId),
        db.from('board').delete().eq('room_id', myInfo.roomId),
        db.from('domino_players').delete().eq('room_id', myInfo.roomId),
      ])
      await db.from('domino_rooms').delete().eq('id', myInfo.roomId)
    }
    // A tournament match, or a practice room opened from one, goes back to
    // the bracket rather than the lobby.
    const backTo = myInfo?.tournamentMatchId || myInfo?.fromTournament ? '/tournament' : '/'
    sessionStorage.removeItem('domino_player')
    navigate(backTo)
  }, [myInfo, navigate, roomData?.status])

  // ── Stand-ins ─────────────────────────────────────────────────────────────
  // A player who drops (phone died, lost signal) keeps their seat. A bot plays
  // it for them — same name, same account — until they come back, when the
  // seat is theirs again. This replaces the old behaviour, which renamed the
  // seat to a bot permanently, so nobody could ever get back in.
  // A new turn (or a new round) starts a fresh clock.
  useEffect(() => {
    setTurnStart(Date.now())
    setTimedOutSeat(null)
    timedOutRef.current = null
  }, [roomData?.current_turn, roomData?.round, roomData?.status])

  // Only the table's runner enforces the clock, so a timeout fires once. If
  // two devices ever disagree for a moment, the server's turn guard rejects
  // any move made out of turn.
  useEffect(() => {
    if (!roomData || roomData.status !== 'playing' || !amRunner) return
    const seat = roomData.current_turn
    // Another player's clock gets 10 s of grace: this device can't see when
    // their screen was ready to play (theirs starts counting only then).
    const grace = seat === myInfo?.seat ? 0 : 10000
    const wait = Math.max(0, turnStart + TURN_LIMIT_MS + grace - Date.now())
    const t = setTimeout(() => {
      const p = (playersRef.current || []).find(x => x.seat === seat)
      if (!p || p.is_ai) return          // bots never run out of time
      timedOutRef.current = seat
      setTimedOutSeat(seat)
    }, wait)
    return () => clearTimeout(t)
  }, [roomData?.current_turn, roomData?.round, roomData?.status, amRunner, turnStart])

  const standIn = useCallback(async (seat, { auto = false } = {}) => {
    if (!myInfo) return
    if (!auto && deciderSeat(seat) !== myInfo.seat) return   // partner or host decides
    await db.from('domino_players')
      .update({ is_ai: true, stand_in: true })
      .eq('room_id', myInfo.roomId).eq('seat', seat).eq('is_ai', false)
  }, [myInfo, deciderSeat])

  // Back at the table: if a bot has been standing in for you, take your seat back.
  useEffect(() => {
    if (!myInfo || !players.length) return
    const mine = players.find(p => p.seat === myInfo.seat)
    if (mine?.stand_in) {
      db.from('domino_players')
        .update({ is_ai: false, stand_in: false, left_at: null, is_connected: true })
        .eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
        .then(() => scheduleReload())
    }
  }, [players, myInfo?.seat])

  // Who has dropped: humans who aren't connected. Presence can blink during a
  // brief network hiccup, so a seat only counts as away after 10 seconds gone.
  const [awaySeats, setAwaySeats] = useState([])
  const goneSince = useRef({})
  useEffect(() => {
    if (!presentSeats || !players.length) return
    const tick = () => {
      const now = Date.now()
      const away = []
      for (const p of players) {
        if (p.is_ai || p.seat === myInfo.seat) { delete goneSince.current[p.seat]; continue }
        if (presentSeats.has(p.seat)) { delete goneSince.current[p.seat]; continue }
        goneSince.current[p.seat] ??= now
        if (now - goneSince.current[p.seat] >= 10000) away.push(p.seat)
      }
      setAwaySeats(prev => (prev.join(',') === away.join(',') ? prev : away))
    }
    tick()
    const t = setInterval(tick, 2000)
    return () => clearInterval(t)
  }, [presentSeats, players, myInfo?.seat])

  // Safety net: if it's an away player's turn and nobody has put a bot in
  // for them after a minute, the table's runner does — so a dead phone can
  // never freeze the game for everyone else.
  useEffect(() => {
    if (!roomData || roomData.status !== 'playing' || !amRunner) return
    const turn = roomData.current_turn
    if (!awaySeats.includes(turn)) return
    const t = setTimeout(() => standIn(turn, { auto: true }), 60000)
    return () => clearTimeout(t)
  }, [roomData?.current_turn, roomData?.status, awaySeats, amRunner, standIn])

  // AI turns
  useEffect(() => {
    if (!roomData || !players.length || roomData.status !== 'playing') return
    const currentPlayer = players.find(p => p.seat === roomData.current_turn)
    // A bot's turn — or a player whose 2 minutes have run out
    const outOfTime = !!currentPlayer && timedOutSeat === currentPlayer.seat
    if (!currentPlayer?.is_ai && !outOfTime) return
    // Only the table's runner plays the bots, so each bot moves exactly once
    if (!amRunner) return
    // Prevent double-fire within the same turn
    if (botRunningRef.current) return
    // Wait for the table to be re-read before the bot decides anything
    if (syncing) return
    // Safety reset — if bot gets stuck for 6s, force unlock
    const safetyTimer = setTimeout(() => { botRunningRef.current = false }, 6000)
    const timer = setTimeout(async () => {
      if (botRunningRef.current) return
      botRunningRef.current = true
      // Read the board and hand NOW, after the sync and the think time —
      // not when the turn changed, when they could have been a tile behind.
      const board = boardRef.current
      const freshBot = (playersRef.current || []).find(p => p.seat === currentPlayer.seat) || currentPlayer
      // The player took their seat back while the bot was thinking: stand down.
      // (Unless this is their timed-out turn being played for them.)
      const playingForTimeout = timedOutRef.current === currentPlayer.seat
      if (!freshBot.is_ai && !playingForTimeout) { botRunningRef.current = false; return }
      if (playingForTimeout) {
        showToastMsg(currentPlayer.seat === myInfo.seat
          ? "Time's up — the game played your turn"
          : `Time's up — the game played for ${freshBot.nickname}`)
      }
      const botHand     = freshBot.hand || []
      const botPlayable = getPlayableTiles(botHand, board, roomData)

      // Bot moves are written through play_move — the exact function human
      // moves use — so every mode shares one move path: one request, one
      // transaction, and the server-side turn guard. Retried on a transient
      // error, because unlike a human a bot can't tap again. Retrying is safe
      // only because of the turn guard: if an attempt actually committed and
      // just its response was lost, the retry is rejected as stale.
      const commitBot = async (args) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const res = await commitMove({ ...args, seat: currentPlayer.seat })
          if (res !== 'error') return res
          await new Promise(r => setTimeout(r, 800))
        }
        return 'error'
      }

      if (offerOpenRef.current) { botRunningRef.current = false; return }   // a reshuffle may be called

      // With a pile: draw instead of knocking. The draw shrinks the pile, which
      // re-runs this turn — play the drawn tile, or draw again.
      if (botPlayable.length === 0 && pileRef.current > 0) {
        await db.rpc('draw_tile', { p_room_id: myInfo.roomId, p_seat: currentPlayer.seat })
        botRunningRef.current = false
        return
      }

      if (botPlayable.length === 0) {
        const res = await commitBot({
          action: 'pass', tile: null, board: null, hand: null,
          advance: true,
          checkBlock: board?.tiles?.length > 0,   // same condition as before
        })
        if (res === 'missing') {
          // Original path (play_move not installed) — unchanged.
          await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'pass', tile: null })
          if (board?.tiles?.length > 0) {
            const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(seatCountRef.current)
            if (events?.length === seatCountRef.current && events.every(e => e.action === 'pass')) { botRunningRef.current = false; await endRound(null, false); return }
          }
          await db.from('domino_rooms').update({ current_turn: (currentPlayer.seat + 1) % seatCountRef.current }).eq('id', myInfo.roomId)
          botRunningRef.current = false
          return
        }
        botRunningRef.current = false
        if (res === 'error' || res.stale) return
        if (res.blocked) { await endRound(null, false); return }
        loadGameState()
        return
      }
      // Use personality-based AI engine
      const personality = getPersonality(currentPlayer.nickname)
      // Public info only: how many tiles each opponent holds (shown on every
      // screen). Lets the bot block harder when someone is about to go out.
      // In asosyé the partner across the table (seat + 2) is not an opponent.
      const partnerSeat = roomData.game_mode === 'asosye' ? (currentPlayer.seat + 2) % 4 : null
      // When Ti-Jòj, Ti-Tid AND Ti-Roro are all at the table they play as one
      // bloc: each counts the other two's win as its own. Only when all three
      // are present — any other line-up and they play for themselves.
      const UNISON = ['tijoj', 'titid', 'tiroro']
      const seatPersonalities = players
        .filter(p => p.is_ai)
        .map(p => ({ seat: p.seat, pers: getPersonality(p.nickname) }))
      const unisonPresent = UNISON.every(u => seatPersonalities.some(x => x.pers === u))
      const allySeats = unisonPresent && UNISON.includes(personality)
        ? seatPersonalities.filter(x => UNISON.includes(x.pers)).map(x => x.seat)
        : []
      // "Danger" means an OPPONENT is about to go out — never our own side.
      const opponentTileCounts = players
        .filter(p => p.seat !== currentPlayer.seat && p.seat !== partnerSeat && !allySeats.includes(p.seat))
        .map(p => (p.hand || []).length)
      const tileCountsBySeat = [0, 1, 2, 3].map(s => (players.find(p => p.seat === s)?.hand || []).length)
      const botCtx = {
        seat: currentPlayer.seat,
        mode: roomData.game_mode || 'chien',
        opponentTileCounts,
        tileCountsBySeat,
        allySeats,
      }
      // Expert personalities get the full table state; ordinary ones don't.
      if (isExpertBot(personality)) {
        botCtx.hands = [0, 1, 2, 3].map(s => players.find(p => p.seat === s)?.hand || [])
      }
      const move = chooseTile(personality, botPlayable, botHand, board, botCtx)
      let tile = move?.tile || botPlayable[0]
      // Override side from AI recommendation if available
      const aiSide = move?.side
      const tileIdx = botHand.findIndex(t => t[0] === tile[0] && t[1] === tile[1])
      const newHand = botHand.filter((_, i) => i !== tileIdx)
      // Verify tile not already on board (prevent duplicate on double-fire)
      const alreadyPlayed = board?.tiles?.some(e => e.tile[0] === tile[0] && e.tile[1] === tile[1])
      if (alreadyPlayed) { botRunningRef.current = false; return }
      let boardPatch
      if (!board?.tiles?.length) {
        boardPatch = { tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }
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
        boardPatch = { tiles: newTiles, left_end: newLeftEnd, right_end: newRightEnd }
      }

      const handEmpty = newHand.length === 0
      const res = await commitBot({
        action: 'place', tile, board: boardPatch, hand: newHand,
        advance: !handEmpty,     // last tile: endRound takes over, as before
        checkBlock: false,       // the bot never block-checked after placing
      })
      if (res === 'missing') {
        // Original path (play_move not installed) — same writes as before.
        await db.from('board').update(boardPatch).eq('room_id', myInfo.roomId)
        await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', currentPlayer.seat)
        await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: currentPlayer.seat, action: 'place', tile })
        if (newHand.length === 0) { botRunningRef.current = false; await endRound(currentPlayer.seat, checkDekabess(tile, board)); return }
        await db.from('domino_rooms').update({ current_turn: (currentPlayer.seat + 1) % seatCountRef.current }).eq('id', myInfo.roomId)
        botRunningRef.current = false
        return
      }
      botRunningRef.current = false
      if (res === 'error' || res.stale) return
      if (handEmpty) { await endRound(currentPlayer.seat, checkDekabess(tile, board)); return }
      loadGameState()
    }, 1200)
    return () => { clearTimeout(timer); clearTimeout(safetyTimer); botRunningRef.current = false }
  }, [roomData?.current_turn, roomData?.status, syncing, amRunner, timedOutSeat, roomData?.pile?.length, offerOpen])

  return {
    roomData, players, boardData, selectedTile, showPicker,
    showOverlay, toast, isProcessing,
    me, hand, isMyTurn, playable, hasTilesOnBoard,
    selectTile, placeTile, passMove,
    startNextRound, leaveTable, setShowOverlay, replaceWithBot,
    presentSeats, awaySeats, standIn, deciderSeat,
    turnStart, turnLimitMs: TURN_LIMIT_MS,
    pileCount: Array.isArray(roomData?.pile) ? roomData.pile.length : 0, drawTile,
    reshuffleOffer: offerOpen
      ? { mine: offerMine, doubles: countDbl((players || []).find(p => p.seat === myInfo?.seat)?.hand), holder: offerHolders[0]?.nickname || '', key: offerKey }
      : null,
    callReshuffle, keepDeal,
    cancelSelection: () => { setSelectedTile(null); setShowPicker(false) },
  }
}
