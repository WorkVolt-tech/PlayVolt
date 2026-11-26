import React from 'react';
import { CodeBoard } from '../components/CodeBoard.jsx';
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
        const time = team.deadline ? formatClock(Math.max(0, Date.parse(team.deadline) - clock - offset)).join(':') : null;
        return <article className={'surface relay-lane relay-team-' + team.id} key={team.id}>
          <header><h3>{relayTeamName(team.id)}</h3>{!finished && team.state === 'racing' && <strong>{time}</strong>}</header>
          <p className="relay-roster">{game.players.filter(p => team.members.includes(p.id)).map(p => p.name).join(' · ')}</p>
          <p>Stage {team.stage}/4 · {team.completed}/4 solved</p>
          <p className="relay-turn">{finished ? team.totalGuesses + ' guesses' :
            next ? 'Up next: ' + next.name : 'Run ended'}</p>
          <CodeBoard mine={team.guesses} limit={6} attempt={0} draft={Array(team.slots).fill(null)} />
        </article>;
      })}
    </div>
  </section>;
}
