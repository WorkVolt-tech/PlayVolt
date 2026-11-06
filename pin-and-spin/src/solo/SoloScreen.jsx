import React, { useEffect, useState } from 'react';
import { PegRow } from '../components/Peg.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { Confetti } from '../components/Confetti.jsx';
import { GuessPanel } from '../screens/GuessPanel.jsx';
import { formatClock } from '../game/selectors.js';
import { play } from '../sound/sfx.js';
import { LEVELS, msToTomorrow, shareText, storyStars } from './solo.js';
import { useSolo } from './useSolo.js';
import { useAdminView, usePeek } from '../admin.js';

// 1-player modes: Daily puzzle, Free play and Beat the clock. Signed-in players only.
export function SoloScreen({ account, notify, onBack, onSignIn }) {
  const solo = useSolo(notify, account.user?.id);
  const { loadHome } = solo;
  useEffect(() => { if (account.signedIn) void loadHome(); }, [account.signedIn, loadHome]);

  if (!account.signedIn) return <section className="screen solo-screen">
    <button className="back-button" onClick={onBack}>← Back</button>
    <h1 className="page-title">🎯 Play Solo</h1>
    <div className="surface lb-note"><p>Solo games are saved to your PlayVolt account: your daily streak, stats and best scores
      follow you on any device. Sign in (or create a free account) to play.</p>
      <button type="button" className="primary-btn" onClick={onSignIn}>Sign in / Create account <span>→</span></button></div>
  </section>;

  return solo.game ? <SoloGame solo={solo} notify={notify} /> : <SoloHub solo={solo} onBack={onBack} />;
}

function SoloHub({ solo, onBack }) {
  const { home, error, busy, start } = solo;
  const today = home?.today;
  const daily = home?.daily;
  const active = home?.active || {};
  const winRate = daily?.played ? Math.round((daily.won / daily.played) * 100) : 0;
  return <section className="screen solo-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); onBack(); }}>← Back</button>
    <h1 className="page-title">🎯 Play Solo</h1>
    {error && <div className="surface lb-empty"><p>{error}</p></div>}
    {!home && !error && <div className="surface lb-empty"><p>Loading…</p></div>}
    {home && <>
      <div className="surface solo-card daily-card">
        <div className="solo-card-head"><span className="solo-icon">📅</span>
          <div><h2>Daily Puzzle #{home.number}</h2><p>Same code for everyone today · 6 tries</p></div></div>
        <div className="solo-stats">
          <span><b>{daily.played}</b>Played</span><span><b>{winRate}%</b>Win</span>
          <span><b>{daily.streak}🔥</b>Streak</span><span><b>{daily.best}</b>Best</span>
        </div>
        <button type="button" className="primary-btn" disabled={busy} onClick={() => start('daily')}>
          {!today ? 'Play today’s puzzle' : today.status === 'playing' ? `Continue (${today.guesses.length}/6)` : today.status === 'won'
            ? `Solved in ${today.guesses.length}! See result` : 'See today’s result'} <span>→</span></button>
      </div>

      <div className="surface solo-card">
        <div className="solo-card-head"><span className="solo-icon">🎲</span>
          <div><h2>Free Play</h2><p>Unlimited random codes. Pick a difficulty.</p></div></div>
        <div className="solo-levels">
          {Object.entries(LEVELS).map(([id, level]) => {
            const stats = home.practice?.[id];
            return <button type="button" key={id} className="solo-level" disabled={busy} onClick={() => start('practice', id)}>
              <strong>{level.label}{active[`practice:${id}`] ? ' · continue' : ''}</strong>
              <small>{level.hint}</small>
              {stats?.played > 0 && <em>{stats.won} / {stats.played} won</em>}
            </button>;
          })}
        </div>
      </div>

      <div className="surface solo-card">
        <div className="solo-card-head"><span className="solo-icon">⏱️</span>
          <div><h2>Beat the Clock</h2><p>Crack as many codes as you can in 3 minutes.</p></div></div>
        <div className="solo-stats two"><span><b>{home.clock.best}</b>Best score</span><span><b>{home.clock.played}</b>Played</span></div>
        <button type="button" className="primary-btn" disabled={busy} onClick={() => start('clock')}>
          {active['clock:normal'] ? 'Continue' : 'Start the clock'} <span>→</span></button>
      </div>
    </>}
  </section>;
}

