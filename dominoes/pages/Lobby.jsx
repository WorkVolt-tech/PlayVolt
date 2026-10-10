import { useState, useEffect, useRef } from 'react'
import TrophyNotice from '../components/TrophyNotice'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { generateRoomCode, generateDominoSet, shuffle, dealHands, dealTable } from '../hooks/useGameState'
import './Lobby.css'
import { SeatAvatar, hasSeatAvatar } from '../lib/avatars'
import { statusOf } from './Friends'
import { VERSION, VERSION_NOTE } from '../version'

// ── Solo opponents ───────────────────────────────────────────────────────────
// A bot's personality comes from its name (see getPersonality in botAI.js).
// The all-seeing bots (Ti-Jòj, Ti-Tid, Ti-Roro, Ti-Chasè, Ti-Frè, Ti-Chaj,
// Ti-Pyèj, Ti-Wa) are ONLY
// ever seated when picked here — they are
// deliberately absent from the random replacement-bot name lists, so an
// all-seeing bot can never silently take a disconnected player's seat in PvP.
import { CHAPTERS } from '../story/chapters'

// Experts are earned in Story Mode: beat a bot's chapter and they're yours.
// Ordinary bots are always available.
const UNLOCKED_BY = Object.fromEntries(
  CHAPTERS.filter(c => c.unlocks).map(c => [c.unlocks, c.id]))
const isExpert = b => b.role === 'Expert'

