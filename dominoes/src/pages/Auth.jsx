import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/supabase'
import './Auth.css'

export default function Auth() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    setError('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        if (!nickname.trim()) { setError('Nickname is required'); setLoading(false); return }
        if (nickname.length < 2 || nickname.length > 16) { setError('Nickname must be 2–16 characters'); setLoading(false); return }
        const { data, error: e } = await db.auth.signUp({
          email, password,
          options: { data: { nickname: nickname.trim() } }
        })
        if (e) throw e
        // If session exists, confirmation is off — go straight to lobby
        if (data?.session) { navigate('/'); return }
        // Otherwise show check email screen
        setDone(true)
      } else {
        const { error: e } = await db.auth.signInWithPassword({ email, password })
        if (e) throw e
        navigate('/')
      }
    } catch (e) {
      setError(e.message || 'Something went wrong')
    }
    setLoading(false)
  }

  if (done) return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">✉️</div>
        <h2 className="auth-title">Check your email</h2>
        <p className="auth-sub">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
        <button className="auth-btn-ghost" onClick={() => navigate('/')}>Continue as guest →</button>
      </div>
    </div>
  )

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">Dekabess!</div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError('') }}>Sign In</button>
          <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setError('') }}>Create Account</button>
        </div>

        {mode === 'signup' && (
          <div className="auth-field">
            <label className="auth-label">Nickname</label>
            <input
              className="auth-input"
              type="text"
              placeholder="How others see you"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength={16}
            />
          </div>
        )}

        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input
            className="auth-input"
            type="password"
            placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && <div className="auth-error">{error}</div>}

        <button className="auth-btn-primary" onClick={handleSubmit} disabled={loading}>
          {loading ? 'Loading…' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <button className="auth-btn-ghost" onClick={() => navigate('/')}>
          Continue as guest →
        </button>
      </div>
    </div>
  )
}
