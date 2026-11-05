import React, { useCallback, useEffect, useState } from 'react';
import { callGame } from '../game/api.js';
import { play } from '../sound/sfx.js';
import { SoloGame } from './SoloScreen.jsx';
import { useSolo } from './useSolo.js';

export const WORLDS = {
  1: { name: 'Carrot Patch', icon: '🥕', blurb: 'Spin the bunny’s carrots are locked in code vaults! Learn to crack them.' },
  2: { name: 'Clockwork Burrow', icon: '⚙️', blurb: 'Deep underground, the vaults have timers. Think fast.' },
  3: { name: 'Moon Maze', icon: '🌙', blurb: 'The last vaults, under the stars. Experts only.' },
};

const formatSeconds = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`);

// Story mode: a level map across three worlds. Signed-in players only.
export function StoryScreen({ account, notify, onBack, onSignIn }) {
  const solo = useSolo(notify);
  const [map, setMap] = useState(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try { setMap(await callGame('story_home', {}, {})); }
    catch (e) { setError(e.message || 'Could not load the story.'); }
  }, []);
  useEffect(() => { if (account.signedIn) void load(); }, [account.signedIn, load]);

  if (!account.signedIn) return <section className="screen solo-screen">
    <button className="back-button" onClick={onBack}>← Back</button>
    <h1 className="page-title">🗺️ Story Mode</h1>
    <div className="surface lb-note"><p>Help Spin the bunny crack 24 locked vaults across three worlds. Your stars are saved to
      your PlayVolt account. Sign in (or create a free account) to play.</p>
      <button type="button" className="primary-btn" onClick={onSignIn}>Sign in / Create account <span>→</span></button></div>
  </section>;

  const levels = map?.levels || [];
  if (solo.game?.kind === 'story') {
    const level = levels.find((l) => l.level === solo.game.storyLevel);
    const next = levels.find((l) => l.level === (level?.level || 0) + 1);
    if (level) return <SoloGame solo={solo} notify={notify} story={{
      level, next,
      onNext: () => { void solo.startStory(next.level); },
      onMap: () => { solo.leave(); setPicked(null); void load(); },
    }} />;
  }

  const total = levels.length * 3;
  return <section className="screen solo-screen story-screen">
    <button className="back-button" onClick={() => { play('tap-ui-tick'); onBack(); }}>← Back</button>
    <h1 className="page-title">🗺️ Story Mode</h1>
    {error && <div className="surface lb-empty"><p>{error}</p></div>}
    {!map && !error && <div className="surface lb-empty"><p>Loading…</p></div>}
    {map && <>
      <p className="story-total">⭐ {map.stars} / {total} stars</p>
      {map.active && <button type="button" className="primary-btn story-continue" disabled={solo.busy}
        onClick={() => solo.startStory(map.active.level)}>Continue level {map.active.level} <span>→</span></button>}
      {Object.entries(WORLDS).map(([id, world]) => {
        const inWorld = levels.filter((l) => l.world === Number(id));
        const open = inWorld.some((l) => l.unlocked);
        const stars = inWorld.reduce((n, l) => n + l.stars, 0);
        return <section key={id} className={'surface story-world world-' + id + (open ? '' : ' locked')}>
          <header>
            <span className="story-world-icon">{open ? world.icon : '🔒'}</span>
            <div><h2>World {id} · {world.name}</h2><p>{world.blurb}</p></div>
            <span className="story-world-stars">⭐ {stars}/{inWorld.length * 3}</span>
          </header>
          <ol className="story-path">
            {inWorld.map((l) => <li key={l.level}>
              <button type="button" disabled={!l.unlocked}
                className={'story-node' + (l.stars ? ' done' : '') + (l.unlocked && !l.stars ? ' current' : '') + (l.kind === 'logic' ? ' logic' : '') + (l.level % 8 === 0 ? ' boss' : '')}
                aria-label={`Level ${l.level}: ${l.title}${l.unlocked ? `, ${l.stars} stars` : ', locked'}`}
                onClick={() => { play('select-item'); setPicked(l); }}>
                <b>{l.unlocked ? l.level : '🔒'}</b>
                <span className="story-node-stars">{[1, 2, 3].map((n) => <i key={n} className={n <= l.stars ? 'on' : ''}>★</i>)}</span>
                {l.unlocked && (l.kind === 'logic' || l.seconds) && <em>{l.kind === 'logic' ? '🧩' : '⏱'}</em>}
              </button>
            </li>)}
          </ol>
        </section>;
      })}
    </>}

    {picked && <div className="sheet-backdrop" onClick={() => setPicked(null)}>
      <div className="sheet surface story-sheet" role="dialog" aria-modal="true" aria-label={picked.title} onClick={(e) => e.stopPropagation()}>
        <div className="panel-title"><h2>Level {picked.level} · {picked.title}</h2>
          <button type="button" className="sheet-close" onClick={() => setPicked(null)} aria-label="Close">✕</button></div>
        <p className="story-intro">{picked.intro}</p>
        <div className="story-rules">
          {picked.kind === 'logic' && <span>🧩 Logic puzzle</span>}
          <span>🎨 {picked.colors} colors</span>
          <span>{picked.repeats ? '🔁 Repeats allowed' : '🚫 No repeats'}</span>
          <span>🎯 {picked.tries} {picked.tries === 1 ? 'try' : 'tries'}</span>
          {picked.seconds && <span>⏱ {formatSeconds(picked.seconds)}</span>}
        </div>
        <ul className="story-goals">
          <li><b>★★★</b> in {picked.star3} {picked.star3 === 1 ? 'try' : 'tries or fewer'}</li>
          {picked.star2 > picked.star3 && <li><b>★★</b> in {picked.star2} tries or fewer</li>}
          <li><b>★</b> crack it at all</li>
        </ul>
        {picked.stars > 0 && <p className="story-best">Your best: {'★'.repeat(picked.stars)} ({picked.bestTries} {picked.bestTries === 1 ? 'try' : 'tries'})</p>}
        <button type="button" className="primary-btn" disabled={solo.busy}
          onClick={() => { const lv = picked.level; setPicked(null); void solo.startStory(lv, map.active?.level !== lv); }}>
          {map.active?.level === picked.level ? 'Continue' : picked.stars ? 'Play again' : 'Play'} <span>→</span></button>
      </div>
    </div>}
  </section>;
}
