import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import Board from '../components/Board'
import OpponentHands from '../components/OpponentHands'
import KnockAnimation, { knockKey } from '../components/KnockAnimation'
import TileBack from '../components/TileBack'
import { SeatAvatar, hasSeatAvatar } from '../lib/avatars'
import { setRoomSkins } from '../lib/skins'
import './Game.css'
import './Watch.css'

// ── Watching a game ──────────────────────────────────────────────────────────
// A read-only seat beside the table. Spectators see the board, every player's
// hand as backs (never the faces), knocks, slides and the Dekabess — and the
// game never knows they're there: this page doesn't use the game's player
// logic (no presence as a player, no bot running, no stand-ins), it only
// listens. Spectators announce themselves on a separate channel, so players
// can see how many are watching; at most MAX_WATCHERS per game.

const MAX_WATCHERS = 20

// where a seat sits, viewed from seat 0's side of the table (as the players see it)
function sideOf(seat, viewSeat, n) {
  const k = Math.max(2, Math.min(4, n || 4))
  const diff = ((seat - viewSeat) % k + k) % k
  if (diff === 0) return 'bottom'
  if (k === 2) return 'top'
  if (k === 3) return diff === 1 ? 'right' : 'left'
  return ['bottom', 'right', 'top', 'left'][diff]
}

