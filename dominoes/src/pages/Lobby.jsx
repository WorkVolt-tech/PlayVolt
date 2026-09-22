import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { generateRoomCode, generateDominoSet, shuffle } from '../hooks/useGameState'
import './Lobby.css'

// ── Solo opponents ───────────────────────────────────────────────────────────
// A bot's personality comes from its name (see getPersonality in botAI.js).
// Ti-Jòj, Ti-Tid and Ti-Sere are ONLY ever seated when picked here — they are
// deliberately absent from the random replacement-bot name lists, so an
// all-seeing bot can never silently take a disconnected player's seat in PvP.
const BOT_ROSTER = [
  { name: 'Ti-Djo',  role: 'Strategist' },
  { name: 'Ti-Cam',  role: 'Gambler' },
  { name: 'Ti-Jean', role: 'Blocker' },
  { name: 'Ti-Jòj',  role: 'Expert' },
  { name: 'Ti-Tid',  role: 'Expert' },
  { name: 'Ti-Sere', role: 'Expert' },
]

// Same bot picked more than once → "Ti-Jòj", "Ti-Jòj 2", … so every seat
// has a distinct name. getPersonality matches on the name, so the number
// suffix keeps the personality.
function resolveBotNames(picks) {
  const seen = {}
  return picks.map(name => {
    seen[name] = (seen[name] || 0) + 1
    return seen[name] === 1 ? name : `${name} ${seen[name]}`
  })
}

