import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { TABLE_SKINS } from '../lib/skins'
import { BotAvatar } from '../lib/avatars'
import { challengeFor, challengeEnds } from '../lib/challenge'
import { CHAPTERS } from '../story/chapters'
import './Challenge.css'
import { InfoButton } from '../components/GameGuide'

// ── Challenge Mode ───────────────────────────────────────────────────────────
// A new challenge every 3 days against expert bots, three tries. Beat it —
// take the match to a Vyèj — and that challenge's table is yours.

export default function Challenge() {
  const navigate = useNavigate()
  const { user, isLoading } = useAuth()
  const [status, setStatus] = useState(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)          // Start pressed, waiting for the server
  const [loadProblem, setLoadProblem] = useState('')
  const [storyProgress, setStoryProgress] = useState(null)
  const [storyProblem, setStoryProblem] = useState('')
  const c = challengeFor()
  const ends = challengeEnds()
  const next = challengeFor(ends)
  // "2 days 5 h", "7 h", "40 min" until the next challenge starts
  const untilNext = (() => {
    const ms = Math.max(0, ends - Date.now()), h = Math.floor(ms / 3600000), d = Math.floor(h / 24)
    return d ? `${d} day${d > 1 ? 's' : ''} ${h % 24} h` : h ? `${h} h` : `${Math.max(1, Math.floor(ms / 60000))} min`
  })()
  const prize = TABLE_SKINS[c.table]

  // a match already under way in this challenge can be continued without a new try
  const saved = (() => { try { return JSON.parse(localStorage.getItem('challenge_game') || 'null') } catch { return null } })()
  const inProgress = saved?.challenge?.week === c.week && saved?.st?.status

  useEffect(() => {
    if (!user) return
    db.rpc('challenge_status').then(({ data, error }) => {
      if (error) { setLoadProblem(`Couldn’t load your tries — ${error.message || 'server error'}`); return }
      setStatus(Array.isArray(data) ? data[0] : data)
    }, e => setLoadProblem(`Couldn’t reach the server — ${e?.message || 'check your connection'}`))

    db.rpc('ensure_story_progress').then(({ data, error }) => {
      if (error) { setStoryProblem(error.message || 'Couldn’t load Story progress'); return }
      setStoryProgress(Array.isArray(data) ? data[0] : data)
    }, e => setStoryProblem(e?.message || 'Couldn’t load Story progress'))
  }, [user])

  // Team challenges: the server creates the room (line-up fixed), then you wait
  // for your partner there
  async function createTeam() {
    if (busy) return
    setMsg(''); setBusy(true)
    const { data, error } = await db.rpc('challenge_team_create')
    setBusy(false)
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row?.code) { setMsg(error ? `Couldn’t create the room — ${error.message}` : row?.problem || 'Couldn’t create the room.'); return }
    navigate(`/?join=${row.code}&auto=1`)
  }

  // Start: open the game; the game itself spends the try as it opens (so a
  // game that fails to open never costs one)
  function start() {
    if (busy || left <= 0) return
    localStorage.removeItem('challenge_game')
    sessionStorage.setItem('challenge_setup', JSON.stringify({
      seats: c.seats, pile: c.pile, bots: c.opponents,
      nickname: localStorage.getItem('domino_nickname') || 'You',
      challenge: { week: c.week, table: c.table },
      payTry: true,
    }))
    navigate('/challenge/play')
  }

  if (!isLoading && !user) {
    return (
      <div className="ch-page ui-page">
        <button className="ch-back ui-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="ch-title ui-title">Challenge <InfoButton section="challenge" label="How the Challenge works" style={{ marginLeft: 10, verticalAlign: 'middle' }} /></h1>
        <div className="ch-card ui-card"><p>Challenge Mode needs an account, so your tries and prizes are kept.</p>
          <button className="ch-btn ui-primary" onClick={() => navigate('/auth')}>Sign in</button></div>
      </div>
    )
  }

  const completedStory = storyProgress?.completed_chapters || []
  const storyComplete = CHAPTERS.every(ch => completedStory.includes(ch.id))

  if (user && !storyProgress && !storyProblem) {
    return (
      <div className="ch-page ui-page">
        <button className="ch-back ui-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="ch-title ui-title">Challenge</h1>
        <div className="ch-card ui-card"><p>Checking your Story Mode progress…</p></div>
      </div>
    )
  }

  if (user && !storyComplete) {
    return (
      <div className="ch-page ui-page">
        <button className="ch-back ui-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="ch-title ui-title">Challenge 🔒</h1>
        <p className="ch-sub">Challenge Mode unlocks after you complete Story Mode.</p>
        <div className="ch-card ch-main ui-card">
          <div className="ch-label">Story progress</div>
          <div className="ch-format">{completedStory.length}/{CHAPTERS.length} chapters complete</div>
          {storyProblem
            ? <div className="ch-msg">Couldn’t verify Story progress — {storyProblem}</div>
            : <p>Finish every Story chapter, including the Championship, to unlock Challenge Mode and face the rotating expert challenges.</p>}
          <button className="ch-btn ui-primary" onClick={() => navigate('/story')}>Go to Story Mode</button>
        </div>
      </div>
    )
  }

  const left = status?.tries_left ?? 3
  const won = !!status?.won
  return (
    <div className="ch-page ui-page">
      <button className="ch-back ui-back" onClick={() => navigate('/')}>← Back</button>
      <h1 className="ch-title ui-title">Challenge <InfoButton section="challenge" label="How the Challenge works" style={{ marginLeft: 10, verticalAlign: 'middle' }} /></h1>
      <p className="ch-sub">A new challenge every 3 days against expert players. Three tries — beat it and the table is yours.</p>

      <div className="ch-card ch-main ui-card">
        <div className="ch-label">This challenge · ends in {untilNext}</div>
        <div className="ch-format">{c.title}</div>
        <div className="ch-opponents">
          {c.opponents.map(n => (
            <div key={n} className="ch-opp"><BotAvatar name={n} size={52} /><span>{n}</span></div>
          ))}
        </div>
        {c.blurb && <p className="ch-blurb">{c.blurb}</p>}
        <p className="ch-rule">Win the match — take it to a Vyèj — to beat the challenge.</p>

        <div className="ch-prize">
          <img src={prize?.thumb} alt="" />
          <div><div className="ch-label">Prize</div><div className="ch-prize-name">{prize?.label} table</div></div>
        </div>

        <div className="ch-tries">
          <span className="ch-label">Tries</span>
          {[0, 1, 2].map(i => <span key={i} className={`ch-pip ${i < (won ? 3 : 3 - left) ? 'used' : ''}`} />)}
          <span className="ch-left">{won ? 'Beaten ✓' : `${left} left`}</span>
        </div>

        {loadProblem && <div className="ch-msg">{loadProblem}</div>}
        {msg && <div className="ch-msg">{msg}</div>}
        {c.format === 'team' ? (
          won ? <div className="ch-msg ok">You beat this challenge. The next one starts in {untilNext}.</div>
          : left <= 0 ? <div className="ch-msg soft">No tries left for this challenge — but you can still help a friend: open their invite link.</div>
          : <>
              <button className="ch-btn ui-primary" disabled={busy} onClick={createTeam}>{busy ? 'Creating…' : 'Create your team room'}</button>
              <div className="ch-msg soft">Invite your partner with the room’s link — anyone can join. Each player with a try left spends one when the game starts.</div>
            </>
        ) : won ? (
          <div className="ch-msg ok">You beat this challenge. The next one starts in {untilNext}.</div>
        ) : inProgress ? (
          <button className="ch-btn ui-primary" onClick={() => navigate('/challenge/play')}>Continue your match</button>
        ) : (
          <button className="ch-btn ui-primary" disabled={left <= 0 || busy} onClick={start}>
            {busy ? 'Starting…' : left > 0 ? 'Start — uses 1 try' : 'No tries left for this challenge'}
          </button>
        )}
      </div>

      <div className="ch-card ch-next ui-card">
        <div className="ch-label">Next challenge · in {untilNext}</div>
        <div className="ch-next-row">
          <span>{next.title}</span>
          <img src={TABLE_SKINS[next.table]?.thumb} alt="" />
        </div>
      </div>
    </div>
  )
}