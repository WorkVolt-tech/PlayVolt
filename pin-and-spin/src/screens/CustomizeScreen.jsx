import React, { useState } from 'react';
import { AVATARS, BOARDS, PIECES, RESULT_PINS, ACCENTS, cosmeticStyle, normalizeCosmetics, unlockedCosmetics } from '../cosmetics.js';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { PegRow } from '../components/Peg.jsx';
import { Feedback } from '../components/Feedback.jsx';
import { AvatarArt, illustratedAvatars } from '../components/AvatarArt.jsx';
import { byCode } from '../achievements.js';

const categories = [
  ['avatar', 'Choose your avatar', AVATARS],
  ['board', 'Board style', BOARDS],
  ['accent', 'Board color', ACCENTS],
  ['piece', 'Guess piece shape', PIECES],
  ['pin', 'Result pin shape', RESULT_PINS],
];

function BoardSample({ board, accent, piece, seat }) {
  return <span className={`customize-board-sample board-theme-${board}`}
    style={cosmeticStyle({ board, accent }, seat)} aria-hidden="true">
    <span className="sample-title"><i /> YOUR BOARD</span>
    <span className="sample-guess">
      <PegRow colors={[0, 1, 2, 3]} tiny shape={piece} />
      <span className="sample-result"><i className="pin-dot" /><i className="pin-dot" /><i className="spin-dot" /></span>
    </span>
  </span>;
}

export function CustomizeScreen({ value, earned = {}, name = 'You', seat = 1, usedAccents = [], inRoom = false, onSave, onBack, busy }) {
  const [choice, setChoice] = useState(() => ({ ...unlockedCosmetics(value, earned),
    accent: inRoom ? normalizeCosmetics(value, seat).accent : unlockedCosmetics(value, earned).accent }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const preview = { name, seat, appearance: choice };
  const locked = (key, option) => option.trophy && !earned[option.trophy]
    && !(key === 'accent' && inRoom && option.id === value?.accent);
  async function save() {
    setError(''); setSaving(true);
    try { await onSave(choice); onBack(); }
    catch (e) { setError(e.message || 'Could not save your style. Try again.'); }
    finally { setSaving(false); }
  }
  return <section className="screen customize-screen">
    <button className="back-button" type="button" onClick={onBack}>← Back</button>
    <h1 className="page-title">Make it yours</h1>
    <p className="customize-intro">Your avatar, board, and shapes appear on your phone and beside your guesses on the shared TV.</p>
    <p className="customize-intro">Earn trophies and finish story worlds to unlock styles. Rooms can assign a unique board color even before you unlock it for choosing.</p>
    <div className={`customize-preview board-theme-${choice.board} pin-shape-${choice.pin}`}
      style={cosmeticStyle(choice, seat)}>
      <header><PlayerAvatar player={preview} /><strong>{name}</strong><small>LIVE PREVIEW</small></header>
      <div className="customize-example piece-preview" data-piece={choice.piece}>
        <PegRow colors={[0, 1, 2, 3]} tiny shape={choice.piece} />
        <Feedback guess={{ colors: [0, 1, 2, 3], pins: 2, spins: 1, revealed: true }} shape={choice.pin} />
      </div>
    </div>
    {categories.map(([key, title, options]) => <fieldset className="surface customize-group" key={key}>
      <legend>{title}</legend>
      <div className="customize-options">
        {options.map((option) => <button key={option.id} type="button" disabled={!!locked(key, option) || (key === 'accent' && usedAccents.includes(option.id))}
          className={'customize-option' + (key === 'board' || key === 'accent' ? ' customize-board-option' : '') + (choice[key] === option.id ? ' selected' : '')}
          aria-pressed={choice[key] === option.id}
          onClick={() => setChoice({ ...choice, [key]: option.id })}>
          {key === 'board' || key === 'accent'
            ? <BoardSample board={key === 'board' ? option.id : choice.board}
              accent={key === 'accent' ? option.id : choice.accent} piece={choice.piece} seat={seat} />
            : <span className="customize-swatch">
              {key === 'avatar' ? option.id === 'initial' ? name[0]?.toUpperCase()
                : illustratedAvatars.has(option.id) ? <AvatarArt variant={option.id} /> : option.icon
                : key === 'piece' ? <PegRow colors={[0]} tiny shape={option.id} />
                  : <Feedback guess={{ colors: [0, 1, 2, 3], pins: 2, spins: 2, revealed: true }} shape={option.id} />}
            </span>}
          <span>{option.name}</span>
          {(key === 'board' || key === 'accent') && choice[key] === option.id
            && <small className="selected-board-label" aria-hidden="true">✓ Selected</small>}
          {locked(key, option) && <small>🔒 {byCode[option.trophy]?.title || option.trophy}</small>}
          {key === 'accent' && inRoom && option.id === value?.accent && option.trophy && !earned[option.trophy]
            && <small>Assigned in this room</small>}
          {key === 'accent' && usedAccents.includes(option.id) && <small>In use</small>}
        </button>)}
      </div>
    </fieldset>)}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-btn full" type="button" disabled={saving || busy} onClick={save}>
      {saving ? 'Saving…' : 'Save my style'}
    </button>
  </section>;
}
