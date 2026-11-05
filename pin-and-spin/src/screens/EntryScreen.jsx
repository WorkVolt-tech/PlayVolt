import React from 'react';
import { MODES } from '../game/constants.js';
import { Peg } from '../components/Peg.jsx';
import { play } from '../sound/sfx.js';

// Home, How to Play, Create Room and Join Room.
export function EntryScreen({ form, busy, account }) {
  const { formTab, setFormTab, nickname, setNickname, roomCodeInput, setRoomCodeInput, mode, setMode, enter } = form;
  const accountName = account.signedIn ? account.profile?.nickname || '' : '';
  return <section className="screen entry-screen">
    {formTab === 'home' ? <>
      <div className="hero approved-hero">
        <h1 className="bunny-logo"><img src="/pin-and-spin-logo.webp" alt="Pin & Spin" width="1536" height="1024" fetchPriority="high" /></h1>
        <p className="tagline">Crack the code.<br />Challenge your friends.</p>
        <span className="players-badge">2–10 players</span>
      </div>
      <div className="home-actions">
        <button className="primary-btn" onClick={() => { play('tap-ui-tick'); setFormTab('create'); }}>Create Room <span>＋</span></button>
        <button className="outline-btn full" onClick={() => { play('tap-ui-tick'); setFormTab('join'); }}>Join Room <span>↗</span></button>
        <button className="outline-btn full" onClick={() => { play('tap-ui-tick'); setFormTab('solo'); }}>Play Solo <span>🎯</span></button>
        <button className="outline-btn full" onClick={() => { play('tap-ui-tick'); setFormTab('leaderboard'); }}>Leaderboard <span>🏆</span></button>
        <button className="outline-btn full" onClick={() => { play('tap-ui-tick'); setFormTab('help'); }}>How to Play <span>?</span></button>
      </div>
      <div className="account-bar">
        {account.loading ? <span className="account-status">Checking account…</span>
          : account.signedIn
            ? <><span className="account-status">Signed in as <strong>{accountName || account.user.email}</strong></span>
                <button type="button" className="link-btn" onClick={() => void account.signOut()}>Sign out</button></>
            : <><span className="account-status">Playing as a guest</span>
                <button type="button" className="link-btn" onClick={() => setFormTab('account')}>Sign in / Create account</button></>}
      </div>
      <div className="board-legend home-legend"><span><i className="pin-dot" /> Pin: right color + spot</span>
        <span><i className="spin-dot" /> Spin: right color</span></div>
    </> : <>
      <button className="back-button" onClick={() => { play('tap-ui-tick'); setFormTab('home'); }}>← Back</button>
      <h1 className="page-title">{formTab === 'create' ? 'Choose a mode' : formTab === 'join' ? 'Join your friends' : 'How to Play'}</h1>
      {formTab === 'help' ? <div className="howto help-screen">
        <section className="surface"><h2>Four slots. Six colors.</h2><p>Everyone tries to find the same secret sequence of four colors. Colors can repeat. Tap a slot, then pick a color. Fill all four and submit.</p>
          <div className="board-legend"><span><i className="pin-dot" /> Pin: right color + spot</span><span><i className="spin-dot" /> Spin: right color, wrong spot</span></div>
          <p>Each ball counts once. Clue dots count matches; they do not identify specific slots.</p></section>
        {Object.values(MODES).map(config => <section className="surface" key={config.label}><h2>{config.label}</h2><p>{config.description}</p></section>)}
        <section className="surface"><h2>One room. Up to ten friends.</h2><p>Share the room code, mark yourselves ready, and let the host start. Open Everyone’s Guesses to see revealed results without losing your draft. If no one solves the code, the answer is revealed with no winner.</p></section>
      </div> : <form className="room-form" onSubmit={(e) => { e.preventDefault(); play('click-crisp-primary'); void enter(formTab, accountName); }}>
        {formTab === 'create' && <div className="mode-grid">
          {Object.entries(MODES).map(([id, config]) => <label key={id} className={'mode-option' + (mode === id ? ' selected' : '')}>
            <input type="radio" name="mode" value={id} checked={mode === id} onChange={() => { play('select-item'); setMode(id); }} />
            <Peg value={config.color} tiny />
            <span className="mode-body"><strong>{config.label}</strong><small>{config.hint}</small></span>
            <span className="mode-check">✓</span>
          </label>)}
        </div>}
        {account.signedIn
          ? <div className="playing-as"><span className="field-label">PLAYING AS</span><strong>{accountName || '…'}</strong>
              <small>Your PlayVolt account name</small></div>
          : <>
              <label className="field-label" htmlFor="nickname">YOUR NAME</label>
              <input id="nickname" type="text" autoComplete="nickname" maxLength={20} required
                placeholder="What should we call you?" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </>}
        {formTab === 'join' && <>
          <label className="field-label" htmlFor="roomCodeInput">ROOM CODE</label>
          <input className="code-input" type="text" id="roomCodeInput" minLength={6} maxLength={6}
            required spellCheck={false} autoCapitalize="characters" placeholder="A1B2C3" value={roomCodeInput}
            onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())} />
        </>}
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? 'Connecting…' : formTab === 'create' ? 'Create Room' : 'Join Room'}<span>→</span>
        </button>
        <div className="bottom-note">{account.signedIn ? 'Signed in' : 'No sign-up needed'} <span>•</span> 2–10 players</div>
      </form>}
    </>}
  </section>;
}
