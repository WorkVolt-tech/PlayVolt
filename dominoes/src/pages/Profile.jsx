import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import './Profile.css'

const AVATAR_COLORS = ['#c9a84c','#4caa6e','#4c8cca','#c94c4c','#9b59b6','#e67e22','#1abc9c','#e91e63']

export default function Profile() {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState('')
  const [avatarColor, setAvatarColor] = useState('#c9a84c')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile) {
      setNickname(profile.nickname || '')
      setAvatarColor(profile.avatar_color || '#c9a84c')
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

  const stats = [
    { label: 'Games', value: profile?.total_games ?? 0 },
    { label: 'Wins', value: profile?.total_wins ?? 0 },
    { label: 'Vyèj', value: profile?.total_vyej ?? 0 },
    { label: 'Dekabess', value: profile?.total_dekabess ?? 0 },
  ]

  const winRate = profile?.total_games > 0
    ? Math.round((profile.total_wins / profile.total_games) * 100) : 0

  return (
    <div className="profile-page">
      <div className="profile-header">
        <button className="profile-back" onClick={() => navigate('/')}>← Back</button>
        <h1 className="profile-title-top">Profile</h1>
        <button className="profile-btn-ghost-sm" onClick={handleSignOut}>Sign Out</button>
      </div>

      {/* Avatar */}
      <div className="profile-avatar-section">
        <div className="profile-avatar" style={{ background: avatarColor }}>
          {(profile?.nickname || '?')[0].toUpperCase()}
        </div>
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

      {/* Trophies placeholder */}
      <div className="profile-section-title">Trophies</div>
      <div className="profile-trophies-empty">
        🏆 Trophies coming soon — keep playing!
      </div>
    </div>
  )
}
