import React from 'react';
import { usePinAndSpin } from './hooks/usePinAndSpin.js';
import { useAccount } from './hooks/useAccount.js';
import { AccountScreen } from './screens/AccountScreen.jsx';
import { VersionAlert } from './components/VersionAlert.jsx';
import { SoundToggle } from './sound/SoundToggle.jsx';
import { HowToPlayButton } from './components/HowToPlay.jsx';
import { useGameSounds } from './sound/useGameSounds.js';
import { EntryScreen } from './screens/EntryScreen.jsx';
import { Lobby } from './screens/Lobby.jsx';
import { Match } from './screens/Match.jsx';

export default function App() {
  const state = usePinAndSpin();
  const account = useAccount();
  useGameSounds(state.game);
  const { session, game, busy, toast, notify, form, act, forget } = state;

  function removePlayer(player) {
    if (window.confirm(`Remove ${player.name} from the room? They won't be able to rejoin.`)) {
      void act('kick', { playerId: player.id });
    }
  }
  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); notify(message); }
    catch { window.prompt('Copy:', text); }
  }
  async function share() {
    if (!game) return;
    const link = new URL(location.href);
    link.searchParams.set('room', game.code);
    link.hash = '';
    if (navigator.share) {
      try { await navigator.share({ title: 'Pin & Spin', text: `Join my room: ${game.code}`, url: link.toString() }); }
      catch (error) { if (error.name !== 'AbortError') await copyText(link.toString(), 'Invite link copied!'); }
    } else await copyText(link.toString(), 'Invite link copied!');
  }

  return <>
    <div className="ambient" aria-hidden="true" />
    <div className={'shell' + (game && game.status !== 'lobby' ? ' match-shell' : '')}>
      <header className="topbar">
        <a className="home-link" href={import.meta.env.VITE_PLAYVOLT_HUB_URL || "https://playvolt-hub.pages.dev/"} aria-label="Back to PlayVolt">← <span>PLAYVOLT</span></a>
        <div className="brand">Pin &amp; <span>Spin</span></div>
        <div className="topbar-right">
          <HowToPlayButton />
          <SoundToggle />
          <div className="live"><i /><span>{game ? 'ROOM LIVE' : 'PARTY GAME'}</span></div>
        </div>
      </header>

      <main>
        {!session && form.formTab === 'account' && <AccountScreen account={account}
          onBack={() => form.setFormTab('home')} onDone={(message) => { notify(message); form.setFormTab('home'); }} />}
        {!session && form.formTab !== 'account' && <EntryScreen form={form} busy={busy || account.loading} account={account} />}

        {session && !game && <div className="surface"><p>Reconnecting to your room…</p>
          <button className="outline-btn full" onClick={forget}>BACK TO HOME</button></div>}

        {session && game && <section className="screen">
          {game.status === 'lobby'
            ? <Lobby game={game} busy={busy} act={act} pairTv={state.pairTv} onCopy={copyText} onShare={share} onRemove={removePlayer} />
            : <Match state={state} onShare={share} onRemove={removePlayer} />}
          <button className="leave-link" type="button" disabled={busy}
            onClick={() => { if (window.confirm('Leave this room?')) void act('leave'); }}>
            ← Leave room
          </button>
        </section>}
      </main>
      <footer className="footer">PIN &amp; SPIN <span>·</span> A PLAYVOLT GAME</footer>
    </div>
    <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
    <VersionAlert />
  </>;
}
