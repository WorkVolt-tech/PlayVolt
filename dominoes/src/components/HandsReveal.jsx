import TileFace from './TileFace'

// ── What everyone was holding ────────────────────────────────────────────────
// Every player's remaining tiles, face up, with their pip totals — at the end
// of a round, so you can see what each player held and why it went the way it
// did (for a blocked table, these totals decided it). Shared by the round
// results in every mode.
//   rows: [{ seat, name, hand }]   winnerSeat: the round's winner
export default function HandsReveal({ rows, winnerSeat }) {
  return (
    <div className="reveal">
      <div className="reveal-head"><span>What everyone was holding</span><span>Pips</span></div>
      {rows.map(r => {
        const won = r.seat === winnerSeat
        const tiles = Array.isArray(r.hand) ? r.hand : []
        const pips = tiles.reduce((s, t) => s + t[0] + t[1], 0)
        return (
          <div key={r.seat} className={`reveal-row ${won ? 'won' : ''}`}>
            <div className="reveal-name">{r.name}{won ? ' 👑' : ''}</div>
            <div className="reveal-tiles">
              {tiles.length === 0
                ? <span className="reveal-out">Went out</span>
                : tiles.map((t, i) => (
                    <div key={i} className="reveal-tile"><TileFace a={t[0]} b={t[1]} vertical={false} /></div>
                  ))}
            </div>
            <div className="reveal-pips">{pips}</div>
          </div>
        )
      })}
    </div>
  )
}