export default function Lobby() {
  const navigate = useNavigate()
  const [authUser, setAuthUser] = useState(null)
  const [authProfile, setAuthProfile] = useState(null)

  useEffect(() => {
    import('../lib/supabase').then(({ db }) => {
      db.auth.getSession().then(async ({ data: { session } }) => {
        setAuthUser(session?.user ?? null)
        if (session?.user) {
          const { data } = await db.from('profiles').select('nickname').eq('id', session.user.id).single()
          setAuthProfile(data)
        }
      })
      db.auth.onAuthStateChange(async (_, s) => {
        setAuthUser(s?.user ?? null)
        if (s?.user) {
          const { db: dbInner } = await import('../lib/supabase')
          const { data } = await dbInner.from('profiles').select('nickname').eq('id', s.user.id).single()
          setAuthProfile(data)
        } else {
          setAuthProfile(null)
        }
      })
    })
  }, [])

  // Detect iOS Safari (not already installed)
  const isIos = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())
  const isStandalone = window.navigator.standalone === true
  const showIosHint = isIos && !isStandalone
  const [nickname, setNickname] = useState(() => localStorage.getItem('domino_nickname') || '')

  // Override with profile nickname when signed in
  useEffect(() => {
    if (authProfile?.nickname) setNickname(authProfile.nickname)
  }, [authProfile?.nickname])
  const [tab, setTab] = useState('create')
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Create room state
  const [myRoomId, setMyRoomId]     = useState(null)
  const [myRoomCode, setMyRoomCode] = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [mySeat, setMySeat]         = useState(null)
  const myPlayerIdRef = useRef(null)
  const mySeatRef     = useRef(null)
  const myRoomCodeRef = useRef(null)
  const [players, setPlayers]       = useState([])
  const [selectedMode, setMode]     = useState('chien')
  const [selectedAI, setAI]         = useState('beginner')
  // Solo: which bot sits in each of the 3 AI seats (defaults = the original trio)
  const [botPicks, setBotPicks]     = useState(['Ti-Djo', 'Ti-Cam', 'Ti-Jean'])
  const [selectedPartner, setPartner] = useState(null)
  const [amHost, setAmHost]         = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const channelRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('domino_nickname', nickname)
  }, [nickname])

  // Keep refs in sync so closures always see current values
  useEffect(() => { myPlayerIdRef.current = myPlayerId }, [myPlayerId])
  useEffect(() => { mySeatRef.current = mySeat }, [mySeat])
  useEffect(() => { myRoomCodeRef.current = myRoomCode }, [myRoomCode])

  useEffect(() => {
    const code = new URLSearchParams(location.search).get('join')
    if (code) { setTab('join'); setJoinCode(code.toUpperCase()) }
    loadQueueCount()
  }, [])

  const [inQueue, setInQueue] = useState(false)
  const [myQueueId, setMyQueueId] = useState(null)
  const queueChannelRef = useRef(null)

  async function loadQueueCount() {
    const { data } = await db.from('queue').select('id').eq('status', 'waiting')
    setQueueCount(data?.length ?? 0)
  }

  async function joinQueue() {
    const nick = getNickname(); if (!nick) return
    setInQueue(true)

    // Insert into queue
    const { data: entry, error } = await db.from('queue')
      .insert({ nickname: nick, status: 'waiting' })
      .select().single()
    if (error) { setMsg({ text: 'Queue error: ' + error.message, type: 'error' }); setInQueue(false); return }
    setMyQueueId(entry.id)

    // Subscribe to queue changes
    if (queueChannelRef.current) db.removeChannel(queueChannelRef.current)
    queueChannelRef.current = db.channel('queue-watch-' + entry.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, async () => {
        const { data: waiting } = await db.from('queue').select('*').eq('status', 'waiting').order('created_at')
        setQueueCount(waiting?.length ?? 0)

        // If 4 players in queue, first player creates the room
        if (waiting?.length >= 4) {
          const first4 = waiting.slice(0, 4)
          if (first4[0].id === entry.id) {
            // I'm first — create room, deal hands, add all 4 players
            const code = generateRoomCode()

            // Find who has 6-6 to set starting seat
            const allTiles = []
            for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) allTiles.push([a,b])
            const shuffled = allTiles.sort(() => Math.random() - 0.5)
            const hands = [shuffled.slice(0,7), shuffled.slice(7,14), shuffled.slice(14,21), shuffled.slice(21,28)]
            const startingSeat = hands.findIndex(h => h.some(t => t[0]===6 && t[1]===6))

            const { data: room } = await db.from('domino_rooms')
              .insert({ code, status: 'waiting', current_turn: startingSeat >= 0 ? startingSeat : 0, round: 1, game_mode: 'chien' })
              .select().single()
            if (!room) return

            // Add board row
            await db.from('board').insert({ room_id: room.id, tiles: [], left_end: null, right_end: null })

            // Add players with hands
            for (let i = 0; i < 4; i++) {
              await db.from('domino_players').insert({
                room_id: room.id, seat: i,
                nickname: first4[i].nickname,
                hand: hands[i],
                is_connected: true, is_ai: false,
              })
              await db.from('queue').update({ status: 'matched', room_id: room.id }).eq('id', first4[i].id)
            }

            // Set to playing AFTER everything is ready
            await db.from('domino_rooms').update({ status: 'playing' }).eq('id', room.id)
          } else if (first4.some(p => p.id === entry.id)) {
            // I'm in the first 4 — watch for room assignment
            const myEntry = first4.find(p => p.id === entry.id)
            if (myEntry?.room_id) {
              const myIdx = first4.indexOf(myEntry)
              const { data: roomData } = await db.from('domino_rooms').select('code').eq('id', myEntry.room_id).single()
              sessionStorage.setItem('domino_player', JSON.stringify({
                seat: myIdx, nickname: nick,
                roomId: myEntry.room_id, roomCode: roomData?.code || '', gameMode: 'chien',
              }))
              if (queueChannelRef.current) db.removeChannel(queueChannelRef.current)
              navigate('/game')
            }
          }
        }
      })
      .subscribe()

    // Also watch for my entry to get matched (room_id set)
    db.channel('my-queue-' + entry.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'queue',
        filter: `id=eq.${entry.id}`
      }, async (payload) => {
        if (payload.new.status === 'matched' && payload.new.room_id) {
          const { data: me } = await db.from('domino_players')
            .select('seat').eq('room_id', payload.new.room_id).eq('nickname', nick).single()
          const { data: rData } = await db.from('domino_rooms').select('code').eq('id', payload.new.room_id).single()
          sessionStorage.setItem('domino_player', JSON.stringify({
            seat: me?.seat ?? 0, nickname: nick,
            roomId: payload.new.room_id, roomCode: rData?.code || '', gameMode: 'chien',
          }))
          navigate('/game')
        }
      })
      .subscribe()
  }

  async function leaveQueue() {
    if (myQueueId) await db.from('queue').delete().eq('id', myQueueId)
    if (queueChannelRef.current) db.removeChannel(queueChannelRef.current)
    setInQueue(false)
    setMyQueueId(null)
    loadQueueCount()
  }

  function getNickname() {
    const v = nickname.trim()
    if (!v) { setMsg({ text: 'Please enter a nickname first!', type: 'error' }); return null }
    return v
  }

  async function loadPlayers(roomId) {
    const { data } = await db.from('domino_players').select('*').eq('room_id', roomId).order('seat')
    setPlayers(data || [])
    return data || []
  }

  function subscribeToRoom(roomId, panel) {
    if (channelRef.current) db.removeChannel(channelRef.current)
    channelRef.current = db.channel('lobby-' + roomId + '-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers(roomId))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'domino_rooms', filter: `id=eq.${roomId}` },
        async (payload) => {
          if (payload.new.status === 'playing') {
            let finalSeat = mySeatRef.current
            if (myPlayerIdRef.current) {
              const { data: me } = await db.from('domino_players').select('seat').eq('id', myPlayerIdRef.current).single()
              if (me) { setMySeat(me.seat); mySeatRef.current = me.seat; finalSeat = me.seat }
            }
            sessionStorage.setItem('domino_player', JSON.stringify({
              seat: finalSeat,
              nickname: nickname.trim(),
              roomId,
              roomCode: myRoomCodeRef.current || payload.new.code,
              gameMode: payload.new.game_mode || 'chien',
              aiDifficulty: payload.new.ai_difficulty || null,
            }))
            navigate('/game')
          }
        })
      .subscribe()
  }

  async function createRoom() {
    const nick = getNickname(); if (!nick) return
    const code = generateRoomCode()
    const { data: room, error } = await db.from('domino_rooms')
      .insert({ code, status: 'waiting', current_turn: 0 }).select().single()
    if (error) { setMsg({ text: 'Error: ' + error.message, type: 'error' }); return }

    const { data: player } = await db.from('domino_players')
      .insert({ room_id: room.id, seat: 0, nickname: nick, hand: [], is_connected: true })
      .select().single()

    setMyRoomId(room.id); setMyRoomCode(code)
    setMyPlayerId(player?.id); myPlayerIdRef.current = player?.id
    setMySeat(0); mySeatRef.current = 0; setAmHost(true)
    setPlayers(player ? [player] : [])
    subscribeToRoom(room.id, 'create')
    setTab('waiting')
  }

  async function joinRoom(codeOverride) {
    const nick = getNickname(); if (!nick) return
    const code = (codeOverride || joinCode).toUpperCase()
    if (code.length !== 6) { setMsg({ text: 'Enter a 6-character room code.', type: 'error' }); return }

    const { data: room } = await db.from('domino_rooms').select('*').eq('code', code).eq('status', 'waiting').single()
    if (!room) { setMsg({ text: 'Room not found or game already started.', type: 'error' }); return }

    const { data: existing } = await db.from('domino_players').select('seat').eq('room_id', room.id)
    if ((existing || []).length >= 4) { setMsg({ text: 'Room is full!', type: 'error' }); return }

    const takenSeats = (existing || []).map(p => p.seat)
    const freeSeat = [0,1,2,3].find(s => !takenSeats.includes(s))

    const { data: player, error } = await db.from('domino_players')
      .insert({ room_id: room.id, seat: freeSeat, nickname: nick, hand: [], is_connected: true })
      .select().single()
    if (error) { setMsg({ text: 'Error: ' + error.message, type: 'error' }); return }

    setMyRoomId(room.id); setMyRoomCode(code)
    setMyPlayerId(player.id); myPlayerIdRef.current = player.id
    setMySeat(freeSeat); mySeatRef.current = freeSeat
    await loadPlayers(room.id)
    subscribeToRoom(room.id, 'join')
    setTab('waiting')
  }

  async function startGame() {
    if (!myRoomId) return
    let allPlayers = await loadPlayers(myRoomId)

    // Asosye: reassign seats for teams
    if (selectedMode === 'asosye' && selectedPartner) {
      const me      = allPlayers.find(p => p.id === myPlayerId)
      const partner = allPlayers.find(p => p.id === selectedPartner)
      const others  = allPlayers.filter(p => p.id !== myPlayerId && p.id !== selectedPartner)
      if (me && partner && others.length === 2) {
        await db.from('domino_players').update({ seat: 10 }).eq('id', me.id)
        await db.from('domino_players').update({ seat: 11 }).eq('id', partner.id)
        await db.from('domino_players').update({ seat: 12 }).eq('id', others[0].id)
        await db.from('domino_players').update({ seat: 13 }).eq('id', others[1].id)
        await db.from('domino_players').update({ seat: 0 }).eq('id', me.id)
        await db.from('domino_players').update({ seat: 2 }).eq('id', partner.id)
        await db.from('domino_players').update({ seat: 1 }).eq('id', others[0].id)
        await db.from('domino_players').update({ seat: 3 }).eq('id', others[1].id)
        setMySeat(0)
        allPlayers = await loadPlayers(myRoomId)
      }
    }

    // Solo: fill with AI
    if (selectedMode === 'solo') {
      const aiNames = resolveBotNames(botPicks)
      let botIdx = 0
      for (let seat = 0; seat < 4; seat++) {
        if (!allPlayers.find(p => p.seat === seat)) {
          await db.from('domino_players').insert({ room_id: myRoomId, seat, nickname: aiNames[botIdx++] || 'Bot', hand: [], is_connected: true, is_ai: true })
        }
      }
      allPlayers = await loadPlayers(myRoomId)
    } else if (allPlayers.length < 4) {
      alert('Need 4 players to start!'); return
    }

    const tiles = shuffle(generateDominoSet())
    const hands = [tiles.slice(0,7), tiles.slice(7,14), tiles.slice(14,21), tiles.slice(21,28)]
    for (let i = 0; i < 4; i++)
      await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myRoomId).eq('seat', i)

    await db.from('game_events').delete().eq('room_id', myRoomId)
    await db.from('board').delete().eq('room_id', myRoomId)
    await db.from('board').insert({ room_id: myRoomId, tiles: [], left_end: null, right_end: null })

    let startingSeat = 0
    for (let i = 0; i < 4; i++) if (hands[i].some(t => t[0] === 6 && t[1] === 6)) { startingSeat = i; break }

    await db.from('domino_rooms').update({
      status: 'playing',
      current_turn: startingSeat,
      game_mode: selectedMode,
      ai_difficulty: selectedMode === 'solo' ? selectedAI : null,
      scores: [0,0,0,0],
      streak: { seat: null, team: null, count: 0 },
      pending_point: false,
      round: 1,
      match_winner: null,
    }).eq('id', myRoomId)
  }

  function copyLink() {
    const url = `${location.origin}/?join=${myRoomCode}`
    navigator.clipboard.writeText(url).then(() => {
      setMsg({ text: 'Link copied!', type: 'success' })
      setTimeout(() => setMsg({ text: '', type: '' }), 2000)
    })
  }

  const canStart = selectedMode === 'solo' ? true : players.length >= 4

  return (
    <div className="lobby-page">
      <div className="lobby-bg" />
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
        {authUser ? (
          <button onClick={() => navigate('/profile')} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--gold)', borderRadius: 20, padding: '6px 14px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.1em', cursor: 'pointer' }}>
            👤 Profile
          </button>
        ) : (
          <button onClick={() => navigate('/auth')} style={{ background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 20, padding: '6px 14px', fontFamily: 'DM Mono, monospace', fontSize: '0.6rem', letterSpacing: '0.1em', cursor: 'pointer' }}>
            Sign In
          </button>
        )}
      </div>
      <div className="wrapper">
        {/* Logo */}
        <div className="title-block">
          <img src="/dekabess_logo.webp" alt="Dekabess!" className="logo-img" />
          <p className="subtitle">Block · 4 Players · Online</p>
        </div>

        {/* Nickname */}
        <div className="input-group" style={{ marginBottom: '1.5rem' }}>
          <label>Your Nickname</label>
          <input
            type="text"
            value={nickname}
            readOnly={!!authProfile}
            style={authProfile ? { opacity: 0.7, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
            onChange={e => { if (!authProfile) setNickname(e.target.value) }}
            placeholder="Enter your name…"
            maxLength={16}
          />
        </div>

        {msg.text && <div className={`msg msg-${msg.type}`}>{msg.text}</div>}

        {/* Tabs */}
        {tab !== 'waiting' && (
          <div className="tabs">
            {['create','join','match'].map(t => (
              <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'create' ? 'Create Room' : t === 'join' ? 'Join by Code' : 'Matchmaking'}
              </button>
            ))}
          </div>
        )}

        {/* Create */}
        {tab === 'create' && (
          <div className="panel">
            <button className="btn btn-primary" onClick={createRoom}>Create New Room</button>
          </div>
        )}

        {/* Join */}
        {tab === 'join' && (
          <div className="panel">
            <div className="input-group">
              <label>Room Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter 6-character code…"
                maxLength={6}
                onKeyDown={e => e.key === 'Enter' && joinRoom()}
              />
            </div>
            <button className="btn btn-primary" onClick={() => joinRoom()}>Join Room</button>
          </div>
        )}

        {/* Matchmaking */}
        {tab === 'match' && (
          <div className="panel">
            <div className="queue-status">
              <div className="queue-label">Players in Queue</div>
              <span className="queue-count">{queueCount} / 4</span>
              <div className="queue-sub">
                {inQueue ? '🟢 You are in queue — waiting for players…' : 'Need 4 to auto-start'}
              </div>
            </div>
            {!inQueue ? (
              <button className="btn btn-primary" onClick={joinQueue}>Join Queue</button>
            ) : (
              <button className="btn" onClick={leaveQueue} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>Leave Queue</button>
            )}
          </div>
        )}

        {/* Waiting room */}
        {tab === 'waiting' && (
          <div className="waiting-room">
            {myRoomCode && (
              <div className="room-code-display">
                <div className="room-code-label">Room Code</div>
                <div className="room-code-value">{myRoomCode}</div>
                <button className="copy-btn" onClick={copyLink}>Copy Invite Link</button>
              </div>
            )}

            {/* Players list */}
            <div className="players-list">
              {players.map(p => (
                <div key={p.seat} className={`player-row ${p.id === myPlayerId ? 'is-me' : ''}`}>
                  <span className="player-row-name">{p.nickname}</span>
                  {p.id === myPlayerId && <span className="player-row-you">(you)</span>}
                  {amHost && selectedMode === 'asosye' && p.id !== myPlayerId && (
                    <button
                      className={`partner-btn ${selectedPartner === p.id ? 'is-partner' : ''}`}
                      onClick={() => setPartner(selectedPartner === p.id ? null : p.id)}
                    >
                      {selectedPartner === p.id ? '🤝 Partner' : 'Pick Partner'}
                    </button>
                  )}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                <div key={i} className="player-row empty">
                  <span className="player-row-name">Waiting…</span>
                </div>
              ))}
            </div>

            {/* Mode selector (host only) */}
            {amHost && (
              <div className="mode-selector">
                <div className="mode-label">Game Mode</div>
                <div className="mode-options">
                  {[
                    { id: 'chien', icon: '🐶', name: 'Chien Manjé Chien', desc: 'Every man for himself · 4 players' },
                    { id: 'asosye', icon: '🤝', name: 'Asosyé', desc: 'Partners · Teams of 2' },
                    { id: 'solo', icon: '🤖', name: 'Solo vs AI', desc: 'You vs 3 AI opponents' },
                  ].map(m => (
                    <button
                      key={m.id}
                      className={`mode-btn ${selectedMode === m.id ? 'selected' : ''}`}
                      onClick={() => setMode(m.id)}
                    >
                      <span className="mode-icon">{m.icon}</span>
                      <div>
                        <div className="mode-name">{m.name}</div>
                        <div className="mode-desc">{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {selectedMode === 'solo' && (
                  <div className="bot-picker">
                    <div className="mode-label bot-picker-label">Opponents</div>
                    {botPicks.map((pick, i) => (
                      <div key={i} className="bot-row">
                        <span className="bot-seat">Bot {i + 1}</span>
                        <select
                          className="bot-select"
                          value={pick}
                          onChange={e => {
                            const v = e.target.value
                            setBotPicks(prev => prev.map((p, j) => (j === i ? v : p)))
                          }}
                        >
                          {BOT_ROSTER.map(b => (
                            <option key={b.name} value={b.name}>{b.name} — {b.role}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!canStart}
                  onClick={startGame}
                  style={{ marginTop: '1rem' }}
                >
                  {canStart ? 'Start Game!' : `Start Game (${players.length}/4 Players)`}
                </button>
              </div>
            )}

            {!amHost && (
              <div className="waiting-status">
                <span className="pulse" />
                Waiting for host to start…
              </div>
            )}
          </div>
        )}
      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/wa-tab-la')} style={{ background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)', borderRadius: 4, padding: '0.5rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>👑 Wa Tab La</button>
          <button onClick={() => navigate('/tracker')} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--ivory-dim)', borderRadius: 4, padding: '0.5rem 1.25rem', fontFamily: 'DM Mono, monospace', fontSize: '0.62rem', letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>📊 Dekabess Tracker</button>
        </div>
      </div>

      {showIosHint && (
        <div style={{
          marginTop: '1.5rem',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '0.875rem 1rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: '0.62rem',
          color: 'var(--ivory-dim)',
          lineHeight: 1.6,
        }}>
          <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>📲</span>
          <div>
            <div style={{ color: 'var(--ivory)', marginBottom: 3, letterSpacing: '0.05em' }}>Install as an app</div>
            Tap <strong style={{ color: 'var(--ivory)' }}>Share</strong> <span style={{ fontSize: '0.9em' }}>⬆️</span> then <strong style={{ color: 'var(--ivory)' }}>Add to Home Screen</strong> to play Dekabess like a native app — no App Store needed.
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
