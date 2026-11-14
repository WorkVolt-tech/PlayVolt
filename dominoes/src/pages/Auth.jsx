import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { requestReset, setNewPassword } from '../lib/passwordReset'
import './Auth.css'

export default function Auth() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // login | signup | forgot (ask for a reset link) | reset (choose a new password, from the emailed link)
  const [mode, setMode] = useState(params.get('reset') ? 'reset' : params.get('forgot') ? 'forgot' : 'login')
  const [password2, setPassword2] = useState('')
  const [notice, setNotice] = useState('')
  const [expired, setExpired] = useState(false)
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

  async function sendReset() {
    setError(''); setNotice(''); setLoading(true)
    const r = await requestReset(email)
    setLoading(false)
    if (r.ok) setNotice(r.message); else setError(r.message)
  }

  async function saveNewPassword() {
    setError(''); setLoading(true)
    const r = await setNewPassword(password, password2, params.get('token_hash') || '')
    setLoading(false)
    if (!r.ok) { setError(r.message); setExpired(!!r.expired); return }
    setNotice(r.message)
    setTimeout(() => navigate('/'), 1500)
  }

  if (mode === 'forgot') return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">🔑</div>
        <h2 className="auth-title">Forgot your password?</h2>
        <p className="auth-sub">Enter the email you signed up with. We’ll send you a link to choose a new password.</p>
        <div className="auth-field">
          <label className="auth-label">Email</label>
          <input className="auth-input" type="email" placeholder="your@email.com" value={email} autoComplete="email"
            onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendReset()} />
        </div>
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}
        <button className="auth-btn-primary" onClick={sendReset} disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
        <button className="auth-btn-ghost" onClick={() => { setMode('login'); setError(''); setNotice('') }}>← Back to sign in</button>
      </div>
    </div>
  )

  if (mode === 'reset') return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-icon">🔒</div>
        <h2 className="auth-title">Choose a new password</h2>
        <p className="auth-sub">At least 6 characters. You’ll use it to sign in to every PlayVolt game.</p>
        <div className="auth-field">
          <label className="auth-label">New password</label>
          <input className="auth-input" type="password" autoComplete="new-password" value={password}
            onChange={e => setPassword(e.target.value)} />
        </div>
        <div className="auth-field">
          <label className="auth-label">Type it again</label>
          <input className="auth-input" type="password" autoComplete="new-password" value={password2}
            onChange={e => setPassword2(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNewPassword()} />
        </div>
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}
        {expired
          ? <button className="auth-btn-primary" onClick={() => { setMode('forgot'); setError(''); setExpired(false) }}>Send me a new link</button>
          : <button className="auth-btn-primary" onClick={saveNewPassword} disabled={loading || !!notice}>{loading ? 'Saving…' : 'Save new password'}</button>}
      </div>
    </div>
  )

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

        {mode === 'login' && (
          <button className="auth-forgot" onClick={() => { setMode('forgot'); setError('') }}>Forgot password?</button>
        )}

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