const BOT_ROSTER = [
  // Ordinary bots first — always available.
  // Roughly easiest to hardest.
  { name: 'Ti-Bebe',   role: 'Beginner' },
  { name: 'Ti-Pridan', role: 'Pip Counter' },
  { name: 'Ti-Sak',    role: 'Hoarder' },
  { name: 'Ti-Cam',    role: 'Gambler' },
  { name: 'Ti-Mèt',    role: 'Suit Master' },
  { name: 'Ti-Jean',   role: 'Blocker' },
  { name: 'Ti-Djo',    role: 'Strategist' },
  { name: 'Ti-Doub',   role: 'Doubles First' },
  // Experts last — earned in Story Mode.
  { name: 'Ti-Jòj',    role: 'Expert' },
  { name: 'Ti-Tid',    role: 'Expert' },
  { name: 'Ti-Roro',   role: 'Expert' },
  { name: 'Ti-Chasè',  role: 'Expert' },
  { name: 'Ti-Frè',    role: 'Expert' },
  { name: 'Ti-Chaj',   role: 'Expert' },
  { name: 'Ti-Pyèj',   role: 'Expert' },
  { name: 'Ti-Wa',     role: 'Expert' },
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

// How many HUMAN players a mode allows at the table.
// The host's choice is written to the room as soon as it's picked, so a
// player joining by code can be turned away before taking a seat.
function humanCapacity(mode) {
  if (mode === 'solo') return 1   // you vs 3 AI
  if (mode === 'duo')  return 1   // you + an AI partner vs 2 AI (offline)
  return 4
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
  const [myUserId, setMyUserId] = useState(null)   // links a seat to an account
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState({ text: '', type: '' })

  // Create room state
  const [myRoomId, setMyRoomId]     = useState(null)
  const [myRoomCode, setMyRoomCode] = useState(null)
  const [copied, setCopied] = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(null)
  const [mySeat, setMySeat]         = useState(null)
  const myPlayerIdRef = useRef(null)
  const mySeatRef     = useRef(null)
  const myRoomCodeRef = useRef(null)
  const [players, setPlayers]       = useState([])
  const [selectedMode, setMode]     = useState('chien')
  // The mode stored ON THE ROOM — drives how many seats the table shows, for
  // the host and for anyone who joined by code alike.
  const [roomMode, setRoomMode]     = useState('chien')
  const [selectedAI, setAI]         = useState('beginner')
  // Solo: which bot sits in each of the 3 AI seats (defaults = the original trio)
  const [botPicks, setBotPicks]     = useState(['Ti-Djo', 'Ti-Cam', 'Ti-Jean'])
  const [unlockedBots, setUnlockedBots] = useState([])
  const [selectedPartner, setPartner] = useState(null)
  const [amHost, setAmHost]         = useState(false)
  const [queueCount, setQueueCount] = useState(0)
  const channelRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('domino_nickname', nickname)
  }, [nickname])

  // Keep refs in sync so closures always see current values
  useEffect(() => { myPlayerIdRef.current = myPlayerId }, [myPlayerId])

  // After a refresh: back into the waiting room you were in, if it's still
  // there — or straight into the game, if it started meanwhile.
  useEffect(() => {
    const w = readWaiting()
    if (!w?.roomId) return
    ;(async () => {
      const { data: room } = await db.from('domino_rooms').select('*').eq('id', w.roomId).maybeSingle()
      const { data: seat } = w.playerId
        ? await db.from('domino_players').select('id, seat, nickname').eq('id', w.playerId).maybeSingle()
        : { data: null }
      if (!room || !seat) { try { sessionStorage.removeItem('domino_waiting') } catch { /* ignore */ } return }
      if (room.status === 'waiting') {
        enterWaiting({ room, code: room.code, playerId: seat.id, seat: seat.seat, host: !!w.host })
      } else if (room.status === 'playing' || room.status === 'round_end') {
        sessionStorage.setItem('domino_player', JSON.stringify({
          seat: seat.seat, nickname: seat.nickname, roomId: room.id, roomCode: room.code, gameMode: room.game_mode || 'chien',
        }))
        navigate('/game')
      } else {
        try { sessionStorage.removeItem('domino_waiting') } catch { /* ignore */ }
      }
    })()
  }, [])
  useEffect(() => { mySeatRef.current = mySeat }, [mySeat])
  useEffect(() => { myRoomCodeRef.current = myRoomCode }, [myRoomCode])

  useEffect(() => {
    db.auth.getUser().then(({ data }) => setMyUserId(data?.user?.id ?? null))
  }, [])

  // Story progress decides which experts can be picked. Guests have none.
  useEffect(() => {
    if (!myUserId) { setUnlockedBots([]); return }
    let off = false
    db.rpc('ensure_story_progress').then(({ data }) => {
      if (off) return
      const row = Array.isArray(data) ? data[0] : data
      setUnlockedBots(row?.unlocked_bots || [])
    })
    return () => { off = true }
  }, [myUserId])

  const canPickBot = name => {
    const b = BOT_ROSTER.find(x => x.name === name)
    return !b || !isExpert(b) || unlockedBots.includes(name)
  }

  // If a pick is no longer allowed (e.g. signed out), fall back to a regular.
  useEffect(() => {
    const fallback = ['Ti-Djo', 'Ti-Cam', 'Ti-Jean']
    setBotPicks(prev => {
      const next = prev.map((p, i) => (canPickBot(p) ? p : fallback[i] || 'Ti-Djo'))
      return next.some((p, i) => p !== prev[i]) ? next : prev
    })
  }, [unlockedBots])

  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const code = q.get('join')
    if (code) {
      setTab('join'); setJoinCode(code.toUpperCase())
      // accepting a friend's challenge joins their room straight away
      if (q.get('auto')) setTimeout(() => joinRoom(code.toUpperCase()), 0)
    }
    // challenging a friend from the Friends page: open a room, then invite them
    const friend = q.get('challenge')
    if (friend) {
      const mode = q.get('mode') === 'asosye' ? 'asosye' : 'chien'
      setTimeout(async () => {
        const made = await createRoom(mode)
        if (made?.room) {
          await db.rpc('challenge_friend', { p_friend: friend, p_room: made.room.id, p_code: made.code, p_mode: mode })
          setMsg({ text: 'Challenge sent — they’ll get a banner to join you.', type: 'success' })
        }
      }, 0)
    }
    if (code || friend) window.history.replaceState(null, '', '/')
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
      .insert({ nickname: nick, status: 'waiting', user_id: myUserId })
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
                user_id: first4[i].user_id ?? null,
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
    // in a waiting room: am I still here, and have I become the host?
    const me = myPlayerIdRef.current
    if (me && roomId === readWaiting()?.roomId) {
      const mine = (data || []).find(r => r.id === me)
      if (!mine) {
        resetToLobby('You’re no longer in that room.')
      } else if (mine.seat === 0 && !readWaiting()?.host) {
        // the host left and handed the room to me
        try { sessionStorage.setItem('domino_waiting', JSON.stringify({ ...readWaiting(), seat: 0, host: true })) } catch { /* ignore */ }
        setMySeat(0); mySeatRef.current = 0
        setAmHost(true)
        setMsg({ text: 'The host left — you’re the host now.', type: 'success' })
      }
    }
    return data || []
  }

  // Back to the lobby, cleanly: stop listening to the room and forget it.
  function resetToLobby(message) {
    if (channelRef.current) { db.removeChannel(channelRef.current); channelRef.current = null }
    try { sessionStorage.removeItem('domino_waiting') } catch { /* ignore */ }
    setMyRoomId(null); setMyRoomCode(''); setMyPlayerId(null); myPlayerIdRef.current = null
    setAmHost(false); setPlayers([]); setTab('create')
    if (message) setMsg({ text: message, type: 'error' })
  }

  function subscribeToRoom(roomId, panel) {
    if (channelRef.current) db.removeChannel(channelRef.current)
    channelRef.current = db.channel('lobby-' + roomId + '-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'domino_players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers(roomId))
      // the room was closed: nobody is left sitting in it
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'domino_rooms', filter: `id=eq.${roomId}` },
        () => resetToLobby('The room was closed.'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'domino_rooms', filter: `id=eq.${roomId}` },
        async (payload) => {
          if (payload.new.game_mode) setRoomMode(payload.new.game_mode)
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

  // Store the host's mode on the room so joiners can see the table's capacity.
  // At start-up, 'duo' is rewritten to 'asosye' (see startGame).
  async function publishMode(mode) {
    setRoomMode(mode)
    if (!myRoomId) return
    await db.from('domino_rooms').update({ game_mode: mode }).eq('id', myRoomId)
  }

  async function createRoom(modeArg) {
    // only a real mode name counts (a click event must never become the mode)
    const fromChallenge = typeof modeArg === 'string' && ['chien', 'asosye', 'solo', 'duo'].includes(modeArg)
    const mode = fromChallenge ? modeArg : selectedMode
    const nick = getNickname(); if (!nick) return
    const code = generateRoomCode()
    const { data: room, error } = await db.from('domino_rooms')
      .insert({ code, status: 'waiting', current_turn: 0, game_mode: mode }).select().single()
    if (error) { setMsg({ text: 'Error: ' + error.message, type: 'error' }); return }

    const { data: player } = await db.from('domino_players')
      .insert({ room_id: room.id, seat: 0, nickname: nick, hand: [], is_connected: true, user_id: myUserId })
      .select().single()

    if (player) setPlayers([player])
    if (fromChallenge) setMode(modeArg)
    enterWaiting({ room: { ...room, game_mode: mode }, code, playerId: player?.id, seat: 0, host: true })
    return { room, code }
  }

  async function joinRoom(codeOverride) {
    const nick = getNickname(); if (!nick) return
    const code = (codeOverride || joinCode).toUpperCase()
    if (code.length !== 6) { setMsg({ text: 'Enter a 6-character room code.', type: 'error' }); return }

    // A game already in progress: if you had a seat at it, take it back.
    // (Phone died, lost signal, closed the app — a bot has been holding your
    // seat, and the same code gets you straight back in.)
    const { data: live } = await db.from('domino_rooms').select('*')
      .eq('code', code).in('status', ['playing', 'round_end']).maybeSingle()
    if (live) {
      const { data: seats } = await db.from('domino_players')
        .select('seat, nickname, user_id').eq('room_id', live.id)
      // signed in: match your account; guest: match your nickname
      const mine = (seats || []).find(r => myUserId ? r.user_id === myUserId : (!r.user_id && r.nickname === nick))
      if (!mine) {
        setMsg({ text: 'That game has already started, and you weren’t at the table.', type: 'error' })
        return
      }
      sessionStorage.setItem('domino_player', JSON.stringify({
        seat: mine.seat,
        nickname: mine.nickname,
        roomId: live.id,
        roomCode: live.code,
        gameMode: live.game_mode || 'chien',
        ...(live.tournament_match_id ? { tournamentMatchId: live.tournament_match_id, fromTournament: true } : {}),
      }))
      navigate('/game')     // the game takes the seat back from the bot on arrival
      return
    }

    const { data: room } = await db.from('domino_rooms').select('*').eq('code', code).eq('status', 'waiting').single()
    if (!room) { setMsg({ text: 'Room not found.', type: 'error' }); return }

    // Already sitting at this table (you refreshed, or joined twice)? Take
    // that seat back instead of adding a second one. Matched by account, or
    // for guests by the seat this browser tab took.
    const remembered = readWaiting()
    const { data: seatsHere } = await db.from('domino_players').select('id, seat, user_id').eq('room_id', room.id)
    const mineAlready = (seatsHere || []).find(r =>
      (myUserId && r.user_id === myUserId) || (remembered && remembered.roomId === room.id && r.id === remembered.playerId))
    if (mineAlready) {
      enterWaiting({ room, code, playerId: mineAlready.id, seat: mineAlready.seat, host: false })
      return
    }

    const { data: existing } = await db.from('domino_players').select('seat').eq('room_id', room.id)
    const capacity = humanCapacity(room.game_mode)
    if ((existing || []).length >= capacity) {
      setMsg({
        text: capacity === 2 ? 'This table is full — Asosyé vs AI is 2 players only.'
            : capacity === 1 ? 'This table is a solo game vs AI.'
            : 'Room is full!',
        type: 'error',
      }); return
    }

    const takenSeats = (existing || []).map(p => p.seat)
    const freeSeat = [0,1,2,3].find(s => !takenSeats.includes(s))

    const { data: player, error } = await db.from('domino_players')
      .insert({ room_id: room.id, seat: freeSeat, nickname: nick, hand: [], is_connected: true, user_id: myUserId })
      .select().single()
    if (error) { setMsg({ text: 'Error: ' + error.message, type: 'error' }); return }

    // Two people can pass the check above at the same instant. Re-count after
    // taking the seat; whoever overflowed the table steps back out.
    const { data: after } = await db.from('domino_players').select('seat').eq('room_id', room.id)
    const seatsNow = (after || []).map(p => p.seat).sort((x, y) => x - y)
    if (seatsNow.length > capacity && seatsNow.indexOf(freeSeat) >= capacity) {
      await db.from('domino_players').delete().eq('id', player.id)
      setMsg({
        text: capacity === 2 ? 'This table is full — Asosyé vs AI is 2 players only.' : 'Room is full!',
        type: 'error',
      }); return
    }

    enterWaiting({ room, code, playerId: player.id, seat: freeSeat, host: false })
  }

  // ── The waiting room survives a refresh ───────────────────────────────────
  // The room you're waiting in is remembered for this browser tab, so a
  // refresh puts you straight back in your seat. Forgotten when you leave
  // the room or the game starts.
  const WAITING_KEY = 'domino_waiting'
  function readWaiting() {
    try { return JSON.parse(sessionStorage.getItem(WAITING_KEY) || 'null') } catch { return null }
  }
  function enterWaiting({ room, code, playerId, seat, host }) {
    // your trophy avatar goes on your seat as soon as you sit down, so the
    // others see it in the waiting room (the game also re-applies it)
    if (playerId) {
      db.auth.getUser().then(({ data }) => {
        const uid = data?.user?.id
        if (!uid) return
        db.from('profiles').select('avatar').eq('id', uid).maybeSingle().then(({ data: prof }) => {
          if (prof?.avatar) db.from('domino_players').update({ avatar: prof.avatar }).eq('id', playerId).then(() => {})
        })
      })
    }
    try { sessionStorage.setItem(WAITING_KEY, JSON.stringify({ roomId: room.id, code, playerId, seat, host })) } catch { /* ignore */ }
    setMyRoomId(room.id); setMyRoomCode(code)
    setRoomMode(room.game_mode || 'chien')
    setMyPlayerId(playerId); myPlayerIdRef.current = playerId
    setMySeat(seat); mySeatRef.current = seat
    setAmHost(!!host)
    loadPlayers(room.id)
    subscribeToRoom(room.id, host ? 'create' : 'join')
    setTab('waiting')
  }
  // Leaving the waiting room. The room carries on without you: if you were
  // the host, the next player becomes host (they're moved into seat 0, the
  // host's seat). Only if nobody else is left does the room close.
  async function leaveWaiting() {
    const w = readWaiting()
    if (channelRef.current) { db.removeChannel(channelRef.current); channelRef.current = null }
    if (w?.roomId && w?.playerId) {
      const { data: others } = await db.from('domino_players').select('id, seat, is_ai')
        .eq('room_id', w.roomId).neq('id', w.playerId).order('seat')
      // only a human can take over the room — bots can't run a waiting room
      const humans = (others || []).filter(o => !o.is_ai)
      await db.from('domino_players').delete().eq('id', w.playerId)
      if (!humans.length) {
        await db.from('domino_rooms').delete().eq('id', w.roomId)      // only bots left: close it
      } else if (w.host) {
        // the host's seat (0) may be needed by the new host: if a bot sits
        // there it can't, since the host's own seat was 0 and is now free
        await db.from('domino_players').update({ seat: 0 }).eq('id', humans[0].id)
      }
    }
    resetToLobby(null)
  }

  async function startGame() {
    if (!myRoomId) return

    // Solo vs AI runs on the device — no database game at all. The room the
    // lobby made while you chose a mode isn't needed, so it's removed.
    if (selectedMode === 'solo' || selectedMode === 'duo') {
      localStorage.removeItem('solo_game')        // a NEW game, not a resume
      const picks = resolveBotNames(botPicks.slice(0, 3))
      sessionStorage.setItem('solo_setup', JSON.stringify({
        // Asosyé (offline): your partner sits across from you (seat 2),
        // the two opponents at seats 1 and 3
        bots: selectedMode === 'duo' ? [picks[1], picks[0], picks[2]] : picks,
        mode: selectedMode === 'duo' ? 'asosye' : 'solo',
        nickname: nickname || 'You',
      }))
      const roomId = myRoomId
      db.from('domino_players').delete().eq('room_id', roomId)
        .then(() => db.from('domino_rooms').delete().eq('id', roomId))
      navigate('/solo')
      return
    }

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

    // Asosyé vs AI: the two humans are partners at seats 0 & 2, bots at 1 & 3.
    // Temporary seats first, so the unique (room, seat) constraint can't clash.
    if (selectedMode === 'duo') {
      const me     = allPlayers.find(p => p.id === myPlayerId)
      const friend = allPlayers.find(p => p.id !== myPlayerId)
      if (!me || !friend || allPlayers.length !== 2) {
        alert('Asosyé vs AI needs exactly 2 players.'); return
      }
      await db.from('domino_players').update({ seat: 10 }).eq('id', me.id)
      await db.from('domino_players').update({ seat: 12 }).eq('id', friend.id)
      await db.from('domino_players').update({ seat: 0 }).eq('id', me.id)
      await db.from('domino_players').update({ seat: 2 }).eq('id', friend.id)
      setMySeat(0)
      const aiNames = resolveBotNames(botPicks.slice(0, 2))
      await db.from('domino_players').insert({ room_id: myRoomId, seat: 1, nickname: aiNames[0], hand: [], is_connected: true, is_ai: true })
      await db.from('domino_players').insert({ room_id: myRoomId, seat: 3, nickname: aiNames[1], hand: [], is_connected: true, is_ai: true })
      allPlayers = await loadPlayers(myRoomId)
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
    } else if (selectedMode === 'chien' ? allPlayers.length < 2 : (selectedMode !== 'duo' && allPlayers.length < 4)) {
      alert(selectedMode === 'chien' ? 'Need at least 2 players to start!' : 'Need 4 players to start!'); return
    }

    // Chien Manjé Chien can start with 2 or 3 players. Seats are closed up to
    // 0, 1, (2) so turns run in order, and the deal fits the table:
    //   3 players: 9 tiles each, the 0-0 set aside.  2 players: 14 each.
    const seatCount = selectedMode === 'chien' ? Math.min(4, allPlayers.length) : 4
    if (seatCount < 4) {
      const ordered = [...allPlayers].sort((a, b) => a.seat - b.seat)
      for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].seat !== i) await db.from('domino_players').update({ seat: 10 + i }).eq('id', ordered[i].id)
      }
      for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].seat !== i) await db.from('domino_players').update({ seat: i }).eq('id', ordered[i].id)
      }
      allPlayers = await loadPlayers(myRoomId)
      const me = allPlayers.find(p => p.id === myPlayerIdRef.current)
      if (me) { setMySeat(me.seat); mySeatRef.current = me.seat }
    }

    const variant = seatCount < 4 ? dealVariant : 'all'
    const { hands, pile } = dealTable(seatCount, variant)
    for (let i = 0; i < hands.length; i++)
      await db.from('domino_players').update({ hand: hands[i] }).eq('room_id', myRoomId).eq('seat', i)

    await db.from('game_events').delete().eq('room_id', myRoomId)
    await db.from('board').delete().eq('room_id', myRoomId)
    await db.from('board').insert({ room_id: myRoomId, tiles: [], left_end: null, right_end: null })

    // The opener: whoever holds the 6-6. In a pile game it may be in the pile:
    // then whoever holds the highest double opens with it; with no doubles
    // dealt at all, the first seat opens with any tile.
    let startingSeat = 0, openingTile = null
    for (let d = 6; d >= 0 && !openingTile; d--) {
      const holder = hands.findIndex(h => h.some(t => t[0] === d && t[1] === d))
      if (holder >= 0) { startingSeat = holder; openingTile = [d, d] }
    }

    await db.from('domino_rooms').update({
      status: 'playing',
      current_turn: startingSeat,
      // 'duo' is an asosyé game whose second pair happens to be AI — stored as
      // asosyé so scoring, team streaks, Vyèj and stats treat it like any other.
      game_mode: selectedMode === 'duo' ? 'asosye' : selectedMode,
      ai_difficulty: (selectedMode === 'solo' || selectedMode === 'duo') ? selectedAI : null,
      scores: [0,0,0,0],
      streak: { seat: null, team: null, count: 0 },
      pending_point: false,
      round: 1,
      match_winner: null,
      seat_count: seatCount,
      deal_variant: variant,
      pile,
      opening_tile: openingTile,
    }).eq('id', myRoomId)
  }

  // Copy that falls back when the clipboard API is refused (it needs a secure
  // context and a user gesture, and some in-app browsers block it outright).
  async function copyText(text, what) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text; el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el); el.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      document.body.removeChild(el)
    }
    setCopied(what)
    setTimeout(() => setCopied(c => (c === what ? null : c)), 1800)
  }

  function copyLink() {
    const url = `${location.origin}/?join=${myRoomCode}`
    navigator.clipboard.writeText(url).then(() => {
      setMsg({ text: 'Link copied!', type: 'success' })
      setTimeout(() => setMsg({ text: '', type: '' }), 2000)
    })
  }

  // ── Chien Manjé Chien and Asosyé: the host can fill empty seats with bots ──
  // (In Asosyé a bot can be picked as your partner, like any player.)
  // Any regular bot, or an expert the host has unlocked. Bots take a seat like
  // a player (and play like the bots you already know). A table with a regular
  // bot doesn't count toward trophies; experts do.
  // friend requests waiting for you (the badge on the Friends button)
  const [friendRequests, setFriendRequests] = useState(0)
  useEffect(() => {
    db.auth.getUser().then(({ data }) => {
      if (!data?.user) return
      db.rpc('my_friends').then(({ data: rows }) => setFriendRequests((rows || []).filter(r => r.kind === 'incoming').length))
    })
  }, [])
  // ── Inviting friends from the waiting room (host) ──
  const [friendsHere, setFriendsHere] = useState([])
  const [invited, setInvited] = useState({})
  useEffect(() => {
    if (tab !== 'waiting' || !amHost) return
    let off = false
    const load = () => db.rpc('my_friends').then(({ data }) => { if (!off) setFriendsHere((data || []).filter(r => r.kind === 'friend')) })
    load()
    const t = setInterval(load, 30000)
    return () => { off = true; clearInterval(t) }
  }, [tab, amHost])
  // hear when a friend declines your challenge
  useEffect(() => {
    let ch = null
    db.auth.getUser().then(({ data }) => {
      const uid = data?.user?.id
      if (!uid) return
      ch = db.channel(`challenge-replies-${uid}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_challenges', filter: `from_user=eq.${uid}` }, async ({ new: c }) => {
          if (c?.status !== 'declined') return
          const { data: rows } = await db.rpc('my_friends')
          const who = (rows || []).find(r => r.user_id === c.to_user)?.nickname || 'Your friend'
          setMsg({ text: `${who} declined your challenge.`, type: 'error' })
        })
        .subscribe()
    })
    return () => { if (ch) db.removeChannel(ch) }
  }, [])
  async function inviteFriend(f) {
    setInvited(v => ({ ...v, [f.user_id]: '…' }))
    await db.rpc('challenge_friend', { p_friend: f.user_id, p_room: myRoomId, p_code: myRoomCode, p_mode: roomMode || selectedMode })
    setInvited(v => ({ ...v, [f.user_id]: 'Invited ✓' }))
  }

  const [botToAdd, setBotToAdd] = useState('Ti-Djo')
  // 2 or 3 players: deal every tile (9 / 14 each), or 7 each with a draw pile
  const [dealVariant, setDealVariant] = useState('all')
  // (canPickBot, above, says whether the host may pick a bot)
  async function addBotSeat() {
    if (!amHost || !myRoomId || !canPickBot(botToAdd)) return
    const current = await loadPlayers(myRoomId)
    const free = [0, 1, 2, 3].find(seat => !current.some(p => p.seat === seat))
    if (free === undefined) return
    await db.from('domino_players').insert({
      room_id: myRoomId, seat: free, nickname: botToAdd, hand: [], is_connected: true, is_ai: true,
    })
    loadPlayers(myRoomId)
  }
  async function removeBotSeat(id) {
    if (!amHost) return
    if (selectedPartner === id) setPartner(null)      // that was your partner
    await db.from('domino_players').delete().eq('id', id).eq('is_ai', true)
    loadPlayers(myRoomId)
  }

  // duo = 2 humans (partners) + 2 AI
  const canStart =
    selectedMode === 'solo' ? true :
    selectedMode === 'duo'  ? true :
    selectedMode === 'chien' ? players.length >= 2 :
    players.length >= 4

  return (
    <div className="lobby-page">
      <TrophyNotice />
      <div className="lobby-bg" />
      {/* clear of the phone's status bar (time, battery) and camera when installed as an app */}
      <div style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 'calc(12px + env(safe-area-inset-right, 0px))', zIndex: 10 }}>
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
            <button className="btn btn-primary" onClick={() => createRoom()}>Create New Room</button>
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
            <button className="copy-btn" style={{ alignSelf: 'flex-start' }} onClick={leaveWaiting}>
              ← Leave room
            </button>
            {myRoomCode && (
              <div className="room-code-display">
                <div className="room-code-label">Room Code</div>
                <div className="room-code-value" style={{ userSelect: 'all' }}>{myRoomCode}</div>
                <div className="code-actions">
                  <button className="copy-btn" onClick={() => copyText(myRoomCode, 'code')}>
                    {copied === 'code' ? 'Copied' : 'Copy code'}
                  </button>
                  <button className="copy-btn" onClick={() => copyText(`${location.origin}/?join=${myRoomCode}`, 'link')}>
                    {copied === 'link' ? 'Copied' : 'Copy invite link'}
                  </button>
                </div>
              </div>
            )}

            {/* Players list */}
            <div className="players-list">
              {players.map(p => (
                <div key={p.seat} className={`player-row ${p.id === myPlayerId ? 'is-me' : ''}`}>
                  {hasSeatAvatar(p)
                    ? <SeatAvatar player={p} size={28} />
                    : <span className="player-row-initial">{(p.nickname || '?')[0].toUpperCase()}</span>}
                  <span className="player-row-name">{p.nickname}</span>
                  {p.id === myPlayerId && <span className="player-row-you">(you)</span>}
                  {p.is_ai && <span className="player-row-you">(bot)</span>}
                  {p.is_ai && amHost && (
                    <button className="partner-btn" onClick={() => removeBotSeat(p.id)}>Remove</button>
                  )}
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
              {Array.from({ length: Math.max(0, humanCapacity(roomMode) - players.length) }).map((_, i) => (
                <div key={i} className="player-row empty">
                  <span className="player-row-name">
                    {roomMode === 'duo' ? 'Waiting for your partner…' : 'Waiting…'}
                  </span>
                  {/* the host can fill this seat with a bot (Chien Manjé Chien) */}
                  {i === 0 && amHost && (['chien', 'asosye'].includes(roomMode) || ['chien', 'asosye'].includes(selectedMode)) && (
                    <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                      <select className="bot-select" value={botToAdd} onChange={e => setBotToAdd(e.target.value)}>
                        {BOT_ROSTER.map(b => {
                          const locked = isExpert(b) && !unlockedBots.includes(b.name)
                          return <option key={b.name} value={b.name} disabled={locked}>{b.name}{isExpert(b) ? ' ★' : ''}{locked ? ' (locked)' : ''}</option>
                        })}
                      </select>
                      <button className="partner-btn" onClick={addBotSeat} disabled={!canPickBot(botToAdd)}>Add bot</button>
                    </span>
                  )}
                </div>
              ))}
              {amHost && (['chien', 'asosye'].includes(roomMode) || ['chien', 'asosye'].includes(selectedMode)) && players.some(p => p.is_ai && !['Ti-Jòj', 'Ti-Tid', 'Ti-Roro', 'Ti-Chasè', 'Ti-Frè', 'Ti-Chaj', 'Ti-Pyèj', 'Ti-Wa'].includes(p.nickname)) && (
                <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', margin: '2px 2px 0' }}>
                  A table with a regular bot doesn't count toward trophies — expert bots (★) do.
                </div>
              )}
              {amHost && friendsHere.some(f => statusOf(f).live && !statusOf(f).game) && players.length < 4 && (
                <div className="invite-friends">
                  <div className="invite-friends-label">Invite a friend</div>
                  {friendsHere.filter(f => statusOf(f).live && !statusOf(f).game).map(f => (
                    <div key={f.user_id} className="invite-friend">
                      <span>🟢 {f.nickname}</span>
                      <button className="partner-btn" disabled={!!invited[f.user_id]} onClick={() => inviteFriend(f)}>
                        {invited[f.user_id] || 'Invite'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {amHost && selectedMode === 'asosye' && players.some(p => p.is_ai) && (
                <div style={{ fontSize: '0.6rem', color: 'var(--ivory-dim)', margin: '2px 2px 0' }}>
                  Tap Pick Partner on a bot to team up with it.
                </div>
              )}
            </div>

            {/* Mode selector (host only) */}
            {amHost && (
              <div className="mode-selector">
                <div className="mode-label">Game Mode</div>
                <div className="mode-options">
                  {[
                    { id: 'chien', icon: '🐶', name: 'Chien Manjé Chien', desc: 'Every man for himself · 4 players' },
                    { id: 'asosye', icon: '🤝', name: 'Asosyé', desc: 'Partners · Teams of 2' },
                    { id: 'solo', icon: '🤖', name: 'Solo vs AI (offline)', desc: 'You vs 3 AI · plays on your device' },
                    { id: 'duo', icon: '👥', name: 'Asosyé vs AI (offline)', desc: 'You + an AI partner vs 2 AI · plays on your device' },
                  ].map(m => (
                    <button
                      key={m.id}
                      className={`mode-btn ${selectedMode === m.id ? 'selected' : ''}`}
                      onClick={() => { setMode(m.id); publishMode(m.id) }}
                    >
                      <span className="mode-icon">{m.icon}</span>
                      <div>
                        <div className="mode-name">{m.name}</div>
                        <div className="mode-desc">{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {(selectedMode === 'duo' || selectedMode === 'solo') && players.length > 1 && (
                  <div className="bot-hint">
                    This mode plays offline, just you and the AI. To play with the friends here, pick Asosyé or Chien Manjé Chien and add bots.
                  </div>
                )}
                {(selectedMode === 'solo' || selectedMode === 'duo') && (
                  <div className="bot-picker">
                    <div className="mode-label bot-picker-label">{selectedMode === 'duo' ? 'Your partner & opponents' : 'Opponents'}</div>
                    {botPicks.slice(0, 3).map((pick, i) => (
                      <div key={i} className="bot-row">
                        <span className="bot-seat">{selectedMode === 'duo' ? ['Partner', 'Opponent 1', 'Opponent 2'][i] : `Bot ${i + 1}`}</span>
                        <select
                          className="bot-select"
                          value={pick}
                          onChange={e => {
                            const v = e.target.value
                            setBotPicks(prev => prev.map((p, j) => (j === i ? v : p)))
                          }}
                        >
                          {BOT_ROSTER.map(b => {
                            const locked = isExpert(b) && !unlockedBots.includes(b.name)
                            return (
                              <option key={b.name} value={b.name} disabled={locked}>
                                {locked
                                  ? `🔒 ${b.name} — beat Story chapter ${UNLOCKED_BY[b.name] ?? '?'}`
                                  : `${b.name} — ${b.role}`}
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
                {amHost && selectedMode === 'chien' && (players.length === 2 || players.length === 3) && (
                  <div className="deal-choice">
                    <div className="deal-choice-label">With {players.length} players</div>
                    <button className={`partner-btn ${dealVariant === 'all' ? 'selected' : ''}`} onClick={() => setDealVariant('all')}>
                      {players.length === 3 ? '9 tiles each (0-0 out)' : '14 tiles each'}
                    </button>
                    <button className={`partner-btn ${dealVariant === 'pile' ? 'selected' : ''}`} onClick={() => setDealVariant('pile')}>
                      7 each + draw pile
                    </button>
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!canStart}
                  onClick={startGame}
                  style={{ marginTop: '1rem' }}
                >
                  {canStart
                    ? (selectedMode === 'chien' && players.length < 4 && dealVariant === 'pile' ? `Start with ${players.length} players — 7 each + draw pile`
                      : selectedMode === 'chien' && players.length === 3 ? 'Start with 3 players — 9 tiles each'
                      : selectedMode === 'chien' && players.length === 2 ? 'Start with 2 players — 14 tiles each'
                      : 'Start Game!')
                    : selectedMode === 'duo'
                      ? `Start Game (${players.length}/2 Players)`
                      : `Start Game (${players.length}/4 Players)`}
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
      {/* the menu, in fixed rows: play modes · the crown and trophies · your stuff · the tracker */}
      <nav className="lobby-menu">
        <div className="menu-row">
          <button className="menu-btn gold" onClick={() => navigate('/story')}>📖 Story Mode</button>
          <button className="menu-btn gold" onClick={() => navigate('/challenge')}>⚔️ Challenge</button>
          <button className="menu-btn gold" onClick={() => navigate('/tournament')}>🏆 Tournament</button>
        </div>
        <div className="menu-row">
          <button className="menu-btn gold" onClick={() => navigate('/wa-tab-la')}>👑 Wa Tab La</button>
          <button className="menu-btn gold" onClick={() => navigate('/trophies')}>🥇 Trophies</button>
        </div>
        <div className="menu-row">
          <button className="menu-btn" onClick={() => navigate('/skins')}>🎨 Skins</button>
          <button className="menu-btn" onClick={() => navigate('/friends')}>
            👥 Friends
            {friendRequests > 0 && <span className="menu-badge">{friendRequests}</span>}
          </button>
          <button className="menu-btn" onClick={() => navigate('/practice')}>🎲 Practice</button>
        </div>
        <div className="menu-row">
          <button className="menu-btn" onClick={() => navigate('/tracker')}>📊 Dekabess Tracker</button>
        </div>
      </nav>
      <div className="lobby-version" title={VERSION_NOTE}>Dekabess {VERSION}</div>

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
