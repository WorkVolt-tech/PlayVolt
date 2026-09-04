import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Draggable, useDrag } from '../components/DragDrop'
import './Tracker.css'

// ── Snake layout (same as Board.jsx) ────────────────────────────────────────
const TW = 28, TH = 56, GAP = 3

function renderDimsT(entry, inCorner) {
  const isDbl = entry.tile[0] === entry.tile[1]
  return inCorner
    ? (isDbl ? { w: TH, h: TW } : { w: TW, h: TH })
    : (isDbl ? { w: TW, h: TH } : { w: TH, h: TW })
}

function computeBoardPositions(tiles, W, H) {
  if (!tiles || tiles.length === 0) return []
  const MARGIN = 40, CORNER_STEPS = 1
  const pos = []
  let x = W / 2, y = H / 2, dir = 1, cornerLeft = 0
  for (let i = 0; i < tiles.length; i++) {
    const entry = tiles[i]
    const inCorner = cornerLeft > 0
    const { w, h } = renderDimsT(entry, inCorner)
    pos.push({ x, y, dir: inCorner ? 0 : dir, pw: w, ph: h })
    if (i === tiles.length - 1) break
    const next = tiles[i + 1]
    if (inCorner) {
      cornerLeft--
      const nextInCorner = cornerLeft > 0
      const { w: nw, h: nh } = renderDimsT(next, nextInCorner)
      if (!nextInCorner) x = x + TW / 2 - nw / 2
      y = y + h / 2 + GAP + nh / 2
    } else {
      const { w: nw } = renderDimsT(next, false)
      const nextX = x + dir * (w / 2 + GAP + nw / 2)
      if (nextX - nw / 2 < MARGIN || nextX + nw / 2 > W - MARGIN) {
        const cd = renderDimsT(next, true)
        x = x + dir * (w / 2 - cd.w / 2)
        dir *= -1; cornerLeft = CORNER_STEPS - 1
        y = y + h / 2 + GAP + cd.h / 2
      } else { x = nextX }
    }
  }
  // Center
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  pos.forEach(p => {
    minX = Math.min(minX, p.x - p.pw / 2); maxX = Math.max(maxX, p.x + p.pw / 2)
    minY = Math.min(minY, p.y - p.ph / 2); maxY = Math.max(maxY, p.y + p.ph / 2)
  })
  const ox = (W - (maxX - minX)) / 2 - minX
  const oy = (H - (maxY - minY)) / 2 - minY
  pos.forEach(p => { p.x += ox; p.y += oy })
  return pos
}

function BoardTileT({ entry, pos }) {
  const isDbl = entry.tile[0] === entry.tile[1]
  const inCorner = pos.dir === 0
  const isVert = inCorner ? !isDbl : isDbl
  let [top, bottom] = entry.tile
  if (!isDbl) {
    const logicalFlip = !!entry.flipped
    const visualMirror = pos.dir === -1
    if (logicalFlip !== visualMirror) { top = entry.tile[1]; bottom = entry.tile[0] }
  }
  return (
    <div style={{
      position: 'absolute',
      left: pos.x - pos.pw / 2, top: pos.y - pos.ph / 2,
      width: pos.pw, height: pos.ph,
      background: '#fffef8', borderRadius: 4,
      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      display: 'grid',
      gridTemplateRows: isVert ? '1fr 1fr' : 'none',
      gridTemplateColumns: isVert ? 'none' : '1fr 1fr',
      overflow: 'hidden', zIndex: 1,
    }}>
      <div style={{ position: 'absolute',
        ...(isVert ? { left: '10%', right: '10%', top: '50%', height: 1, transform: 'translateY(-50%)' }
                   : { top: '10%', bottom: '10%', left: '50%', width: 1, transform: 'translateX(-50%)' }),
        background: 'rgba(26,24,20,0.25)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={`/tiles-white/${top}.png`} draggable={false}
          style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none',
            ...(!isVert && top === 6 ? { transform: 'rotate(90deg)' } : {}) }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={`/tiles-white/${bottom}.png`} draggable={false}
          style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none',
            ...(!isVert && bottom === 6 ? { transform: 'rotate(90deg)' } : {}) }} />
      </div>
    </div>
  )
}

