import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './Profile.css'
import { TROPHIES, earnedTrophies } from '../lib/trophies'
import { loadPlayerStats } from '../lib/skins'
import { Medal } from './Trophies'
import { TrophyAvatar } from '../lib/avatars'

const AVATAR_COLORS = ['#c9a84c','#4caa6e','#4c8cca','#c94c4c','#9b59b6','#e67e22','#1abc9c','#e91e63']

function ProfileTrophies({ onOpen }) {
  const [earned, setEarned] = useState(null)
  useEffect(() => { loadPlayerStats().then(s => setEarned(earnedTrophies(s))) }, [])
  const list = TROPHIES.filter(t => earned?.has(t.id))
  return (
    <div className="profile-trophies">
      <div className="profile-trophies-head">
        <span>Trophies · {earned ? list.length : '…'} / {TROPHIES.length}</span>
        <button onClick={onOpen}>See all</button>
      </div>
      {earned && (list.length
        ? <div className="profile-badges">
            {list.map(t => (
              <div key={t.id} className="profile-badge" title={`“${t.meaning}” — ${t.desc}`}>
                <Medal trophyId={t.id} earned size={26} />{t.kreyol}
              </div>
            ))}
          </div>
        : <div className="profile-badges-empty">No trophies yet — play a match to earn your first.</div>)}
    </div>
  )
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [avatarColor, setAvatarColor] = useState('#c9a84c')
  // Trophy avatars: the one you wear, and the ones you've earned
  const [avatar, setAvatar] = useState(null)
  const [earned, setEarned] = useState(new Set())
  const [picking, setPicking] = useState(false)
  useEffect(() => { loadPlayerStats().then(s => setEarned(earnedTrophies(s))) }, [])
  async function chooseAvatar(id) {
    setAvatar(id)
    setPicking(false)
    await db.from('profiles').update({ avatar: id, updated_at: new Date().toISOString() }).eq('id', user.id)
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || '')
      setAvatarColor(profile.avatar_color || '#c9a84c')
      setAvatar(profile.avatar || null)
    }
  }, [profile])

  async function save() {
    if (!nickname.trim()) { setError('Nickname required'); return }
    setSaving(true); setError('')
    const { error: e } = await db.from('profiles').update({
      nickname: nickname.trim(),
      avatar_color: avatarColor,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)
    if (e) setError(e.message)
    else setEditing(false)
    setSaving(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  if (!user) return (
    <div className="profile-page">
      <div className="profile-guest-card">
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>👤</div>
        <h2 className="profile-title">Playing as Guest</h2>
        <p className="profile-sub">Create an account to track your stats, earn trophies and join tournaments.</p>
        <button className="profile-btn-primary" onClick={() => navigate('/auth')}>Create Account</button>
        <button className="profile-btn-ghost" onClick={() => navigate('/')}>← Back</button>
      </div>
    </div>
  )

  // Games   = matches played (a match ends on a Vyèj)
  // Streak  = consecutive rounds won; resets to 0 on a round lost
  // Vyèj    = matches won — this is the real "win" in Dekabess
  const stats = [
    { label: 'Games', value: profile?.total_games ?? 0 },
    { label: 'Streak', value: profile?.round_streak ?? 0 },
    { label: 'Vyèj', value: profile?.total_vyej ?? 0 },
    { label: 'Dekabess', value: profile?.total_dekabess ?? 0 },
  ]

  // Win rate = matches won / matches played, so both sides are in the same unit.
  const winRate = profile?.total_games > 0
    ? Math.round((profile.total_vyej / profile.total_games) * 100) : 0

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="profile-title-top">Profile</h1>
        <button className="profile-btn-ghost-sm" onClick={handleSignOut}>Sign Out</button>
      </div>

      {/* Avatar */}
      <div className="profile-avatar-section">
        <button className="profile-avatar-btn" onClick={() => setPicking(v => !v)} title="Choose your avatar">
          {avatar && earned.has(avatar)
            ? <TrophyAvatar trophyId={avatar} size={88} badge={false} />
            : <div className="profile-avatar" style={{ background: avatarColor }}>{(profile?.nickname || '?')[0].toUpperCase()}</div>}
          <span className="profile-avatar-edit">{picking ? 'Close' : 'Change avatar'}</span>
        </button>
        {picking && (
          <div className="avatar-picker">
            <div className="avatar-picker-head">Your avatars — earn more with trophies</div>
            <div className="avatar-picker-grid">
              <button className={`avatar-choice ${!avatar ? 'on' : ''}`} onClick={() => chooseAvatar(null)} title="Your initial">
                <div className="profile-avatar small" style={{ background: avatarColor }}>{(profile?.nickname || '?')[0].toUpperCase()}</div>
              </button>
              {TROPHIES.map(t => {
                const got = earned.has(t.id)
                return (
                  <button key={t.id} className={`avatar-choice ${avatar === t.id ? 'on' : ''}`} disabled={!got}
                    onClick={() => chooseAvatar(t.id)} title={got ? `${t.kreyol} — “${t.meaning}”` : `Locked — ${t.kreyol}: ${t.desc}`}>
                    <TrophyAvatar trophyId={t.id} size={50} locked={!got} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {editing ? (
          <div className="profile-color-picker">
            {AVATAR_COLORS.map(c => (
              <div key={c} className={`color-swatch ${avatarColor === c ? 'selected' : ''}`}
                style={{ background: c }} onClick={() => setAvatarColor(c)} />
            ))}
          </div>
        ) : (
          <div className="profile-nickname">{profile?.nickname}</div>
        )}
        <div className="profile-email">{user.email}</div>
      </div>

      {/* Edit nickname */}
      {editing ? (
        <div className="profile-edit-card">
          <input className="profile-input" value={nickname}
            onChange={e => setNickname(e.target.value)} maxLength={16}
            placeholder="Nickname" />
          {error && <div className="profile-error">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="profile-btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="profile-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="profile-btn-outline" onClick={() => setEditing(true)}>✏️ Edit Profile</button>
      )}

      {/* Stats */}
      <div className="profile-stats-grid">
        {stats.map(s => (
          <div key={s.label} className="profile-stat">
            <div className="profile-stat-value">{s.value}</div>
            <div className="profile-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="profile-winrate">
        <div className="profile-winrate-bar">
          <div className="profile-winrate-fill" style={{ width: `${winRate}%` }} />
        </div>
        <div className="profile-winrate-label">{winRate}% win rate</div>
      </div>

      {/* Trophies: earned ones, as badges of honour */}
      <ProfileTrophies onOpen={() => navigate('/trophies')} />
    </div>
  )
}
