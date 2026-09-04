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
  const hasTiles = boardTiles.length > 0
  const usedKeys = new Set(playedLog.map(e => `${e.domino[0]}-${e.domino[1]}`))
  const myKeys   = new Set(myHand.map(t => `${t[0]}-${t[1]}`))
  const remaining = ALL_DOMINOES.filter(t => !usedKeys.has(`${t[0]}-${t[1]}`) && !myKeys.has(`${t[0]}-${t[1]}`))

  // Can tile t play on a given end?
  function playsOn(t, end) { return t[0] === end || t[1] === end }

  // After playing tile t on 'side', what are the new board ends?
  function newEnds(t, side) {
    if (!hasTiles) return { L: t[0], R: t[1] }
    const end = side === 'left' ? boardLeftEnd : boardRightEnd
    const newOpen = t[1] === end ? t[0] : t[1]
    return {
      L: side === 'left'  ? newOpen : boardLeftEnd,
      R: side === 'right' ? newOpen : boardRightEnd,
    }
  }

  // Is tile t a Dekabess on ends L/R? (non-double, matches both)
  function isDekabess(t, L, R) {
    if (t[0] === t[1]) return false
    if (L === R) return false
    return (t[0] === L && t[1] === R) || (t[1] === L && t[0] === R)
  }

  // ── Can I Dekabess RIGHT NOW (last tile in hand)? ──────────────────────
  const canDekabessNow = hasTiles && myHand.length === 1 && isDekabess(myHand[0], boardLeftEnd, boardRightEnd)

  // ── Which of my tiles IS the Dekabess tile right now (even if not last)? ─
  const dekabessReady = hasTiles ? myHand.filter(t => isDekabess(t, boardLeftEnd, boardRightEnd)) : []

  // ── Path to Dekabess: for each subset of plays, can I end with a Dekabess? ─
  // Strategy: find which tile I should SAVE as my last tile (the Dekabess tile)
  // Then figure out what to play now to make that happen
  const dekabessPlans = []
  if (hasTiles && myHand.length > 1) {
    myHand.forEach(keepTile => {
      if (keepTile[0] === keepTile[1]) return // doubles can't Dekabess
      const restOfHand = myHand.filter(t => `${t[0]}-${t[1]}` !== `${keepTile[0]}-${keepTile[1]}`)

      // What board ends would allow keepTile to Dekabess?
      // keepTile [a,b] needs ends to be {a,b}
      const needL = keepTile[0], needR = keepTile[1]
      const needL2 = keepTile[1], needR2 = keepTile[0]

      // For each tile I could play NOW, does it move toward {needL,needR}?
      const playableNow = restOfHand.filter(t =>
        !hasTiles || playsOn(t, boardLeftEnd) || playsOn(t, boardRightEnd)
      )

      playableNow.forEach(playNow => {
        const sides = []
        if (!hasTiles) sides.push('first')
        else {
          if (playsOn(playNow, boardLeftEnd)) sides.push('left')
          if (playsOn(playNow, boardRightEnd)) sides.push('right')
        }
        sides.forEach(side => {
          const ends = newEnds(playNow, side)
          // After playing playNow, can keepTile eventually Dekabess?
          // Check if keepTile matches the new ends
          const directDek = isDekabess(keepTile, ends.L, ends.R)
          if (directDek) {
            dekabessPlans.push({
              playNow, side, keepTile,
              newL: ends.L, newR: ends.R,
              stepsAway: 1,
              label: myHand.length === 2 ? 'Play this → Dekabess next!' : 'Play this → sets up Dekabess'
            })
          }
        })
      })
    })
  }

  // ── Simple win: best tile to play to empty hand fastest ────────────────
  // Play the tile with most pip value (get rid of big tiles)
  // But prioritize tiles that keep the most options open
  const playableNow = hasTiles
    ? myHand.filter(t => playsOn(t, boardLeftEnd) || playsOn(t, boardRightEnd))
    : myHand

  const bestToWin = [...playableNow].sort((a, b) => {
    // Prefer non-doubles (doubles are harder to place later)
    const aIsDouble = a[0] === a[1], bIsDouble = b[0] === b[1]
    if (aIsDouble && !bIsDouble) return 1
    if (!aIsDouble && bIsDouble) return -1
    // Then highest pip count
    return (b[0] + b[1]) - (a[0] + a[1])
  })

  const colors = { gold: 'var(--gold)', green: 'var(--green)', red: 'var(--red)', dim: 'var(--ivory-dim)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Dekabess NOW */}
      {canDekabessNow && (
        <div className="tracker-card" style={{ border: '2px solid var(--gold)', background: 'rgba(201,168,76,0.1)' }}>
          <div style={{ fontFamily: 'Playfair Display, serif', fontSize: '1.4rem', color: 'var(--gold)', marginBottom: 8 }}>
            🎯 Play it — DEKABESS!
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', marginBottom: 10 }}>
            Your last tile matches both open ends. Play it for 2 wins!
          </div>
          <TileImg tile={myHand[0]} size={32} selected />
        </div>
      )}

      {/* Dekabess tile already in hand and playable */}
      {!canDekabessNow && dekabessReady.length > 0 && myHand.length > 1 && (
        <div className="tracker-card" style={{ border: '1px solid var(--gold)' }}>
          <div className="tracker-card-title" style={{ color: 'var(--gold)' }}>🎯 Save This for Dekabess</div>
          <div style={{ fontSize: '0.62rem', color: 'var(--ivory-dim)', marginBottom: 8 }}>
            This tile matches both ends right now. Save it as your last tile — play everything else first.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {dekabessReady.map(t => <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={28} selected />)}
          </div>
        </div>
      )}

      {/* Dekabess plans */}
      {!canDekabessNow && dekabessPlans.length > 0 && (
        <div className="tracker-card">
          <div className="tracker-card-title">🧠 Path to Dekabess</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', marginBottom: 10 }}>
            Play these tiles to set up a Dekabess finish:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dekabessPlans.slice(0, 4).map((plan, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px', background: 'var(--surface2)', borderRadius: 8,
                border: '1px solid var(--border)'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: 'var(--ivory-dim)', marginBottom: 4 }}>PLAY NOW</div>
                  <TileImg tile={plan.playNow} size={24} />
                  <div style={{ fontSize: '0.5rem', color: 'var(--ivory-dim)', marginTop: 2 }}>→ {plan.side}</div>
                </div>
                <div style={{ color: 'var(--border)', fontSize: '1.2rem' }}>→</div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', color: 'var(--gold)', marginBottom: 4 }}>DEKABESS WITH</div>
                  <TileImg tile={plan.keepTile} size={24} selected />
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '0.55rem', color: 'var(--gold)', fontWeight: 700 }}>
                  {plan.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Dekabess path — suggest best play to just win */}
      {!canDekabessNow && dekabessPlans.length === 0 && (
        <div className="tracker-card">
          <div className="tracker-card-title">💡 No Dekabess Path — Best Play to Win</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', marginBottom: 10 }}>
            No Dekabess setup found. Focus on emptying your hand. Play in this order:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {bestToWin.map((t, i) => (
              <div key={`${t[0]}-${t[1]}`} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.5rem', color: 'var(--ivory-dim)', marginBottom: 2 }}>#{i+1}</div>
                <TileImg tile={t} size={24} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best play to win even when there IS a Dekabess path */}
      {bestToWin.length > 0 && dekabessPlans.length > 0 && !canDekabessNow && (
        <div className="tracker-card">
          <div className="tracker-card-title">🏆 Best Play to Simply Win (no Dekabess)</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {bestToWin.slice(0, 1).map(t => (
              <div key={`${t[0]}-${t[1]}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TileImg tile={t} size={28} />
                <span style={{ fontSize: '0.62rem', color: 'var(--ivory-dim)' }}>
                  Highest value playable — gets rid of {t[0]+t[1]} pips
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hand overview */}
      {myHand.length > 0 && hasTiles && (
        <div className="tracker-card">
          <div className="tracker-card-title">Your Hand</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {myHand.map(t => {
              const canPlay = playsOn(t, boardLeftEnd) || playsOn(t, boardRightEnd)
              const isDek = isDekabess(t, boardLeftEnd, boardRightEnd)
              const inPlan = dekabessPlans.some(p => `${p.keepTile[0]}-${p.keepTile[1]}` === `${t[0]}-${t[1]}`)
              return (
                <div key={`${t[0]}-${t[1]}`} style={{ textAlign: 'center' }}>
                  <TileImg tile={t} size={22} selected={isDek || inPlan} dimmed={!canPlay} />
                  <div style={{ fontSize: '0.45rem', marginTop: 2,
                    color: isDek ? 'var(--gold)' : inPlan ? 'var(--green)' : canPlay ? 'var(--ivory-dim)' : 'var(--border)' }}>
                    {isDek ? '🎯' : inPlan ? 'save' : canPlay ? '✓' : '✗'}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '0.55rem', color: 'var(--ivory-dim)' }}>
            <span><span style={{ color: 'var(--gold)' }}>🎯</span> Dekabess tile</span>
            <span><span style={{ color: 'var(--green)' }}>save</span> Keep for Dekabess</span>
            <span>✓ Playable &nbsp; ✗ Blocked</span>
          </div>
        </div>
      )}

      {!hasTiles && (
        <div className="tracker-card">
          <div style={{ fontSize: '0.65rem', color: 'var(--ivory-dim)', textAlign: 'center', padding: '1rem' }}>
            Place the first tile on the board to see Dekabess suggestions.
          </div>
        </div>
      )}
    </div>
  )
}


export default function Tracker() {
  const navigate = useNavigate()
  const saved = (() => { try { return JSON.parse(localStorage.getItem('dekabess_tracker') || 'null') } catch { return null } })()

  const [phase, setPhase] = useState(saved?.phase || 'setup')
  const [myHand, setMyHand] = useState(saved?.myHand || [])
  const [startingPlayer, setStartingPlayer] = useState(saved?.startingPlayer || 'ME')
  const [currentPlayer, setCurrentPlayer] = useState(saved?.currentPlayer || 'ME')
  const [playedLog, setPlayedLog] = useState(saved?.playedLog || [])
  const [passLog, setPassLog] = useState(saved?.passLog || [])
  const [passes, setPasses] = useState(() => {
    const p = saved?.passes || {}
    return { RP: new Set(p.RP || []), MP: new Set(p.MP || []), LP: new Set(p.LP || []) }
  })
  const [pendingPass, setPendingPass] = useState({ n1: '', n2: '' })
  const [selectedForPlay, setSelectedForPlay] = useState(null)
  const [activeTab, setActiveTab] = useState('game')
  const [boardTiles, setBoardTiles] = useState(saved?.boardTiles || [])
  const [boardLeftEnd, setBoardLeftEnd] = useState(saved?.boardLeftEnd ?? null)
  const [boardRightEnd, setBoardRightEnd] = useState(saved?.boardRightEnd ?? null)
  const [pendingSide, setPendingSide] = useState(null)

  // Save to localStorage immediately on every state change AND on beforeunload
  const getState = () => ({
    phase, myHand, startingPlayer, currentPlayer,
    playedLog, passLog,
    passes: { RP: [...passes.RP], MP: [...passes.MP], LP: [...passes.LP] },
    boardTiles, boardLeftEnd, boardRightEnd,
  })

  useEffect(() => {
    localStorage.setItem('dekabess_tracker', JSON.stringify(getState()))
  }, [phase, myHand, startingPlayer, currentPlayer, playedLog, passLog, passes, boardTiles, boardLeftEnd, boardRightEnd])

  useEffect(() => {
    function onUnload() {
      localStorage.setItem('dekabess_tracker', JSON.stringify(getState()))
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  })

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
    const newPasses = { ...passes, [p]: new Set(passes[p]) }
    const nums = []
    // Auto-record the current open ends as what they passed on
    if (boardLeftEnd !== null) { newPasses[p].add(boardLeftEnd); nums.push(boardLeftEnd) }
    if (boardRightEnd !== null && boardRightEnd !== boardLeftEnd) { newPasses[p].add(boardRightEnd); nums.push(boardRightEnd) }
    setPasses(newPasses)
    setPassLog(prev => [...prev, { player: p, nums }])
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