function TrackerBoard({ tiles, onDrop, leftEnd, rightEnd }) {
  const ref = useRef(null)
  const [dims, setDims] = useState({ w: 600, h: 240 })
  const [dragOver, setDragOver] = useState(null)
  const { draggingRef, endDrag } = useDrag()

  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  const positions = computeBoardPositions(tiles, dims.w, dims.h)
  const posL = positions[0]
  const posR = positions[positions.length - 1]

  function handleDrop(side) {
    const data = draggingRef.current
    if (!data) return
    endDrag()
    onDrop(data.tile, side)
  }

  function handleBoardDrop() {
    if (tiles.length > 0) return
    const data = draggingRef.current
    if (!data) return
    endDrag()
    onDrop(data.tile, 'first')
  }

  return (
    <div ref={ref}
      onMouseUp={tiles.length === 0 ? handleBoardDrop : undefined}
      style={{
        position: 'relative', width: '100%', height: 240,
        background: 'var(--felt)',
        backgroundImage: 'radial-gradient(ellipse at 50% 50%, var(--felt) 0%, var(--felt2) 100%)',
        borderRadius: 8, overflow: 'hidden', cursor: tiles.length === 0 ? 'copy' : 'default',
      }}>
      {tiles.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.62rem', letterSpacing: '0.15em', color: 'rgba(240,234,216,0.18)', textTransform: 'uppercase' }}>
          Drag a tile here to start
        </div>
      )}
      {positions.map((pos, i) => <BoardTileT key={i} entry={tiles[i]} pos={pos} />)}

      {/* Left drop zone */}
      {tiles.length > 0 && posL && (
        <div
          data-droppable="true"
          onMouseUp={() => handleDrop('left')}
          onMouseEnter={() => setDragOver('left')}
          onMouseLeave={() => setDragOver(null)}
          style={{
            position: 'absolute',
            left: Math.max(4, posL.x - posL.pw / 2 - 72),
            top: posL.y - 20,
            width: 64, height: 40,
            border: `2px dashed ${dragOver === 'left' ? 'var(--gold)' : 'rgba(201,168,76,0.4)'}`,
            background: dragOver === 'left' ? 'rgba(201,168,76,0.1)' : 'transparent',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', letterSpacing: '0.1em',
            color: dragOver === 'left' ? 'var(--gold)' : 'rgba(201,168,76,0.5)',
            textTransform: 'uppercase', zIndex: 10, cursor: 'copy',
          }}>← {leftEnd}</div>
      )}

      {/* Right drop zone */}
      {tiles.length > 0 && posR && (
        <div
          data-droppable="true"
          onMouseUp={() => handleDrop('right')}
          onMouseEnter={() => setDragOver('right')}
          onMouseLeave={() => setDragOver(null)}
          style={{
            position: 'absolute',
            left: Math.min(dims.w - 72, posR.x + posR.pw / 2 + 4),
            top: posR.y - 20,
            width: 64, height: 40,
            border: `2px dashed ${dragOver === 'right' ? 'var(--gold)' : 'rgba(201,168,76,0.4)'}`,
            background: dragOver === 'right' ? 'rgba(201,168,76,0.1)' : 'transparent',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.55rem', letterSpacing: '0.1em',
            color: dragOver === 'right' ? 'var(--gold)' : 'rgba(201,168,76,0.5)',
            textTransform: 'uppercase', zIndex: 10, cursor: 'copy',
          }}>{rightEnd} →</div>
      )}
    </div>
  )
}

const ALL_DOMINOES = []
for (let a = 0; a <= 6; a++)
  for (let b = a; b <= 6; b++)
    ALL_DOMINOES.push([a, b])

const PLAYERS = ['RP', 'MP', 'LP']

function TileImg({ tile, size = 40, style = {}, onClick, selected, dimmed, faceDown }) {
  const [a, b] = tile
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        background: faceDown ? 'var(--surface2)' : 'var(--ivory)',
        border: selected ? '2px solid var(--gold)' : '1px solid var(--border)',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        opacity: dimmed ? 0.3 : 1,
        boxShadow: selected ? '0 0 10px rgba(201,168,76,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
        transition: 'all 0.15s',
        flexShrink: 0,
        width: size,
        height: size * 2,
        position: 'relative',
        ...style,
      }}
    >
      {!faceDown && (
        <>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`/tiles-white/${a}.png`} draggable={false} style={{ width: '70%', pointerEvents: 'none' }} />
          </div>
          <div style={{ height: 1, background: 'rgba(26,24,20,0.25)', margin: '0 10%' }} />
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={`/tiles-white/${b}.png`} draggable={false} style={{ width: '70%', pointerEvents: 'none' }} />
          </div>
        </>
      )}
    </div>
  )
}

