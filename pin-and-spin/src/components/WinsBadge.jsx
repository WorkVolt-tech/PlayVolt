import React from 'react';

// Rounds this player has won in the room, with a crown for the leader(s). Public data only
// (safe on the TV). Shows nothing until the player has won a round.
export function WinsBadge({ player, leaders }) {
  const wins = Number(player?.wins) || 0;
  if (!wins) return null;
  const leads = leaders?.has(player.id);
  return <span className={'wins-badge' + (leads ? ' leads' : '')}
    title={`${wins} round${wins === 1 ? '' : 's'} won${leads ? ' — most in this room' : ''}`}>
    {leads ? '👑' : '🏆'}{wins}
  </span>;
}

// One line naming who leads, e.g. "👑 Ana leads · 3 rounds won" (or a tie).
export function LeaderLine({ players, leaders, me }) {
  if (!leaders?.size) return null;
  const top = players.filter((p) => leaders.has(p.id));
  const names = top.map((p) => (p.id === me ? 'You' : p.name));
  const wins = Number(top[0].wins) || 0;
  const who = names.length === 1 ? `${names[0]} ${names[0] === 'You' ? 'lead' : 'leads'}` : `${names.join(' & ')} are tied`;
  return <p className="leader-line">👑 {who} · {wins} round{wins === 1 ? '' : 's'} won</p>;
}
