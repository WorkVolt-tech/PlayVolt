import { useState, useRef, useEffect } from 'react'
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

function TrackerBoard({ tiles }) {
  const ref = useRef(null)
  const [dims, setDims] = useState({ w: 600, h: 240 })
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setDims({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const positions = computeBoardPositions(tiles, dims.w, dims.h)
  return (
    <div ref={ref} style={{
      position: 'relative', width: '100%', height: 240,
      background: 'var(--felt)',
      backgroundImage: 'radial-gradient(ellipse at 50% 50%, var(--felt) 0%, var(--felt2) 100%)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {tiles.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.62rem', letterSpacing: '0.15em', color: 'rgba(240,234,216,0.18)', textTransform: 'uppercase' }}>
          Board empty
        </div>
      )}
      {positions.map((pos, i) => <BoardTileT key={i} entry={tiles[i]} pos={pos} />)}
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

export default function Tracker() {
  const [phase, setPhase] = useState('setup') // setup | playing
  const [myHand, setMyHand] = useState([])
  const [startingPlayer, setStartingPlayer] = useState('ME')
  const [currentPlayer, setCurrentPlayer] = useState('ME')
  const [playedLog, setPlayedLog] = useState([]) // [{domino, player}]
  const [passLog, setPassLog] = useState([])    // [{player, nums}]
  const [passes, setPasses] = useState({ RP: new Set(), MP: new Set(), LP: new Set() })
  const [pendingPass, setPendingPass] = useState({ n1: '', n2: '' })
  const [selectedForPlay, setSelectedForPlay] = useState(null) // tile key for opponent play
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
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div className="tracker-page">
      <div className="tracker-header">
        <h1 className="tracker-title">Domino Tracker</h1>
        <p className="tracker-sub">Select your 7 tiles and starting player</p>
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
        <h1 className="tracker-title">Domino Tracker</h1>
        <button className="tracker-btn-outline" onClick={reset}>New Game</button>
      </div>

      {/* Player status bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {allPlayers.map(p => (
          <PlayerTag key={p} name={p} active={p === currentPlayer}
            tileCount={tileCounts[p]} color={PLAYER_COLORS[p]} />
        ))}
      </div>

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
              {myHand.map(t => (
                <TileImg key={`${t[0]}-${t[1]}`} tile={t} size={28}
                  onClick={() => playMyTile(t)} />
              ))}
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
                return (
                  <TileImg key={key} tile={t} size={24}
                    selected={isSel}
                    onClick={() => setSelectedForPlay(isSel ? null : t)}
                  />
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
        <TrackerBoard tiles={boardTiles} />
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
