import { useRef } from 'react'
import TileFace from './TileFace'
import HandsReveal from './HandsReveal'
import './RoundOverlay.css'

export default function RoundOverlay({ boardTiles = null, roomData, players, myInfo, onNextRound, onLeaveLobby, leaveLabel, canContinue = false, onPlayAgain }) {
  const frozen = useRef(null)   // hooks before any early return (see the reveal below)
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
  // ── The reveal shows the hands AS THE ROUND ENDED, never anything later ──
  // When the winner starts the next round, the new hands are written a moment
  // before the table switches back to playing — and this screen is still open.
  // Re-reading the hands live would show everyone the NEW deal face-up.
  // So the hands are frozen the first time this screen shows a round.
  if (!frozen.current || frozen.current.round !== roomData.round) {
    const handOf = p => (Array.isArray(p.hand) ? p.hand.map(t => [...t]) : [])
    const total = players.reduce((n, p) => n + handOf(p).length, 0)
    frozen.current = {
      round: roomData.round,
      hands: Object.fromEntries(players.map(p => [p.seat, handOf(p)])),
      // A finished round always has tiles on the table. If every tile is back
      // in someone's hand, this is already a fresh deal (say, a refresh in
      // that gap) — so the reveal is not shown at all.
      // a fresh deal has every dealt tile back in hand: 7 each at 4 players,
      // 9 each at 3 (0-0 set aside), 14 each at 2
      // a fresh deal has every dealt tile back in hand. When the board is
      // known that's simply "the board is empty" (players can draw, so hand
      // sizes vary); otherwise fall back to the tiles dealt per table size.
      ok: boardTiles != null ? boardTiles > 0 : total < ({ 2: 28, 3: 27, 4: 28 })[players.length],
    }
  }
  const showReveal = frozen.current.ok

  const withPips = [...players]
    .map(p => {
      const hand = frozen.current.hands[p.seat] || []
      return { ...p, hand, pips: hand.reduce((s, t) => s + t[0] + t[1], 0) }
    })
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
        {showReveal && (
          <HandsReveal
            winnerSeat={roundWinnerSeat}
            rows={results.map(r => ({ seat: r.seat, hand: r.hand, name: `${r.nickname}${r.seat === myInfo.seat ? ' (you)' : ''}` }))}
          />
        )}

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
