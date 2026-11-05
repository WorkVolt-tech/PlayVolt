import React, { useState } from 'react';

// Sign in or create a PlayVolt account (the same account works in Dekabess).
export function AccountScreen({ account, onDone, onBack }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    const nick = nickname.trim();
    if (mode === 'signup' && (nick.length < 2 || nick.length > 16)) return setError('Nickname must be 2–16 characters.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await account.signUp(email.trim(), password, nick);
        if (needsConfirmation) setSentTo(email.trim());
        else onDone('Account created! Welcome, ' + nick + '.');
      } else {
        await account.signIn(email.trim(), password);
        onDone('Signed in.');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) return <section className="screen entry-screen">
    <button className="back-button" onClick={onBack}>← Back</button>
    <div className="surface account-sent">
      <span className="account-icon" aria-hidden="true">✉️</span>
      <h2>Check your email</h2>
      <p>We sent a confirmation link to <strong>{sentTo}</strong>. Open it to activate your account, then sign in here.</p>
      <button className="outline-btn full" onClick={() => { setSentTo(''); setMode('login'); }}>Back to sign in</button>
    </div>
  </section>;

  return <section className="screen entry-screen">
    <button className="back-button" onClick={onBack}>← Back</button>
    <h1 className="page-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
    <p className="account-note">One PlayVolt account for Pin &amp; Spin and Dekabess. You can always play as a guest.</p>
    <div className="view-tabs" role="tablist" aria-label="Account">
      <button type="button" role="tab" aria-selected={mode === 'login'} className={'view-tab' + (mode === 'login' ? ' active' : '')}
        onClick={() => { setMode('login'); setError(''); }}>SIGN IN</button>
      <button type="button" role="tab" aria-selected={mode === 'signup'} className={'view-tab' + (mode === 'signup' ? ' active' : '')}
        onClick={() => { setMode('signup'); setError(''); }}>CREATE ACCOUNT</button>
    </div>
    <form className="room-form" onSubmit={submit}>
      {mode === 'signup' && <>
        <label className="field-label" htmlFor="accountNickname">NICKNAME</label>
        <input id="accountNickname" type="text" autoComplete="nickname" maxLength={16} required
          placeholder="Shown to other players" value={nickname} onChange={(e) => setNickname(e.target.value)} />
      </>}
      <label className="field-label" htmlFor="accountEmail">EMAIL</label>
      <input id="accountEmail" type="email" autoComplete="email" required placeholder="you@example.com"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="field-label" htmlFor="accountPassword">PASSWORD</label>
      <input id="accountPassword" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        minLength={6} required placeholder="At least 6 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="primary-btn" disabled={busy}>
        {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<span>→</span>
      </button>
    </form>
  </section>;
}
