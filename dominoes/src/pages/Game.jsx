import { useState, useEffect, useRef, useCallback } from 'react'
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
  // A tournament match, or a practice room started from one: the way out is
  // back to the bracket, not the lobby.
  const fromTournament = (() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('domino_player') || 'null')
      return !!(saved?.tournamentMatchId || saved?.fromTournament)
    } catch { return false }
  })()
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

  // Knocks come from the move log itself. Every play and every pass writes a
  // game_event saying exactly who did what, and those arrive in the order
  // they happened. (An earlier version guessed a knock from "the turn moved
  // but the board didn't grow" — but the turn and the new tile arrive
  // separately, so it announced knocks after real moves and missed real
  // knocks. Never guess this again.)
  const knockQueue = useRef([])
  const playersForKnock = useRef(players)
  useEffect(() => { playersForKnock.current = players }, [players])

  const showNextKnock = useCallback(() => {
    const next = knockQueue.current.shift()
    setKnockPlayer(next || null)
  }, [])

  useEffect(() => {
    if (!myInfo?.roomId) return
    const ch = db.channel('knocks-' + myInfo.roomId)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${myInfo.roomId}` },
        payload => {
          const e = payload.new
          if (!e || !Number.isInteger(e.player_seat)) return
          if (e.action === 'pass') {
            setPassingSeats(prev => new Set(prev).add(e.player_seat))
            const p = playersForKnock.current.find(pl => pl.seat === e.player_seat)
            const mySeat = myInfo?.seat ?? 0
            const diff = ((e.player_seat - mySeat) + 4) % 4
            const posMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' }
            const knock = { name: p?.nickname || 'Player', position: posMap[diff] }
            // several knocks in a row each get shown, one after another
            setKnockPlayer(cur => {
              if (cur) { knockQueue.current.push(knock); return cur }
              return knock
            })
          } else if (e.action === 'place') {
            setPassingSeats(prev => {
              if (!prev.has(e.player_seat)) return prev
              const next = new Set(prev); next.delete(e.player_seat); return next
            })
          }
        })
      .subscribe()
    return () => { db.removeChannel(ch) }
  }, [myInfo?.roomId, myInfo?.seat])

  // a new round starts clean
  useEffect(() => {
    setPassingSeats(new Set())
    knockQueue.current = []
  }, [roomData?.round])

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
          onDone={showNextKnock}
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
          leaveLabel={fromTournament ? 'Back to the tournament' : undefined}
          onLeaveLobby={() => {
            sessionStorage.removeItem('domino_player')
            navigate(fromTournament ? '/tournament' : '/')
          }}
        />
      )}
    </div>
  )
}
