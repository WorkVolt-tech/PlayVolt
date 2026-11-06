import React, { useEffect, useState } from 'react';
import { usePinAndSpin } from './hooks/usePinAndSpin.js';
import { useAccount } from './hooks/useAccount.js';
import { AccountScreen } from './screens/AccountScreen.jsx';
import { LeaderboardScreen } from './screens/LeaderboardScreen.jsx';
import { SoloScreen } from './solo/SoloScreen.jsx';
import { StoryScreen } from './solo/StoryScreen.jsx';
import { AchievementsScreen } from './screens/AchievementsScreen.jsx';
import { checkAchievements } from './achievements.js';
import { FriendsScreen } from './social/FriendsScreen.jsx';
import { InviteBanner } from './social/InviteBanner.jsx';
import { VersionAlert } from './components/VersionAlert.jsx';
import { Dialog } from './components/Dialog.jsx';
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
  const [dialog, setDialog] = useState(null);
  // When a match with friends ends, announce any badge it earned (signed-in players).
  const finished = game?.status === 'finished' ? `${game.code}:${game.puzzle}` : null;
  const userId = account.user?.id;
  useEffect(() => {
    if (finished && userId) { const t = setTimeout(() => void checkAchievements(userId, notify), 1500); return () => clearTimeout(t); }
    return undefined;
  }, [finished, userId, notify]);
  const close = () => setDialog(null);
  // A friend link (?friend=CODE) opens Friends with the code ready to add.
  const [friendCode] = useState(() => {
    const c = new URLSearchParams(location.search).get('friend');
    return c && /^[A-Za-z0-9-]{3,16}$/.test(c) ? c.toUpperCase() : '';
  });
  const { setFormTab } = form;
  useEffect(() => {
    if (!friendCode) return;
    setFormTab('friends');
    history.replaceState(null, '', location.pathname);
  }, [friendCode, setFormTab]);
  const accountName = account.signedIn ? account.profile?.nickname || '' : '';

  function removePlayer(player) {
    setDialog({ title: `Remove ${player.name}?`, message: 'They won’t be able to rejoin this room.',
      confirmLabel: 'Remove', danger: true, onConfirm: () => { close(); void act('kick', { playerId: player.id }); } });
  }
  function leaveRoom() {
    const message = (game?.status === 'playing'
      ? 'The game continues without you, and you can’t rejoin this match.'
      : 'You can come back with the room code while the room is in the lobby.')
      + (game?.hostId === game?.me ? ' The next player becomes the host.' : '');
    setDialog({ title: 'Leave this room?', message, confirmLabel: 'Leave room', danger: true,
      onConfirm: () => { close(); void act('leave'); } });
  }
  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); notify(message); }
    catch { setDialog({ title: 'Copy this', copyText: text }); }
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
    <div className={'shell' + (game && game.status !== 'lobby' ? ' match-shell' : '') + (!session && form.formTab === 'home' ? ' home-shell' : '')}>
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
        <InviteBanner userId={account.signedIn ? userId : null} active={!session} notify={notify}
          onJoin={(code) => void form.enter('join', accountName, code)} />
        {!session && form.formTab === 'account' && <AccountScreen account={account}
          onBack={() => form.setFormTab('home')} onDone={(message) => { notify(message); form.setFormTab(friendCode ? 'friends' : 'home'); }} />}
        {!session && form.formTab === 'leaderboard' && <LeaderboardScreen account={account}
          onBack={() => form.setFormTab('home')} onSignIn={() => form.setFormTab('account')} />}
        {!session && form.formTab === 'solo' && <SoloScreen account={account} notify={notify}
          onBack={() => form.setFormTab('home')} onSignIn={() => form.setFormTab('account')} />}
        {!session && form.formTab === 'story' && <StoryScreen account={account} notify={notify}
          onBack={() => form.setFormTab('home')} onSignIn={() => form.setFormTab('account')} />}
        {!session && form.formTab === 'achievements' && <AchievementsScreen account={account}
          onBack={() => form.setFormTab('home')} onSignIn={() => form.setFormTab('account')} />}
        {!session && form.formTab === 'friends' && <FriendsScreen account={account} notify={notify} startCode={friendCode}
          onBack={() => form.setFormTab('home')} onSignIn={() => form.setFormTab('account')} />}
        {!session && !['account', 'leaderboard', 'solo', 'story', 'achievements', 'friends'].includes(form.formTab) && <EntryScreen form={form} busy={busy || account.loading} account={account} />}

        {session && !game && <div className="surface"><p>Reconnecting to your room…</p>
          <button className="outline-btn full" onClick={forget}>BACK TO HOME</button></div>}

        {session && game && <section className="screen">
          {game.status === 'lobby'
            ? <Lobby game={game} busy={busy} act={act} pairTv={state.pairTv} signedIn={account.signedIn} onCopy={copyText} onShare={share} onRemove={removePlayer} />
            : <Match state={state} onShare={share} onRemove={removePlayer} />}
          <button className="leave-link" type="button" disabled={busy}
            onClick={leaveRoom}>
            ← Leave room
          </button>
        </section>}
      </main>
      <footer className="footer">PIN &amp; SPIN <span>·</span> A PLAYVOLT GAME</footer>
    </div>
    <div className={'toast' + (toast ? ' show' : '')} role="status" aria-live="polite">{toast}</div>
    {dialog && <Dialog {...dialog} onCancel={close} />}
    <VersionAlert />
  </>;
}