// story (optional): { level, next, onNext, onMap } when playing a story level.
export function SoloGame({ solo, notify, story }) {
  const { game, busy, draft, selected, flash, remainingMs, submit, pick, clear, leave, start, setSelected } = solo;
  const playing = game.status === 'playing';
  const adminOn = useAdminView();
  // Beat the clock gets a new code after each one is cracked or skipped.
  const peek = usePeek(adminOn && playing, { id: game.id }, `${game.solved}:${game.lastSecret?.join('')}:${game.guesses.length === 0}`);
  const title = story ? `Level ${story.level.level} · ${story.level.title}` : game.kind === 'daily' ? `Daily Puzzle #${game.number}`
    : game.kind === 'clock' ? 'Beat the Clock' : `Free Play · ${LEVELS[game.level].label}`;
  const timed = game.kind === 'clock' || (game.kind === 'story' && game.deadline);
  const [minutes, seconds] = remainingMs === null ? [] : formatClock(remainingMs);
  const help = story ? (story.level.kind === 'logic' ? 'Only one code fits every clue above. Work it out, then enter it.'
      : `${game.colors} colors${story.level.repeats ? ', repeats allowed' : ', no repeats'}. ${story.level.intro}`)
    : game.kind === 'clock' ? 'Crack it to score, then a new code appears. 8 tries per code.'
    : game.level === 'easy' ? '4 colors, and the code never repeats a color.' : '';

  return <section className="screen solo-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); if (story) story.onMap(); else leave(); }}>← {story ? 'Map' : 'Solo'}</button>
    <div className={'solo-game-head' + (timed && playing ? ' sticky' : '')}>
      <div><p className="eyebrow">{story ? 'STORY MODE' : 'PLAY SOLO'}</p><h1>{title}</h1></div>
      {timed && <div className="solo-clock">
        {game.kind === 'clock' && <span className="solo-score">🔓 {game.solved}</span>}
        {playing && <span className={'timer' + (remainingMs <= 20000 ? ' urgent' : '')}>{minutes}:{seconds}</span>}
      </div>}
    </div>

    {flash && <div className={'solo-flash ' + flash.result} role="status">
      <strong>{flash.result === 'solved' ? 'Cracked! +1' : 'Out of tries — new code'}</strong>
      <PegRow colors={flash.code} tiny />
    </div>}

    {game.clues?.length > 0 && <div className="surface story-clues">
      <div className="panel-title"><h2>🧩 CLUES</h2><span>{game.clues.length} GUESSES</span></div>
      {game.clues.map((clue, i) => <div className="code-row played" key={i}>
        <span className="attempt-number">{String.fromCharCode(65 + i)}</span>
        <div className="code-slots"><PegRow colors={clue.colors} tiny /></div>
        <Feedback guess={{ revealed: true, colors: clue.colors, pins: clue.pins, spins: clue.spins }} />
      </div>)}
    </div>}

    {playing
      ? <GuessPanel mine={game.guesses} limit={game.maxTries} attempt={game.guesses.length + 1} canSubmit={!busy}
          draft={draft} selected={selected} onSelect={setSelected} onColor={pick} onClear={clear} onSubmit={() => void submit()}
          colorCount={game.colors} help={help} peek={peek} />
      : <SoloResult game={game} solo={solo} notify={notify} story={story}
          onAgain={() => (story ? solo.startStory(story.level.level, true) : start(game.kind, game.level, true))} />}
  </section>;
}