export default function Watch() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [board, setBoard] = useState(null)
  const [gone, setGone] = useState(false)
  const [full, setFull] = useState(false)
  const [watchers, setWatchers] = useState(0)
  const [knock, setKnock] = useState(null)
  const [lastPlacer, setLastPlacer] = useState(null)
  const [dekKey, setDekKey] = useState(null)
  const knockQueue = useRef([])
  const playersRef = useRef([])
  playersRef.current = players
  const roomRef = useRef(null)
  roomRef.current = room
  const dekShown = useRef('')

  // Spectators only ever keep the backs: each hand becomes blank tiles of the
  // same count before it's stored, so no face is ever drawn or kept here.
  const load = useCallback(async () => {
    const [{ data: r }, { data: ps }, { data: b }] = await Promise.all([
      db.from('domino_rooms').select('*').eq('id', roomId).maybeSingle(),
      db.from('domino_players').select('seat, nickname, is_ai, stand_in, left_at, avatar, tile_skin, hand').eq('room_id', roomId).order('seat'),
      db.from('board').select('*').eq('room_id', roomId).maybeSingle(),
    ])
    if (!r) { setGone(true); return }
    setRoom(r)
    setPlayers((ps || []).map(p => ({ ...p, hand: (Array.isArray(p.hand) ? p.hand : []).map(() => [0, 0]) })))
    setBoard(b || null)
  }, [roomId])

  // the table's data, live
  useEffect(() => {
    load()
    let t = null
    const reload = () => { clearTimeout(t); t = setTimeout(load, 150) }
    const ch = db.channel(`watch-data-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_rooms', filter: `id=eq.${roomId}` },
        p => { if (p.eventType === 'DELETE') setGone(true); else reload() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${roomId}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board', filter: `room_id=eq.${roomId}` }, reload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` }, p => {
        const e = p.new || {}
        if (e.action === 'place') setLastPlacer(e.player_seat)        // who played the newest tile (for the slide)
        if (e.action === 'pass') {
          const n = roomRef.current?.seat_count || playersRef.current.length || 4
          const k = {
            name: playersRef.current.find(x => x.seat === e.player_seat)?.nickname || 'Player',
            position: sideOf(e.player_seat, 0, n),
          }
          setKnock(cur => { if (cur) { knockQueue.current.push(k); return cur } return k })
        }
      })
      .subscribe()
    return () => { clearTimeout(t); db.removeChannel(ch) }
  }, [roomId, load])

  // being counted as a spectator (and the limit per game)
  useEffect(() => {
    const me = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random())
    const ch = db.channel(`watch-${roomId}`, { config: { presence: { key: me } } })
    let decided = false
    ch.on('presence', { event: 'sync' }, () => {
      const n = Object.keys(ch.presenceState()).length
      setWatchers(n)
      if (decided) return
      decided = true
      if (n >= MAX_WATCHERS) { setFull(true); return }
      ch.track({ at: Date.now() })
    }).subscribe()
    return () => { db.removeChannel(ch) }
  }, [roomId])

  // the host's table and tiles, as the players see them
  useEffect(() => {
    if (room) setRoomSkins({ tile: room.tile_skin, table: room.table_skin })
  }, [room?.tile_skin, room?.table_skin])
  useEffect(() => () => setRoomSkins(null), [])

  // the Dekabess on the table, once per round
  useEffect(() => {
    if (!room?.pending_point || (room.status !== 'round_end' && room.status !== 'finished')) return
    const key = `${roomId}:${room.round}`
    if (dekShown.current === key) return
    dekShown.current = key
    setDekKey(key)
  }, [room?.pending_point, room?.status, room?.round, roomId])

  if (gone) {
    return (
      <div className="watch-message">
        <h2>This game has ended</h2>
        <button onClick={() => navigate(-1)}>Back</button>
      </div>
    )
  }
  if (full) {
    return (
      <div className="watch-message">
        <h2>This game has as many spectators as it can take</h2>
        <p>Try again in a little while.</p>
        <button onClick={() => navigate(-1)}>Back</button>
      </div>
    )
  }
  if (!room) return <div className="watch-message"><p>Finding the table…</p></div>

  const n = room.seat_count || players.length || 4
  const bottom = players.find(p => p.seat === 0)
  const winner = players.find(p => p.seat === room.current_turn)
  const roundOver = room.status === 'round_end' || room.status === 'finished'

  return (
    <div className="game-layout watching">
      <div className="top-bar">
        <div className="top-bar-left">
          <span className="game-title">Dekabess!</span>
          <span className="watch-badge">👁 Watching · {watchers}</span>
        </div>
        <div className="player-tags">
          {players.map(p => (
            <div key={p.seat} className={['player-tag', p.seat === room.current_turn && !roundOver ? 'active-turn' : ''].join(' ')}>
              <div className="tag-dot" />
              <span>{p.nickname}</span>
              {p.stand_in && <span className="tag-standin" title="A bot is playing until they're back">🤖 bot playing</span>}
              <span className="tag-tiles">{p.hand.length}</span>
            </div>
          ))}
        </div>
        <button className="btn-leave" onClick={() => navigate(-1)}>Leave</button>
      </div>

      <div className="board-container">
        <OpponentHands players={players} myInfo={{ seat: 0 }} roomData={room} />
        <Board
          boardData={board}
          selectedTile={null}
          isMyTurn={false}
          onDropZone={() => {}}
          onDragPlace={() => {}}
          freshFrom={lastPlacer != null ? sideOf(lastPlacer, 0, n) : null}
          dekabessKey={dekKey}
          dekabessFrom={sideOf(room.current_turn, 0, n)}
          onDekabessDone={() => setDekKey(null)}
        />
        {roundOver && !dekKey && (
          <div className="watch-round">
            {room.status === 'finished'
              ? <>Vyèj — <strong>{winner?.nickname || '—'}</strong>{room.game_mode === 'asosye' ? '’s team' : ''} win{room.game_mode === 'asosye' ? '' : 's'} the match</>
              : room.blocked
                ? <>The table is jammed — <strong>{winner?.nickname || '—'}</strong> takes the round</>
                : <><strong>{winner?.nickname || '—'}</strong> wins the round{room.pending_point ? ' with a Dekabess!' : ''}</>}
          </div>
        )}
      </div>

      {/* seat 0, seen from behind: backs only */}
      <div className="watch-bottom">
        {bottom && (
          <>
            <div className={`watch-bottom-plate ${bottom.seat === room.current_turn && !roundOver ? 'on-turn' : ''}`}>
              {hasSeatAvatar(bottom) ? <SeatAvatar player={bottom} size={30} /> : null}
              <span>{bottom.nickname}</span>
            </div>
            <div className="watch-bottom-hand">
              {bottom.hand.map((_, i) => (
                <div key={i} className="watch-back"><TileBack skin={bottom.tile_skin || undefined} /></div>
              ))}
            </div>
          </>
        )}
      </div>

      {knock && (
        <KnockAnimation
          key={knockKey(knock)}
          playerName={knock.name}
          position={knock.position}
          onDone={() => setKnock(knockQueue.current.shift() || null)}
        />
      )}
    </div>
  )
}
