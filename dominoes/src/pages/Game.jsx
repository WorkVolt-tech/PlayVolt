import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { getPlayableTiles, canPlayOnSide, isDekabess, computeNewStreak, pipCount, shuffle, generateDominoSet } from '../lib/game'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import RoundOverlay from '../components/RoundOverlay'
import './Game.css'

export default function Game() {
  const navigate = useNavigate()
  const myInfo = JSON.parse(sessionStorage.getItem('domino_player') || 'null')

  const [roomData, setRoomData]     = useState(null)
  const [players, setPlayers]       = useState([])
  const [boardData, setBoardData]   = useState(null)
  const [selectedTile, setSelected] = useState(null) // { tile, idx }
  const [showPicker, setShowPicker] = useState(false)
  const [toast, setToast]           = useState('')
  const [isProcessing, setProcessing] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const toastTimer = useRef(null)
  const reloadTimer = useRef(null)

  useEffect(() => {
    if (!myInfo) { navigate('/'); return }
    loadGameState()
    const ch = subscribeToGame()
    return () => { db.removeChannel(ch); clearTimeout(reloadTimer.current) }
  }, [])

  async function loadGameState() {
    const [{ data: room }, { data: pData }, { data: bData }] = await Promise.all([
      db.from('domino_rooms').select('*').eq('id', myInfo.roomId).single(),
      db.from('domino_players').select('*').eq('room_id', myInfo.roomId).order('seat'),
      db.from('board').select('*').eq('room_id', myInfo.roomId).maybeSingle(),
    ])
    if (room) setRoomData(room)
    if (pData) setPlayers(pData)
    if (bData !== undefined) setBoardData(bData)
    if (room?.status === 'finished' || room?.status === 'round_end') setShowOverlay(true)
  }

  function scheduleReload() {
    clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(loadGameState, 120)
  }

  function subscribeToGame() {
    return db.channel('game-' + myInfo.roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${myInfo.roomId}` }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_rooms',   filter: `id=eq.${myInfo.roomId}` }, (payload) => {
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
  }

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  useEffect(() => {
    if (!roomData) return
    const me = players.find(p => p.seat === myInfo.seat)
    const isMyTurn = roomData.current_turn === myInfo.seat && roomData.status === 'playing'
    const active = players.find(p => p.seat === roomData.current_turn)
    if (isMyTurn) showToast('Your turn!')
    else if (active) showToast(`${active.nickname}'s turn`)
    if (roomData.status === 'finished' || roomData.status === 'round_end') setShowOverlay(true)
  }, [roomData, players])

  const me = players.find(p => p.seat === myInfo?.seat)
  const hand = me?.hand || []
  const isMyTurn = roomData?.current_turn === myInfo?.seat && roomData?.status === 'playing'
  const playable = getPlayableTiles(hand, boardData)
  const hasTilesOnBoard = boardData?.tiles?.length > 0

  function selectTile(tile, idx) {
    if (!isMyTurn) return
    if (selectedTile?.idx === idx) { cancelSelection(); return }
    setSelected({ tile, idx })

    if (!hasTilesOnBoard) {
      placeFirstTile(tile, idx)
      return
    }

    const cL = canPlayOnSide(tile, 'left', boardData)
    const cR = canPlayOnSide(tile, 'right', boardData)

    if (cL && cR && boardData.left_end !== boardData.right_end) {
      setShowPicker(true)
    } else if (cL) {
      confirmPlace(tile, idx, 'left')
    } else if (cR) {
      confirmPlace(tile, idx, 'right')
    } else {
      cancelSelection()
    }
  }

  function cancelSelection() {
    setSelected(null)
    setShowPicker(false)
  }

  async function placeFirstTile(tile, idx) {
    if (isProcessing) return
    setProcessing(true)
    const newHand = hand.filter((_, i) => i !== idx)
    await db.from('board').update({ tiles: [{ tile, flipped: false }], left_end: tile[0], right_end: tile[1] }).eq('room_id', myInfo.roomId)
    await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
    await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'place', tile })
    await advanceTurn(newHand, tile)
    setSelected(null); setShowPicker(false); setProcessing(false)
  }

  async function confirmPlace(tile, idx, side) {
    if (isProcessing) return
    setProcessing(true)
    const end = side === 'left' ? boardData.left_end : boardData.right_end
    let flipped = false, newOpenEnd

    if (side === 'right') {
      if (tile[1] === end) { flipped = true;  newOpenEnd = tile[0] }
      else                  { flipped = false; newOpenEnd = tile[1] }
    } else {
      if (tile[0] === end) { flipped = true;  newOpenEnd = tile[1] }
      else                  { flipped = false; newOpenEnd = tile[0] }
    }

    const newEntry = { tile, flipped }
    const newTiles    = side === 'left' ? [newEntry, ...boardData.tiles] : [...boardData.tiles, newEntry]
    const newLeftEnd  = side === 'left'  ? newOpenEnd : boardData.left_end
    const newRightEnd = side === 'right' ? newOpenEnd : boardData.right_end
    const newHand     = hand.filter((_, i) => i !== idx)

    await db.from('board').update({ tiles: newTiles, left_end: newLeftEnd, right_end: newRightEnd }).eq('room_id', myInfo.roomId)
    await db.from('domino_players').update({ hand: newHand }).eq('room_id', myInfo.roomId).eq('seat', myInfo.seat)
    await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'place', tile })
    await advanceTurn(newHand, tile)
    setSelected(null); setShowPicker(false); setProcessing(false)
  }

  async function passMove() {
    await db.from('game_events').insert({ room_id: myInfo.roomId, player_seat: myInfo.seat, action: 'pass', tile: null })
    await advanceTurn(hand, null)
  }

  async function advanceTurn(newHand, lastTile) {
    if (newHand.length === 0) {
      const dekabess = lastTile ? isDekabess(lastTile, boardData) : false
      await endRound(myInfo.seat, dekabess)
      return
    }
    const { data: events } = await db.from('game_events').select('*').eq('room_id', myInfo.roomId).order('created_at', { ascending: false }).limit(4)
    if (events?.length === 4 && events.every(e => e.action === 'pass')) {
      await endRound(null, false)
      return
    }
    const nextSeat = (myInfo.seat + 1) % 4
    await db.from('domino_rooms').update({ current_turn: nextSeat }).eq('id', myInfo.roomId)
  }

  async function endRound(winningSeat, isDekabessMove) {
    const { data: room } = await db.from('domino_rooms').select('*').eq('id', myInfo.roomId).single()
    if (!room) return
    const mode   = room.game_mode || 'chien'
    const streak = room.streak || { seat: null, team: null, count: 0 }

    let resolvedSeat = winningSeat
    if (winningSeat === null) {
      const sorted = players.map(p => ({ seat: p.seat, pips: pipCount(p.hand) })).sort((a, b) => a.pips - b.pips)
      resolvedSeat = sorted[0].seat
    }

    const newStreak = computeNewStreak(streak, resolvedSeat, isDekabessMove, mode)
    const isVyej    = newStreak.count >= 4
    const winnerKey = mode === 'asosye' ? (resolvedSeat === 0 || resolvedSeat === 2 ? 'A' : 'B') : resolvedSeat

    await Promise.all([
      db.from('game_events').delete().eq('room_id', myInfo.roomId),
      db.from('board').delete().eq('room_id', myInfo.roomId),
    ])
    await db.from('domino_rooms').update({
      status: isVyej ? 'finished' : 'round_end',
      current_turn: resolvedSeat,
      streak: newStreak,
      match_winner: isVyej ? winnerKey : null,
      pending_point: isDekabessMove,
    }).eq('id', myInfo.roomId)
  }

  async function hostStartNextRound() {
    setShowOverlay(false)
    const tiles = shuffle(generateDominoSet())
    const hands = [tiles.slice(0,7), tiles.slice(7,14), tiles.slice(14,21), tiles.slice(21,28)]
    for (let i = 0; i < 4; i++)
      await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myInfo.roomId).eq('seat', i)
    await db.from('board').insert({ room_id: myInfo.roomId, tiles: [], left_end: null, right_end: null })
    let startingSeat = 0
    for (let i = 0; i < 4; i++) if (hands[i].some(t => t[0] === 6 && t[1] === 6)) { startingSeat = i; break }
    await db.from('domino_rooms').update({ status: 'playing', current_turn: startingSeat }).eq('id', myInfo.roomId)
  }

  async function leaveTable() {
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
  }

  if (!myInfo || !roomData) return <div className="loading">Loading…</div>

  return (
    <div className="game-layout">
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="game-title">Dominos</span>
          <span className="room-code-badge">{myInfo.roomCode || '——'}</span>
        </div>
        <div className="player-tags">
          {players.map(p => (
            <div
              key={p.seat}
              className={[
                'player-tag',
                p.seat === roomData.current_turn ? 'active-turn' : '',
                p.seat === myInfo.seat ? 'is-me' : '',
              ].join(' ')}
            >
              <div className="tag-dot" />
              <span>{p.nickname}{p.seat === myInfo.seat ? ' ★' : ''}</span>
              <span className="tag-tiles">{Array.isArray(p.hand) ? p.hand.length : 0}</span>
            </div>
          ))}
        </div>
        <button className="btn-leave" onClick={leaveTable}>Leave</button>
      </div>

      {/* Board */}
      <Board
        boardData={boardData}
        selectedTile={selectedTile}
        isMyTurn={isMyTurn}
        onDropZone={(side) => { if (selectedTile) confirmPlace(selectedTile.tile, selectedTile.idx, side) }}
      />

      {/* Side picker */}
      {showPicker && (
        <div className="side-picker">
          <button className="side-btn" onClick={() => { setShowPicker(false); confirmPlace(selectedTile.tile, selectedTile.idx, 'left') }}>← Left</button>
          <button className="side-btn" onClick={() => { setShowPicker(false); confirmPlace(selectedTile.tile, selectedTile.idx, 'right') }}>Right →</button>
          <button className="side-btn side-btn-cancel" onClick={cancelSelection}>Cancel</button>
        </div>
      )}

      {/* Hand */}
      <PlayerHand
        hand={hand}
        isMyTurn={isMyTurn}
        playableTiles={playable}
        selectedIdx={selectedTile?.idx}
        onSelect={selectTile}
        onPass={passMove}
        hasTilesOnBoard={hasTilesOnBoard}
      />

      {/* Toast */}
      {toast && <div className="turn-toast visible">{toast}</div>}

      {/* Round/Match overlay */}
      {showOverlay && roomData && (
        <RoundOverlay
          roomData={roomData}
          players={players}
          myInfo={myInfo}
          onNextRound={hostStartNextRound}
          onLeaveLobby={() => { sessionStorage.removeItem('domino_player'); navigate('/') }}
        />
      )}
    </div>
  )
}
