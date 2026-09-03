import { useState, useCallback } from 'react'
import './Tracker.css'

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
  function playMyTile(tile) {
    const key = `${tile[0]}-${tile[1]}`
    setPlayedLog(prev => [...prev, { domino: tile, player: 'ME' }])
    setMyHand(prev => prev.filter(t => `${t[0]}-${t[1]}` !== key))
    nextTurn()
  }

  // ── Playing: opponent tile ───────────────────────────────────────────────
  function playOpponentTile() {
    if (!selectedForPlay) return
    setPlayedLog(prev => [...prev, { domino: selectedForPlay, player: currentPlayer }])
    setSelectedForPlay(null)
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