function SoloResult({ game, notify, onAgain, solo, story }) {
  const won = game.status === 'won';
  const [left, setLeft] = useState(msToTomorrow());
  useEffect(() => {
    if (game.kind !== 'daily') return undefined;
    const t = setInterval(() => setLeft(msToTomorrow()), 1000);
    return () => clearInterval(t);
  }, [game.kind]);
  async function share() {
    const text = shareText(game, location.origin);
    play('select-item');
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); notify('Result copied! Paste it anywhere.'); }
    } catch (e) { if (e?.name !== 'AbortError') notify('Could not share. Try again.'); }
  }
  const hours = Math.floor(left / 3600000), mins = Math.floor(left / 60000) % 60, secs = Math.floor(left / 1000) % 60;
  const pad = (n) => String(n).padStart(2, '0');

  return <div className={'surface finish-panel solo-result' + (won || game.kind === 'clock' ? ' has-winner' : '')}>
    {(won || (game.kind === 'clock' && game.solved > 0)) && <Confetti />}
    <span className="trophy" aria-hidden="true">{game.kind === 'clock' ? '⏱️' : won ? '🏆' : '✦'}</span>
    {story && won && <div className="story-stars" aria-label={`${storyStars(story.level, game.guesses.length)} of 3 stars`}>
      {[1, 2, 3].map((n) => <span key={n} className={n <= storyStars(story.level, game.guesses.length) ? 'on' : ''} style={{ '--i': n }}>★</span>)}
    </div>}
    {game.kind === 'clock'
      ? <><h2>Time’s up!</h2><p>You cracked <b>{game.solved}</b> code{game.solved === 1 ? '' : 's'} in 3 minutes ({game.totalGuesses} guesses).</p></>
      : won ? <><h2>YOU CRACKED IT!</h2><p>Solved in <b>{game.guesses.length}</b> of {game.maxTries} tries.</p></>
      : <><h2>{game.deadline && new Date(game.deadline) <= new Date(game.serverTime) ? 'Out of time!' : 'So close!'}</h2>
          <p>{game.deadline && new Date(game.deadline) <= new Date(game.serverTime) ? 'The clock ran out.' : 'Out of tries.'} Here’s the code:</p></>}
    {game.answer && <>
      <p className="field-label">{game.kind === 'clock' ? 'LAST CODE' : 'SECRET COMBINATION'}</p>
      <div className="secret-reveal">{game.answer.map((v, i) => <span className="secret-ball" key={i} style={{ '--i': i }}><PegRow colors={[v]} tiny /></span>)}</div>
    </>}
    {story
      ? <div className="story-actions">
          {won && story.next && <button type="button" className="primary-btn" disabled={solo.busy} onClick={story.onNext}>Next level <span>→</span></button>}
          {won && !story.next && <p className="solo-next">🌙 You finished the story! Go back for 3 stars on every level.</p>}
          <button type="button" className={won ? 'outline-btn full' : 'primary-btn'} disabled={solo.busy} onClick={onAgain}>
            {won ? 'Replay for more stars' : 'Try again'} {!won && <span>↻</span>}</button>
          <button type="button" className="outline-btn full" onClick={story.onMap}>Back to the map</button>
        </div>
      : game.kind === 'daily'
      ? <>
          <button type="button" className="primary-btn" onClick={() => void share()}>Share result <span>↗</span></button>
          <p className="solo-next">Next puzzle in <b>{pad(hours)}:{pad(mins)}:{pad(secs)}</b></p>
        </>
      : <button type="button" className="primary-btn" disabled={solo.busy} onClick={onAgain}>Play again <span>↻</span></button>}
    {game.guesses.length > 0 && game.kind !== 'clock' && <div className="solo-recap">
      {game.guesses.map((g) => <div key={g.attempt} className="solo-recap-row"><PegRow colors={g.colors} tiny />
        <span>{'🟢'.repeat(g.pins)}{'⚪'.repeat(g.spins)}</span></div>)}
    </div>}
  </div>;
}
