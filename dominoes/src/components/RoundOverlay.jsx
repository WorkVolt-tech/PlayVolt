import './RoundOverlay.css'

export default function RoundOverlay({ roomData, players, myInfo, onNextRound, onLeaveLobby }) {
  if (!roomData) return null
  const isMatchOver = roomData.status === 'finished'
  const isDekabess  = roomData.pending_point
  const streak      = roomData.streak || { seat: null, team: null, count: 0 }
  const mode        = myInfo.gameMode || 'chien'

  const roundWinnerSeat = roomData.current_turn
  const roundWinner     = players.find(p => p.seat === roundWinnerSeat)
  const isMe            = roundWinnerSeat === myInfo.seat
  const isMyTeamWin     = mode === 'asosye' &&
    ((myInfo.seat === 0 || myInfo.seat === 2) === (roundWinnerSeat === 0 || roundWinnerSeat === 2))

  let title, desc
  if (isDekabess && isMatchOver) {
    title = `🎯 Dekabess — Vyèj${streak.count > 4 ? '+1' : ''}!`
    desc  = `${roundWinner?.nickname ?? '?'} wins the match with a Dekabess! 🏆`
  } else if (isDekabess) {
    title = '🎯 Dekabess!'
    desc  = `${roundWinner?.nickname ?? '?'} plays a Dekabess! Counts as 2 wins. Streak: ${streak.count}/4`
  } else if (isMatchOver) {
    title = (isMe || isMyTeamWin) ? '🏆 Vyèj!' : 'Vyèj!'
    desc  = `${roundWinner?.nickname ?? '?'} wins the match!`
  } else {
    title = (isMe || isMyTeamWin) ? '✊ Round Won!' : 'Round Over'
    desc  = `${roundWinner?.nickname ?? '?'} wins this round. Streak: ${streak.count}/4`
  }

  const isBlocked = roomData.blocked === true
  const results = [...players]
    .map(p => ({ ...p, pips: (p.hand || []).reduce((s, t) => s + t[0] + t[1], 0) }))
    .sort((a, b) => a.pips - b.pips)

  return (
    <div className="overlay">
      <div className="modal">
        <h2 className="modal-title">{title}</h2>
        <p className="modal-desc">{desc}</p>

        {/* Streak dots */}
        <div className="streak-row">
          <div className="streak-label">Streak</div>
          <div className="streak-pips">
            {[0,1,2,3].map(i => (
              <div key={i} className={`streak-pip ${i < streak.count ? 'won' : ''}`} />
            ))}
          </div>
        </div>

        {/* Scores */}
        <table className="scores-table">
          <thead>
            <tr>
              <th>Player</th>
              {isBlocked && <th>Pips</th>}
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.seat} className={r.seat === roundWinnerSeat ? 'winner' : ''}>
                <td>{r.nickname}{r.seat === myInfo.seat ? ' (you)' : ''}{r.seat === roundWinnerSeat ? ' 👑' : ''}</td>
                {isBlocked && <td>{r.pips}</td>}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-actions">
          {!isMatchOver && isMe && (
            <button className="btn btn-primary" onClick={onNextRound}>Next Round</button>
          )}
          {!isMatchOver && !isMe && (
            <p className="waiting-msg">Waiting for {roundWinner?.nickname} to start next round…</p>
          )}
          <button className="btn btn-outline" onClick={onLeaveLobby}>
            {isMatchOver ? 'Back to Lobby' : 'Leave Table'}
          </button>
        </div>
      </div>
    </div>
  )
}
