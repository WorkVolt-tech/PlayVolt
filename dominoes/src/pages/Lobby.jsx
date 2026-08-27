import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { generateRoomCode, generateDominoSet, shuffle } from '../hooks/useGameState'
import './Lobby.css'

export default function Lobby() {
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(() => localStorage.getItem('domino_nickname') || '')
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
  const [selectedPartner, setPartner] = useState(null)
  const [amHost, setAmHost]         = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const [inQueue, setInQueue]       = useState(false)
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

  async function loadQueueCount() {
    const { data } = await db.from('queue').select('id').eq('status', 'waiting')
    setQueueCount(data?.length ?? 0)
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
      const aiNames = ['Bot Djo', 'Bot Marie', 'Bot Bobo']
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
            onChange={e => setNickname(e.target.value)}
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
              <div className="queue-sub">Need 4 to auto-start</div>
            </div>
            <button className="btn btn-primary" onClick={loadQueueCount}>Refresh</button>
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
      </div>
    </div>
  )
}
