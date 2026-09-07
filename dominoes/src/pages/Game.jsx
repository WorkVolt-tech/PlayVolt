import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { useGameState } from '../hooks/useGameState'
import { canPlayOnSide } from '../hooks/useGameState'
import Board from '../components/Board'
import PlayerHand from '../components/PlayerHand'
import RoundOverlay from '../components/RoundOverlay'
import DekabessOverlay from '../components/DekabessOverlay'
import KnockAnimation from '../components/KnockAnimation'
import OpponentHands from '../components/OpponentHands'
import './Game.css'

export default function Game() {
  const navigate = useNavigate()
  const myInfo   = JSON.parse(sessionStorage.getItem('domino_player') || 'null')

  const [passingSeats, setPassingSeats] = useState(new Set())
  const [showDekabess, setShowDekabess] = useState(false)
  const [dekabessPlayer, setDekabessPlayer] = useState('')
  const [knockPlayer, setKnockPlayer] = useState(null)

  const {
    roomData, players, boardData, selectedTile, showPicker,
    showOverlay, toast, isProcessing,
    hand, isMyTurn, playable, hasTilesOnBoard, replaceWithBot,
    selectTile, placeTile, passMove, cancelSelection,
    startNextRound, leaveTable, setShowOverlay,
  } = useGameState(myInfo, navigate)

  // Show Dekabess celebration — only once per round
  const dekabessShownRef = useRef(false)
  useEffect(() => {
    if (!roomData || !showOverlay) return
    if (roomData.pending_point && !dekabessShownRef.current) {
      dekabessShownRef.current = true
      const winner = players.find(p => p.seat === roomData.current_turn)
      setDekabessPlayer(winner?.nickname || '?')
      setShowDekabess(true)
    }
    if (!roomData.pending_point) {
      dekabessShownRef.current = false
    }
  }, [showOverlay, roomData?.pending_point])

  // Track passes - clear when someone plays, show knock when someone passes
  const prevPassSeatsRef = useRef(new Set())
  useEffect(() => {
    if (!myInfo?.roomId) return
    db.from('game_events')
      .select('player_seat, action, created_at')
      .eq('room_id', myInfo.roomId)
      .order('created_at', { ascending: false })
      .limit(4)
      .then(({ data }) => {
        // Only mark as passing if the most recent events are passes
        // Once someone plays, clear all pass indicators
        const recent = data || []
        const newPassSeats = new Set(
          recent
            .filter(e => e.action === 'pass')
            .map(e => e.player_seat)
        )
        // If any recent event is a 'place', clear that player's pass
        recent.filter(e => e.action === 'place').forEach(e => newPassSeats.delete(e.player_seat))
        // Show knock for newly passed players
        newPassSeats.forEach(seat => {
          if (!prevPassSeatsRef.current.has(seat)) {
            const p = players.find(pl => pl.seat === seat)
            if (p) {
              const mySeat = myInfo?.seat ?? 0
              const diff = ((seat - mySeat) + 4) % 4
              const posMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' }
              setKnockPlayer({ name: p.nickname, position: posMap[diff] })
            }
          }
        })
        prevPassSeatsRef.current = newPassSeats
        setPassingSeats(newPassSeats)
      })
  }, [roomData?.current_turn])

  if (!myInfo || !roomData) return <div className="loading">Loading…</div>

  return (
    <div className="game-layout">
      {/* Top bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="game-title">Dekabess!</span>
          <span className="room-code-badge">{myInfo.roomCode || '——'}</span>
        </div>
        <div className="player-tags">
          {players.map(p => (
            <div key={p.seat} className={[
              'player-tag',
              p.seat === roomData.current_turn ? 'active-turn' : '',
              p.seat === myInfo.seat ? 'is-me' : '',
            ].join(' ')}>
              <div className="tag-dot" />
              <span>{p.nickname}{p.seat === myInfo.seat ? ' ★' : ''}</span>
              {passingSeats.has(p.seat) && <span className="tag-pass">PASS</span>}
              <span className="tag-tiles">{Array.isArray(p.hand) ? p.hand.length : 0}</span>
            </div>
          ))}
        </div>
        <button className="btn-leave" onClick={leaveTable}>Leave</button>
      </div>

      <div className="board-container">
        <OpponentHands players={players} myInfo={myInfo} roomData={roomData} />
        <Board
          boardData={boardData}
        selectedTile={selectedTile}
        isMyTurn={isMyTurn}
        onDropZone={side => {
          if (!selectedTile) return
          const cL = canPlayOnSide(selectedTile.tile, 'left', boardData)
          const cR = canPlayOnSide(selectedTile.tile, 'right', boardData)
          if (cL && cR && boardData.left_end !== boardData.right_end) {
            selectTile(selectedTile.tile, selectedTile.idx)
          } else {
            placeTile(selectedTile.tile, selectedTile.idx, side)
          }
        }}
        onDragPlace={(tile, idx, side) => {
          if (!isMyTurn) return
          if (side === 'first') { placeTile(tile, idx, 'first'); return }
          const cL = canPlayOnSide(tile, 'left', boardData)
          const cR = canPlayOnSide(tile, 'right', boardData)
          if (side === 'left' && cL) placeTile(tile, idx, 'left')
          else if (side === 'right' && cR) placeTile(tile, idx, 'right')
          else if (cL && cR) { placeTile(tile, idx, 'left') }
          else if (cL) placeTile(tile, idx, 'left')
          else if (cR) placeTile(tile, idx, 'right')
        }}
        />
      </div>

      {/* Side picker */}
      {showPicker && (
        <div className="side-picker">
          <button className="side-btn" onClick={() => { placeTile(selectedTile.tile, selectedTile.idx, 'left') }}>← Left</button>
          <button className="side-btn" onClick={() => { placeTile(selectedTile.tile, selectedTile.idx, 'right') }}>Right →</button>
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
      {toast && <div className="turn-toast">{toast}</div>}

      {/* Knock animation */}
      {knockPlayer && (
        <KnockAnimation
          playerName={knockPlayer.name}
          position={knockPlayer.position}
          onDone={() => setKnockPlayer(null)}
        />
      )}

      {/* Dekabess celebration */}
      {showDekabess && (
        <DekabessOverlay
          playerName={dekabessPlayer}
          onDone={() => setShowDekabess(false)}
        />
      )}

      {/* Round/Match overlay */}
      {showOverlay && !showDekabess && roomData && (
        <RoundOverlay
          roomData={roomData}
          players={players}
          myInfo={myInfo}
          onNextRound={startNextRound}
          onLeaveLobby={() => { sessionStorage.removeItem('domino_player'); navigate('/') }}
        />
      )}
    </div>
  )
}