function PlayerTag({ name, active, tileCount, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 4,
      border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
      background: active ? 'rgba(201,168,76,0.1)' : 'var(--surface2)',
      color: active ? 'var(--gold)' : 'var(--ivory-dim)',
      fontSize: '0.65rem', letterSpacing: '0.1em',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      <span>{name}</span>
      <span style={{ opacity: 0.6 }}>{tileCount}</span>
    </div>
  )
}

const PLAYER_COLORS = { RP: '#4c8cca', MP: '#4caa6e', LP: '#c94c4c', ME: 'var(--gold)' }

function DekabessGuide({ myHand, boardTiles, boardLeftEnd, boardRightEnd, playedLog, passes }) {
  const usedKeys = new Set(playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`))
  const myKeys   = new Set(myHand.map(t => `${t[0]}-${t[1]}`))
  const remaining = ALL_DOMINOES.filter(t => !usedKeys.has(`${t[0]}-${t[1]}`) && !myKeys.has(`${t[0]}-${t[1]}`))
  const totalUnknown = remaining.length

  // ── Dekabess analysis ────────────────────────────────────────────────────
  // A Dekabess happens when your last tile is a non-double that matches BOTH open ends
  // So we need: a tile [a,b] where a===leftEnd and b===rightEnd (or vice versa)

  const hasTiles = boardTiles.length > 0

  // Which tiles in your hand could be a Dekabess right now?
  const dekabessNow = hasTiles ? myHand.filter(t => {
    if (t[0] === t[1]) return false
    return (t[0] === boardLeftEnd && t[1] === boardRightEnd) ||
           (t[1] === boardLeftEnd && t[0] === boardRightEnd)
  }) : []

  // Which tiles in your hand match at least one end (good plays to get toward Dekabess)?
  const playableNow = hasTiles ? myHand.filter(t =>
    t[0] === boardLeftEnd || t[1] === boardLeftEnd ||
    t[0] === boardRightEnd || t[1] === boardRightEnd
  ) : myHand

  // For each pair of open ends (or potential future ends), calculate Dekabess probability
  // If we play tile X, the new ends become [newLeft, newRight]
  // Then: how many tiles in remaining could be a Dekabess on those ends?
  function getDekabessSetup(tile, side) {
    if (!hasTiles) return null
    const end = side === 'left' ? boardLeftEnd : boardRightEnd
    let newOpen
    if (side === 'right') {
      newOpen = tile[1] === end ? tile[0] : tile[1]
    } else {
      newOpen = tile[0] === end ? tile[1] : tile[0]
    }
    const newLeft  = side === 'left'  ? newOpen : boardLeftEnd
    const newRight = side === 'right' ? newOpen : boardRightEnd

    // After playing this tile, which of my remaining hand tiles could Dekabess?
    const newHand = myHand.filter(t => `${t[0]}-${t[1]}` !== `${tile[0]}-${tile[1]}`)
    const potential = newHand.filter(t => {
      if (t[0] === t[1]) return false
      return (t[0] === newLeft && t[1] === newRight) ||
             (t[1] === newLeft && t[0] === newRight)
    })
    return { newLeft, newRight, potential, tile, side }
  }

  // Best plays: for each playable tile, check if playing it sets up a Dekabess
  const setups = []
  if (hasTiles) {
    playableNow.forEach(tile => {
      const cL = tile[0] === boardLeftEnd || tile[1] === boardLeftEnd
      const cR = tile[0] === boardRightEnd || tile[1] === boardRightEnd
      if (cL) { const s = getDekabessSetup(tile, 'left');  if (s) setups.push(s) }
      if (cR) { const s = getDekabessSetup(tile, 'right'); if (s) setups.push(s) }
    })
  }

  // Probability that a random remaining tile completes current Dekabess setup
  const dekabessProb = hasTiles && totalUnknown > 0 ? (
    remaining.filter(t => {
      if (t[0] === t[1]) return false
      return (t[0] === boardLeftEnd && t[1] === boardRightEnd) ||
             (t[1] === boardLeftEnd && t[0] === boardRightEnd)
    }).length / totalUnknown * 100
  ).toFixed(1) : 0

  const colors = { high: '#4caa6e', mid: '#c9a84c', low: '#c94c4c' }
  const ratingColor = (pct) => pct >= 60 ? colors.high : pct >= 30 ? colors.mid : colors.low

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Current board state */}
      {hasTiles && (
        <div className="tracker-card">
          <div className="tracker-card-title">Current Board Ends</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--ivory-dim)', marginBottom: 4 }}>LEFT</div>
              <img src={`/tiles-white/${boardLeftEnd}.png`} style={{ height: 32, pointerEvents: 'none' }} />
            </div>
            <div style={{ fontSize: '1.5rem', color: 'var(--border)' }}>↔</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.55rem', color: 'var(--ivory-dim)', marginBottom: 4 }}>RIGHT</div>
              <img src={`/tiles-white/${boardRightEnd}.png`} style={{ height: 32, pointerEvents: 'none' }} />
            </div>
            {boardLeftEnd !== boardRightEnd && (
              <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                <div style={{ fontSize: '0.55rem', color: 'var(--ivory-dim)', marginBottom: 4 }}>DEKABESS CHANCE</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: ratingColor(+dekabessProb) }}>
                  {dekabessProb}%
                </div>
              </div>
            )}
            {boardLeftEnd === boardRightEnd && (
              <div style={{ marginLeft: 'auto', fontSize: '0.6rem', color: 'var(--ivory-dim)' }}>
                Both ends equal — Dekabess not possible
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dekabess NOW */}
      {dekabessNow.length > 0 && (
        <div className="tracker-card" style={{ border: '1px solid var(--gold)', background: 'rgba(201,168,76,0.07)' }}>
          <div className="tracker-card-title" style={{ color: 'var(--gold)' }}>🎯 Dekabess Available NOW!</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
            Play one of these as your last tile for a Dekabess:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {dekabessNow.map(t => <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={28} selected />)}
          </div>
        </div>
      )}

      {/* Best plays toward Dekabess */}
      {setups.filter(s => s.potential.length > 0).length > 0 && (
        <div className="tracker-card">
          <div className="tracker-card-title">🧠 Plays That Set Up a Dekabess</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {setups.filter(s => s.potential.length > 0).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px', background: 'var(--surface2)', borderRadius: 6 }}>
                <TileImg tile={s.tile} size={22} />
                <div style={{ fontSize: '0.58rem', color: 'var(--ivory-dim)' }}>
                  → {s.side}
                </div>
                <div style={{ fontSize: '0.58rem', color: 'var(--ivory-dim)' }}>
                  New ends: <span style={{ color: 'var(--gold)' }}>{s.newLeft} ↔ {s.newRight}</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  {s.potential.map(t => <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={18} selected />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* General best play advice */}
      <div className="tracker-card">
        <div className="tracker-card-title">💡 Best Play Strategy</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.65rem', color: 'var(--ivory-dim)', lineHeight: 1.6 }}>
          {!hasTiles && <p>Place your highest-value tile first to drain your hand fast.</p>}
          {hasTiles && dekabessNow.length > 0 && myHand.length === 1 && (
            <p style={{ color: 'var(--gold)' }}>🎯 Play your last tile for a <strong>Dekabess!</strong> That's 2 wins!</p>
          )}
          {hasTiles && myHand.length > 1 && (
            <>
              <p>• <span style={{ color: 'var(--ivory)' }}>Save non-doubles</span> that match both ends — they could be your Dekabess tile.</p>
              <p>• <span style={{ color: 'var(--ivory)' }}>Play doubles early</span> — they only match one number, harder to place late.</p>
              <p>• <span style={{ color: 'var(--ivory)' }}>Watch opponent hands</span> — if they have few tiles, block the ends they need.</p>
              {setups.filter(s => s.potential.length > 0).length === 0 && (
                <p>• No current Dekabess setup found. Focus on emptying your hand fastest.</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Hand analysis */}
      {myHand.length > 0 && (
        <div className="tracker-card">
          <div className="tracker-card-title">Your Hand Analysis</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {myHand.map(t => {
                const canPlay = !hasTiles || t[0] === boardLeftEnd || t[1] === boardLeftEnd || t[0] === boardRightEnd || t[1] === boardRightEnd
                const isDekabessCandidate = !hasTiles ? false :
                  (t[0] === boardLeftEnd && t[1] === boardRightEnd) || (t[1] === boardLeftEnd && t[0] === boardRightEnd)
                return (
                  <div key={`${t[0]}-${t[1]}`} style={{ textAlign: 'center' }}>
                    <TileImg tile={t} size={22}
                      selected={isDekabessCandidate}
                      dimmed={!canPlay} />
                    <div style={{ fontSize: '0.45rem', marginTop: 2,
                      color: isDekabessCandidate ? 'var(--gold)' : canPlay ? 'var(--green)' : 'var(--border)' }}>
                      {isDekabessCandidate ? '🎯' : canPlay ? '✓' : '✗'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', display: 'flex', gap: 12 }}>
              <span><span style={{ color: 'var(--gold)' }}>🎯</span> Dekabess</span>
              <span><span style={{ color: 'var(--green)' }}>✓</span> Playable</span>
              <span><span style={{ color: 'var(--border)' }}>✗</span> Not playable</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Tracker() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('setup') // setup | playing
  const [myHand, setMyHand] = useState([])
  const [startingPlayer, setStartingPlayer] = useState('ME')
  const [currentPlayer, setCurrentPlayer] = useState('ME')
  const [playedLog, setPlayedLog] = useState([]) // [{domino, player}]
  const [passLog, setPassLog] = useState([])    // [{player, nums}]
  const [passes, setPasses] = useState({ RP: new Set(), MP: new Set(), LP: new Set() })
  const [pendingPass, setPendingPass] = useState({ n1: '', n2: '' })
  const [selectedForPlay, setSelectedForPlay] = useState(null)
  const [activeTab, setActiveTab] = useState('game') // game | guide // tile key for opponent play
  const [boardTiles, setBoardTiles] = useState([]) // [{tile, flipped}]
  const [boardLeftEnd, setBoardLeftEnd] = useState(null)
  const [boardRightEnd, setBoardRightEnd] = useState(null)
  const [pendingSide, setPendingSide] = useState(null) // tile waiting for side choice

  // Which tiles are used (in hand or played)
  const usedTiles = new Set([
    ...myHand.map(t => `${t[0]}-${t[1]}`),
    ...playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`),
  ])

  const availableTiles = ALL_DOMINOES.filter(t => !usedTiles.has(`${t[0]}-${t[1]}`))

  // ── Setup: pick hand ─────────────────────────────────────────────────────
  function toggleHandTile(tile) {
    const key = `${tile[0]}-${tile[1]}`
    const inHand = myHand.some(t => `${t[0]}-${t[1]}` === key)
    if (inHand) {
      setMyHand(myHand.filter(t => `${t[0]}-${t[1]}` !== key))
    } else if (myHand.length < 7) {
      setMyHand([...myHand, tile])
    }
  }

  function startGame() {
    if (myHand.length !== 7) { alert('Select exactly 7 tiles!'); return }
    setCurrentPlayer(startingPlayer)
    setPhase('playing')
  }

  // ── Playing: my tile ─────────────────────────────────────────────────────
  function placeOnBoard(tile, side) {
    if (boardTiles.length === 0) {
      setBoardTiles([{ tile, flipped: false }])
      setBoardLeftEnd(tile[0])
      setBoardRightEnd(tile[1])
      return
    }
    const end = side === 'left' ? boardLeftEnd : boardRightEnd
    let flipped = false, newOpen
    if (side === 'right') {
      if (tile[1] === end) { flipped = true; newOpen = tile[0] } else { newOpen = tile[1] }
    } else {
      if (tile[0] === end) { flipped = true; newOpen = tile[1] } else { newOpen = tile[0] }
    }
    const entry = { tile, flipped }
    if (side === 'left') {
      setBoardTiles(prev => [entry, ...prev])
      setBoardLeftEnd(newOpen)
    } else {
      setBoardTiles(prev => [...prev, entry])
      setBoardRightEnd(newOpen)
    }
  }

  function handleTilePlay(tile, player) {
    // If board empty or only one side matches, auto-place
    if (boardTiles.length === 0) {
      placeOnBoard(tile, 'right')
      return
    }
    const cL = tile[0] === boardLeftEnd || tile[1] === boardLeftEnd
    const cR = tile[0] === boardRightEnd || tile[1] === boardRightEnd
    if (cL && cR && boardLeftEnd !== boardRightEnd) {
      setPendingSide({ tile, player })
    } else if (cL) {
      placeOnBoard(tile, 'left')
    } else if (cR) {
      placeOnBoard(tile, 'right')
    } else {
      placeOnBoard(tile, 'right') // fallback
    }
  }

  function playMyTile(tile) {
    const key = `${tile[0]}-${tile[1]}`
    setPlayedLog(prev => [...prev, { domino: tile, player: 'ME' }])
    setMyHand(prev => prev.filter(t => `${t[0]}-${t[1]}` !== key))
    handleTilePlay(tile, 'ME')
    nextTurn()
  }

  // ── Playing: opponent tile ───────────────────────────────────────────────
  function playOpponentTile() {
    if (!selectedForPlay) return
    const tile = selectedForPlay
    setPlayedLog(prev => [...prev, { domino: tile, player: currentPlayer }])
    setSelectedForPlay(null)
    handleTilePlay(tile, currentPlayer)
    nextTurn()
  }

  // ── Pass ─────────────────────────────────────────────────────────────────
  function doPass() {
    const p = currentPlayer
    if (p === 'ME') { nextTurn(); return }
    const nums = []
    const newPasses = { ...passes, [p]: new Set(passes[p]) }
    if (pendingPass.n1 !== '') { newPasses[p].add(+pendingPass.n1); nums.push(+pendingPass.n1) }
    if (pendingPass.n2 !== '') { newPasses[p].add(+pendingPass.n2); nums.push(+pendingPass.n2) }
    setPasses(newPasses)
    setPassLog(prev => [...prev, { player: p, nums }])
    setPendingPass({ n1: '', n2: '' })
    nextTurn()
  }

  function nextTurn() {
    const order = ['ME', 'RP', 'MP', 'LP']
    const idx = order.indexOf(currentPlayer)
    setCurrentPlayer(order[(idx + 1) % 4])
  }

  // ── Predictions ──────────────────────────────────────────────────────────
  function getPredictions() {
    const used = new Set(playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`))
    const myKeys = new Set(myHand.map(t => `${t[0]}-${t[1]}`))
    let globalAvail = ALL_DOMINOES.filter(t => !used.has(`${t[0]}-${t[1]}`) && !myKeys.has(`${t[0]}-${t[1]}`))

    const tilesLeft = { RP: 7, MP: 7, LP: 7 }
    playedLog.forEach(e => { if (e.player !== 'ME') tilesLeft[e.player]-- })

    const pred = { RP: [], MP: [], LP: [] }
    PLAYERS.forEach(p => {
      const impossible = new Set()
      globalAvail.forEach(t => {
        passes[p].forEach(n => {
          if (t[0] === n || t[1] === n) impossible.add(`${t[0]}-${t[1]}`)
        })
      })
      let avail = globalAvail.filter(t => !impossible.has(`${t[0]}-${t[1]}`))
      const shuffled = [...avail].sort(() => Math.random() - 0.5)
      pred[p] = shuffled.slice(0, tilesLeft[p])
      globalAvail = globalAvail.filter(t => !pred[p].some(pt => pt[0] === t[0] && pt[1] === t[1]))
    })
    return pred
  }

  const predictions = phase === 'playing' ? getPredictions() : null

  // ── Reset ────────────────────────────────────────────────────────────────
  function reset() {
    setPhase('setup'); setMyHand([]); setStartingPlayer('ME')
    setCurrentPlayer('ME'); setPlayedLog([]); setPassLog([])
    setPasses({ RP: new Set(), MP: new Set(), LP: new Set() })
    setPendingPass({ n1: '', n2: '' }); setSelectedForPlay(null)
    setBoardTiles([]); setBoardLeftEnd(null); setBoardRightEnd(null); setPendingSide(null)
    localStorage.removeItem('dekabess_tracker')
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div className="tracker-page">
      <div className="tracker-header">
        <div>
          <h1 className="tracker-title">Dekabess Tracker</h1>
          <p className="tracker-sub" style={{ margin: 0 }}>Track · Predict · Win</p>
        </div>
        <button className="tracker-btn-outline" onClick={() => navigate('/')}>← Back</button>
      </div>

      {/* Hand selection */}
      <div className="tracker-card">
        <div className="tracker-card-title">Your Hand ({myHand.length}/7)</div>
        {/* Selected hand preview */}
        {myHand.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {myHand.map(t => (
              <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={28}
                selected onClick={() => toggleHandTile(t)} />
            ))}
          </div>
        )}
        {/* All tiles grid */}
        <div className="tracker-tile-grid">
          {ALL_DOMINOES.map(t => {
            const key = `${t[0]}-${t[1]}`
            const inHand = myHand.some(h => `${h[0]}-${h[1]}` === key)
            return (
              <TileImg
                key={key} tile={t} size={24}
                selected={inHand}
                dimmed={!inHand && myHand.length >= 7}
                onClick={() => toggleHandTile(t)}
              />
            )
          })}
        </div>
        {/* Starting player */}
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div className="tracker-card-title">Who starts?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['ME', 'RP', 'MP', 'LP'].map(p => (
              <button
                key={p}
                className={`tracker-player-btn ${startingPlayer === p ? 'selected' : ''}`}
                onClick={() => setStartingPlayer(p)}
              >{p}</button>
            ))}
          </div>
        </div>
        <button className="tracker-btn-primary" style={{ marginTop: 8 }} onClick={startGame}>
          Start Tracking →
        </button>
      </div>
    </div>
  )

  // Playing phase
  const allPlayers = ['ME', 'RP', 'MP', 'LP']
  const tileCounts = {
    ME: myHand.length,
    RP: 7 - playedLog.filter(e => e.player === 'RP').length,
    MP: 7 - playedLog.filter(e => e.player === 'MP').length,
    LP: 7 - playedLog.filter(e => e.player === 'LP').length,
  }

  return (
    <div className="tracker-page">
      <div className="tracker-header">
        <h1 className="tracker-title">Dekabess Tracker</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="tracker-btn-outline" onClick={reset}>New Game</button>
          <button className="tracker-btn-outline" onClick={() => navigate('/')}>← Menu</button>
        </div>
      </div>

      {/* Player status bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {allPlayers.map(p => (
          <PlayerTag key={p} name={p} active={p === currentPlayer}
            tileCount={tileCounts[p]} color={PLAYER_COLORS[p]} />
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12 }}>
        {[['game', '🎮 Game'], ['guide', '🎯 Dekabess Guide']].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)} style={{
            flex: 1, padding: '0.6rem', background: 'none', border: 'none',
            borderBottom: `2px solid ${activeTab === id ? 'var(--gold)' : 'transparent'}`,
            color: activeTab === id ? 'var(--gold)' : 'var(--ivory-dim)',
            fontFamily: 'DM Mono, monospace', fontSize: '0.62rem',
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            marginBottom: -1, transition: 'all 0.2s',
          }}>{label}</button>
        ))}
      </div>

      {activeTab === 'guide' && (
        <DekabessGuide
          myHand={myHand}
          boardTiles={boardTiles}
          boardLeftEnd={boardLeftEnd}
          boardRightEnd={boardRightEnd}
          playedLog={playedLog}
          passes={passes}
        />
      )}

      {activeTab === 'game' && (<>

      {/* Current turn */}
      <div className="tracker-card" style={{ borderColor: 'var(--gold)' }}>
        <div className="tracker-card-title" style={{ color: 'var(--gold)' }}>
          Current Turn: {currentPlayer}
        </div>

        {currentPlayer === 'ME' ? (
          <>
            <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
              Click a tile in your hand to play it
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {myHand.map(t => {
                const canPlay = boardTiles.length === 0
                  ? true
                  : t[0] === boardLeftEnd || t[1] === boardLeftEnd || t[0] === boardRightEnd || t[1] === boardRightEnd
                return (
                  <Draggable key={`${t[0]}-${t[1]}`} data={{ tile: t }} disabled={!canPlay}>
                    <TileImg tile={t} size={28}
                      selected={canPlay}
                      dimmed={!canPlay}
                      onClick={canPlay ? () => playMyTile(t) : undefined}
                    />
                  </Draggable>
                )
              })}
            </div>
            {myHand.length === 0 && <div style={{ color: 'var(--gold)', fontSize: '0.75rem' }}>Your hand is empty!</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
              Select tile {currentPlayer} played, or record a pass
            </div>
            {/* Available tiles to pick from */}
            <div className="tracker-tile-grid" style={{ marginBottom: 12 }}>
              {availableTiles.map(t => {
                const key = `${t[0]}-${t[1]}`
                const isSel = selectedForPlay && `${selectedForPlay[0]}-${selectedForPlay[1]}` === key
                const canPlay = boardTiles.length === 0
                  ? true
                  : t[0] === boardLeftEnd || t[1] === boardLeftEnd || t[0] === boardRightEnd || t[1] === boardRightEnd
                return (
                  <Draggable key={key} data={{ tile: t }} disabled={!canPlay}>
                    <TileImg tile={t} size={24}
                      selected={isSel}
                      dimmed={!canPlay}
                      onClick={canPlay ? () => setSelectedForPlay(isSel ? null : t) : undefined}
                    />
                  </Draggable>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="tracker-btn-primary"
                disabled={!selectedForPlay}
                onClick={playOpponentTile}>
                Play Selected Tile
              </button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)' }}>Pass on:</span>
                {[1, 2].map(n => (
                  <select key={n} className="tracker-select"
                    value={pendingPass[`n${n}`]}
                    onChange={e => setPendingPass(prev => ({ ...prev, [`n${n}`]: e.target.value }))}>
                    <option value="">—</option>
                    {[0,1,2,3,4,5,6].map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                ))}
                <button className="tracker-btn-outline" onClick={doPass}>Pass</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Side picker modal */}
      {pendingSide && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--gold)', borderRadius: 8, padding: '1.5rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', letterSpacing: '0.15em', color: 'var(--ivory-dim)', marginBottom: '1rem' }}>
              Which side?
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button className="tracker-btn-primary" onClick={() => {
                placeOnBoard(pendingSide.tile, 'left')
                setPendingSide(null)
              }}>← Left</button>
              <button className="tracker-btn-primary" onClick={() => {
                placeOnBoard(pendingSide.tile, 'right')
                setPendingSide(null)
              }}>Right →</button>
              <button className="tracker-btn-outline" onClick={() => setPendingSide(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="tracker-card">
        <div className="tracker-card-title">Board</div>
        <TrackerBoard tiles={boardTiles} onDrop={(tile, side) => { placeOnBoard(tile, side); setPlayedLog(prev => [...prev, { domino: tile, player: currentPlayer }]); if (currentPlayer === 'ME') setMyHand(prev => prev.filter(t => `${t[0]}-${t[1]}` !== `${tile[0]}-${tile[1]}`)); nextTurn() }} leftEnd={boardLeftEnd} rightEnd={boardRightEnd} />
        {boardTiles.length > 0 && (
          <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', marginTop: 6, letterSpacing: '0.1em' }}>
            Left end: <span style={{ color: 'var(--gold)' }}>{boardLeftEnd}</span>
            &nbsp;·&nbsp;
            Right end: <span style={{ color: 'var(--gold)' }}>{boardRightEnd}</span>
          </div>
        )}
      </div>

      {/* Predictions */}
      <div className="tracker-card">
        <div className="tracker-card-title">Possible Opponent Tiles</div>
        {PLAYERS.map(p => (
          <div key={p} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: PLAYER_COLORS[p], marginBottom: 4 }}>
              {p} ({tileCounts[p]} tiles)
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {predictions[p].map(t => (
                <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={20} />
              ))}
            </div>
          </div>
        ))}
      </div>

      </>) }

      {/* Logs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="tracker-card">
          <div className="tracker-card-title">Played Log</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {playedLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.65rem' }}>
                <span style={{ color: PLAYER_COLORS[e.player], minWidth: 28 }}>{e.player}</span>
                <TileImg tile={e.domino} size={18} />
              </div>
            ))}
          </div>
        </div>
        <div className="tracker-card">
          <div className="tracker-card-title">Pass Log</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {passLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem' }}>
                <span style={{ color: PLAYER_COLORS[e.player], minWidth: 28 }}>{e.player}</span>
                <span style={{ color: 'var(--ivory-dim)' }}>passed on</span>
                {e.nums.map(n => (
                  <img key={n} src={`/tiles-white/${n}.png`} style={{ height: 20, pointerEvents: 'none' }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
