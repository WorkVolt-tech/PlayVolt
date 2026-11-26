import React from 'react';
import { CodeBoard } from '../components/CodeBoard.jsx';
import { PlayerAvatar } from '../components/PlayerAvatar.jsx';
import { cosmeticStyle, normalizeCosmetics } from '../cosmetics.js';
import { formatClock } from '../game/selectors.js';

export const relayTeamName = (id) => id === 0 ? 'Team Blue' : 'Team Gold';

export function RelayBoards({ game, clock, offset, tv = false }) {
  const finished = game.status === 'finished';
  const winners = game.teams.filter(team => team.members.some(id => game.winners.includes(id)));
  return <section className={'relay-boards' + (tv ? ' relay-tv' : '')}>
    <h2>{finished ? (winners.length === 2 ? 'Both teams tie!' :
      winners.length ? relayTeamName(winners[0].id) + ' wins!' : 'No winner this time') : 'Rally Relay'}</h2>
    <div className="relay-grid">
      {game.teams.map(team => {
        const next = game.players.find(player => player.id === team.turnId);
        const members = game.players.filter(player => team.members.includes(player.id));
        const style = normalizeCosmetics((next || members[0])?.appearance);
        const time = team.deadline ? formatClock(Math.max(0, Date.parse(team.deadline) - clock - offset)).join(':') : null;
        return <article className={'surface relay-lane relay-team-' + team.id} key={team.id}>
          <header><h3>{relayTeamName(team.id)}</h3>{!finished && team.state === 'racing' && <strong>{time}</strong>}</header>
          <div className="relay-roster relay-avatar-roster">{members.map(player => <span key={player.id}><PlayerAvatar player={player} size="sm" /> {player.name}</span>)}</div>
          <p>Stage {team.stage}/4 · {team.completed}/4 solved</p>
          <p className="relay-turn">{finished ? team.totalGuesses + ' guesses' :
            next ? 'Up next: ' + next.name : 'Run ended'}</p>
          <div className={'relay-styled-board board-theme-' + style.board} style={cosmeticStyle(style)}>
            <CodeBoard mine={team.guesses} limit={6} attempt={0} draft={Array(team.slots).fill(null)} shape={style.piece} pinShape={style.pin} />
          </div>
        </article>;
      })}
    </div>
  </section>;
}
