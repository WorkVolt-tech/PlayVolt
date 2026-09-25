import { useState, useEffect, useRef } from 'react'
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

  // Knocks, worked out from what's already on screen.
  //
  // This used to fetch the last 8 game_events every time the turn changed —
  // an extra round trip per turn, for every player, purely to animate a knock.
  // The board already tells us: if the turn moved on and no tile was added,
  // the player whose turn it was must have knocked.
  const prevTurnRef  = useRef(null)
  const prevCountRef = useRef(0)

  useEffect(() => {
    const currentTurn = roomData?.current_turn
    const count = boardData?.tiles?.length ?? 0
    const prevTurn = prevTurnRef.current
    const prevCount = prevCountRef.current

    // first render, or a fresh round — just take a reading
    if (prevTurn === null || count < prevCount) {
      prevTurnRef.current = currentTurn
      prevCountRef.current = count
      setPassingSeats(new Set())
      return
    }

    if (currentTurn !== prevTurn) {
      const seat = prevTurn                  // whoever just had the turn
      if (count > prevCount) {
        // they placed a tile — they're no longer knocking
        setPassingSeats(prev => {
          if (!prev.has(seat)) return prev
          const next = new Set(prev); next.delete(seat); return next
        })
      } else {
        // the turn moved but the board didn't grow: that was a knock
        setPassingSeats(prev => new Set(prev).add(seat))
        const p = players.find(pl => pl.seat === seat)
        if (p) {
          const mySeat = myInfo?.seat ?? 0
          const diff = ((seat - mySeat) + 4) % 4
          const posMap = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' }
          setKnockPlayer({ name: p.nickname, position: posMap[diff] })
        }
      }
    }

    prevTurnRef.current = currentTurn
    prevCountRef.current = count
  }, [roomData?.current_turn, boardData?.tiles?.length, players, myInfo?.seat])

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
