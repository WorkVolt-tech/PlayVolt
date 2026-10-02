import TileFace from './TileFace'
import './RoundOverlay.css'

export default function RoundOverlay({ roomData, players, myInfo, onNextRound, onLeaveLobby, leaveLabel, canContinue = false, onPlayAgain }) {
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

  const isKnockout = isMatchOver && roomData.ended_by === 'knockout'

  let title, desc
  if (isKnockout) {
    title = (isMe || isMyTeamWin) ? '💥 Streak broken!' : 'Knocked out'
    desc  = `${roundWinner?.nickname ?? '?'} broke a streak of 3 — the other team is out of the tournament.`
  } else if (isDekabess && isMatchOver) {
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

  const isBlocked = roomData.blocked === true || roomData.blocked === 'true'
  const withPips = [...players]
    .map(p => ({ ...p, pips: (p.hand || []).reduce((s, t) => s + t[0] + t[1], 0) }))
  const results = isBlocked
    ? [...withPips].sort((a, b) => a.pips - b.pips)
    : withPips.sort((a, b) => a.seat - b.seat)

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

        {/* The reveal: everyone's remaining tiles, face up, with pip totals —
            so you can see what each player was holding and why it went the
            way it did. */}
        <div className="reveal">
          <div className="reveal-head"><span>What everyone was holding</span><span>Pips</span></div>
          {results.map(r => {
            const won = r.seat === roundWinnerSeat
            const tiles = Array.isArray(r.hand) ? r.hand : []
            return (
              <div key={r.seat} className={`reveal-row ${won ? 'won' : ''}`}>
                <div className="reveal-name">
                  {r.nickname}{r.seat === myInfo.seat ? ' (you)' : ''}{won ? ' 👑' : ''}
                </div>
                <div className="reveal-tiles">
                  {tiles.length === 0
                    ? <span className="reveal-out">Went out</span>
                    : tiles.map((t, i) => (
                        <div key={i} className="reveal-tile"><TileFace a={t[0]} b={t[1]} vertical={false} /></div>
                      ))}
                </div>
                <div className="reveal-pips">{r.pips}</div>
              </div>
            )
          })}
        </div>

        <div className="modal-actions">
          {/* canContinue: nobody else can deal (solo), so you always can */}
          {!isMatchOver && (isMe || canContinue) && (
            <button className="btn btn-primary" onClick={onNextRound}>Next Round</button>
          )}
          {!isMatchOver && !isMe && !canContinue && (
            <p className="waiting-msg">Waiting for {roundWinner?.nickname} to start next round…</p>
          )}
          {isMatchOver && onPlayAgain && (
            <button className="btn btn-primary" onClick={onPlayAgain}>Play again</button>
          )}
          <button className="btn btn-outline" onClick={onLeaveLobby}>
            {leaveLabel || (isMatchOver ? 'Back to Lobby' : 'Leave Table')}
          </button>
        </div>
      </div>
    </div>
  )
}
