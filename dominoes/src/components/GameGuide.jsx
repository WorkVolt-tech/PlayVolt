import { useEffect, useState } from 'react'
import './GameGuide.css'

// ── The Game Guide ───────────────────────────────────────────────────────────
// Every rule here matches the game's own code (useGameState, storyEngine,
// challenge.js, the Goud and shop functions). If a rule changes, change it here.
export const GUIDE = [
  { id: 'basics', title: 'How to play', body: [
    ['The goal', 'Be the first to play every tile in your hand. Win rounds in a row to reach a Vyèj and win the match.'],
    ['Your turn', 'Play one tile that matches an open end of the chain. Drag it to the table, or tap it and then tap a glowing end.'],
    ['Knocking', 'Nothing to play? You knock (pass) and play moves on. Every player sees the knock.'],
    ['The draw pile', 'In 2- and 3-player games with a pile, draw one tile at a time instead of knocking. You can only knock once the pile is empty.'],
  ] },
  { id: 'rounds', title: 'Rounds', body: [
    ['Who starts', 'First round: whoever holds the 6-6 opens with it. If it’s in the pile, the highest double opens with that double. Later rounds: the last round’s winner opens with any tile.'],
    ['Winning a round', 'The first player to empty their hand wins the round.'],
    ['A blocked table', 'If nobody can play either end, the table is jammed: the player with the fewest pips in hand wins the round (a tie goes to the earlier seat).'],
    ['Five doubles', 'Dealt 5 or more doubles? Before the first tile you may call a reshuffle — or play on. Not offered in partner games.'],
  ] },
  { id: 'dekabess', title: 'Dekabess & Vyèj', body: [
    ['Dekabess', 'Go out with a tile — not a double — whose two halves match BOTH open ends of the chain at once. It counts as 2 wins.'],
    ['Your streak', 'Each round you win adds 1 to your streak (2 for a Dekabess). If someone else wins a round, their own streak starts and yours is gone.'],
    ['Vyèj', 'Reach a streak of 4 to win the match. In Asosyé, partners share one streak.'],
  ] },
  { id: 'modes', title: 'Game modes', body: [
    ['Chien Manjé Chien', 'Every player for themselves — 2, 3 or 4 players.'],
    ['Asosyé', 'Partners, two teams of 2. Your partner sits across from you, and your team shares one streak.'],
    ['Against the computer', 'Solo vs AI and Asosyé vs AI play on your device, even offline. Expert AIs are unlocked through Story Mode.'],
    ['Practice', 'Try things out — nothing counts toward stats or records.'],
  ] },
  { id: 'online', title: 'Playing online', body: [
    ['Rooms', 'Create a room and share its code or invite link, or join a friend’s. The host picks the mode and can add bots to empty seats.'],
    ['The clock', 'Each turn has 2 minutes. If time runs out — or a player drops out — a bot can take their seat so the game carries on.'],
    ['What counts', 'Stats, trophies and Goud count for games against people or expert AIs — not against regular bots.'],
  ] },
  { id: 'goud', title: 'Goud', body: [
    ['Earning', 'Start with 500, plus 50 every day. Win a round against people or expert AIs: 25 (100 with a Dekabess), plus 50 for winning the match. Trophies pay 100 to 1,000. The weekly Challenge pays 500 and Wa Tab La 1,000.'],
    ['Spending', 'Buy tiles and tables in the shop on the Skins page. Goud is earned only — it can never be bought or cashed out.'],
  ] },
  { id: 'challenge', title: 'Weekly Challenge', body: [
    ['Every week', 'A new challenge against expert AIs, in a different format each week: Solo, 3-player, 1-on-1 or Team.'],
    ['Three tries', 'You get 3 tries a week. A try is used when the game opens; leaving counts as a used try.'],
    ['Winning', 'Win the match to a Vyèj. The prize is that week’s table, plus 500 Goud.'],
    ['Team weeks', 'You and a partner vs two experts. Create the room and send the link to anyone. Everyone with a try left uses one; anyone else helps.'],
  ] },
  { id: 'watabla', title: 'Wa Tab La', body: [
    ['King of the table', 'Each week, players are ranked by matches won — on a Solo board and a Teams board. Games against people or expert AIs count.'],
    ['The prize', 'The week’s #1 on each board wins that week’s prize table and 1,000 Goud. A tie for #1? Everyone at the top wins.'],
  ] },
  { id: 'tournament', title: 'Tournaments', body: [
    ['How it works', 'Teams enter, a bracket is drawn, and matches are played round by round until a champion is left. You need an account to take part.'],
    ['Winning a match', 'Win by Vyèj. Win 3 rounds straight and then lose one, and your team is out.'],
    ['Watching', 'Anyone can watch a match in progress. Spectators see how many tiles each player holds — and everyone’s tiles once a round is over.'],
  ] },
  { id: 'story', title: 'Story Mode', body: [
    ['Chapters', 'Work through chapters of puzzles and matches against characters with their own styles. Each chapter is passed by completing all of its challenges.'],
    ['Experts', 'Beating chapters unlocks expert AIs to play with elsewhere. From chapter 10 on, the matches are against experts — and pay Goud.'],
  ] },
  { id: 'skins', title: 'Skins & the shop', body: [
    ['Tiles and tables', 'Change how your dominoes and table look. Many unlock by earning trophies; prize tables come from the weekly Challenge and Wa Tab La.'],
    ['The shop', 'The Zodiac collection is sold for Goud: tables 5,000, tile sets 2,500. Gemini and Libra tables have a Female / Male switch.'],
    ['In multiplayer', 'Everyone at a room sees the host’s table.'],
  ] },
]

// The ⓘ button: opens the guide at a section
export function InfoButton({ section = 'basics', label = 'How to play', style }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="guide-i" aria-label={label} title={label} style={style} onClick={() => setOpen(true)}>i</button>
      {open && <GameGuide start={section} onClose={() => setOpen(false)} />}
    </>
  )
}

export default function GameGuide({ start = 'basics', onClose }) {
  const [at, setAt] = useState(start)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const sec = GUIDE.find(s => s.id === at) || GUIDE[0]
  return (
    <div className="guide-back" onClick={onClose}>
      <div className="guide" role="dialog" aria-modal="true" aria-label="Game guide" onClick={e => e.stopPropagation()}>
        <div className="guide-head">
          <h2>Game Guide</h2>
          <button className="guide-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="guide-tabs">
          {GUIDE.map(s => <button key={s.id} className={s.id === sec.id ? 'on' : ''} onClick={() => setAt(s.id)}>{s.title}</button>)}
        </div>
        <div className="guide-body">
          <h3>{sec.title}</h3>
          {sec.body.map(([h, t]) => (
            <div key={h} className="guide-item"><div className="guide-item-h">{h}</div><p>{t}</p></div>
          ))}
        </div>
      </div>
    </div>
  )
}
