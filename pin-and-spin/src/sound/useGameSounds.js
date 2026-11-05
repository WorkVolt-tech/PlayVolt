import { useEffect, useRef } from 'react';
import { matchEvents } from '../game/selectors.js';
import { play } from './sfx.js';

// Plays one sound for what just changed in the room (lobby or match).
export function useGameSounds(game, { audience = 'player' } = {}) {
  const prevRef = useRef(null);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = game;
    if (!game || !prev || prev.code !== game.code) return;

    if (prev.status === 'lobby' && game.status === 'lobby') {
      const was = new Set((prev.players || []).filter((p) => p.active).map((p) => p.id));
      const now = new Set((game.players || []).filter((p) => p.active).map((p) => p.id));
      if ([...now].some((id) => !was.has(id) && id !== game.me)) play('message-incoming-pop');
      else if ([...was].some((id) => !now.has(id))) play('drawer-close');
      return;
    }

    const events = matchEvents(prev, game);
    const has = (type) => events.find((e) => e.type === type);
    const end = has('end'), scored = has('scored');
    const someoneWon = (game.winners || []).length > 0;
    if (end) play(end.won || (audience === 'tv' && someoneWon) ? 'level-up' : someoneWon ? 'error-soft-thud' : 'modal-close-fall');
    else if (scored?.pins === 4) play('achievement');
    else if (has('round')) play('notification-ding');
    else if (has('turn')) play('mention-pop');
    else if (scored) play(scored.pins > 0 ? 'xp-up' : scored.spins > 0 ? 'success-subtle-ping' : 'error-soft-thud');
    else if (has('start')) play('confirm-unlock');
  }, [game]);
}
