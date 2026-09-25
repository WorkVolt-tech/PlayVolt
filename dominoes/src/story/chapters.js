// ── Story Mode — chapter configuration ───────────────────────────────────────
//
// A chapter is DATA. It never contains game logic: it only describes what to
// set up. The existing engine plays it — same placeTile, same endRound, same
// rules as live multiplayer.
//
// CHALLENGE TYPES
//
//   { type: 'match', ... }   a normal game
//       seats      4 (default) or 2
//       pile       true for 1v1 with a draw pile (2 seats only)
//       opponents  bot names, seated clockwise from the player
//       partner    'pick' | a bot name | null   (4 seats only; seat 2)
//       rounds     1 (default) or 3 for a boss match
//
//   { type: 'puzzle', ... }  a fixed position with a stated goal
//       deal       { hands: [[...], ...], board: [...], turn: 0 }
//       objective  see OBJECTIVES below
//       moves      optional cap — "solve it in at most N moves"
//
// OBJECTIVES
//   'win'         empty your hand first
//   'dekabess'    go out on a tile matching BOTH ends
//   'block'       jam the round while holding the fewest pips
//   'forcePass'   make a named opponent knock (count: n)
//
// STARS
//   3 = met the objective within `moves`
//   2 = met the objective
//   1 = finished but missed the objective
//
// UNLOCKING
//   Completing a chapter unlocks its featured bot for free play, partner
//   selection and later chapters. A chapter's featured bot can never be the
//   player's partner inside its own chapter.

export const NORMAL_CIRCUIT = [
  'Ti-Bebe', 'Ti-Sak', 'Ti-Pridan', 'Ti-Cam',
  'Ti-Jean', 'Ti-Djo', 'Ti-Mèt', 'Ti-Doub',
]

export const EXPERT_CIRCUIT = [
  'Ti-Jòj', 'Ti-Tid', 'Ti-Roro', 'Ti-Chasè',
  'Ti-Frè', 'Ti-Chaj', 'Ti-Pyèj', 'Ti-Wa',
]

export const CHAPTERS = [
  {
    id: 1,
    tier: 'normal',
    featured: 'Ti-Bebe',
    title: 'Premye Kou',
    theme: 'Placing tiles, reading the two ends',
    unlocks: 'Ti-Bebe',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Bebe'],
        rounds: 1,
        brief: 'Just the two of you. Seven tiles each — draw from the pile when you cannot play.',
      },
      {
        id: 2,
        type: 'puzzle',
        brief: 'Three tiles, three moves. Steer both ends so your last tile closes on both.',
        objective: { kind: 'dekabess' },
        moves: 3,
        deal: {
          // seat 0 = you. Board reads 1-6 6-4, so the ends are 1 and 4.
          // 1-2 on the left makes it 2; 4-5 on the right makes it 5;
          // 2-5 then matches BOTH ends and empties your hand — Dekabess.
          hands: [
            [[1, 2], [4, 5], [2, 5]],
            [[0, 0], [3, 3]],
            [[0, 1], [3, 5]],
            [[6, 6], [0, 2]],
          ],
          board: [
            { tile: [1, 6], flipped: false },
            { tile: [6, 4], flipped: false },
          ],
          left_end: 1,
          right_end: 4,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Bebe', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table. Three of them, all still learning.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Bebe'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Beat him twice and he joins your table.',
      },
    ],
  },

  // Chapters 2-8 follow the same shape, in measured difficulty order.
  // Listed here so the story map can render them locked.
  { id: 2, tier: 'normal', featured: 'Ti-Sak',    title: 'Sak La',        theme: 'Doubles — he hoards them',            unlocks: 'Ti-Sak',    challenges: [] },
  { id: 3, tier: 'normal', featured: 'Ti-Pridan', title: 'Konte Pwen',    theme: 'Pip counting — he sheds the weight',  unlocks: 'Ti-Pridan', challenges: [] },
  { id: 4, tier: 'normal', featured: 'Ti-Cam',    title: 'Chans',         theme: 'Dekabess — he hunts it',              unlocks: 'Ti-Cam',    challenges: [] },
  { id: 5, tier: 'normal', featured: 'Ti-Jean',   title: 'Bloke',         theme: 'Blocking',                            unlocks: 'Ti-Jean',   challenges: [] },
  { id: 6, tier: 'normal', featured: 'Ti-Djo',    title: 'Estrateji',     theme: 'Balanced play',                       unlocks: 'Ti-Djo',    challenges: [] },
  { id: 7, tier: 'normal', featured: 'Ti-Mèt',    title: 'Mèt Nimewo',    theme: 'Owning a number',                     unlocks: 'Ti-Mèt',    challenges: [] },
  { id: 8, tier: 'normal', featured: 'Ti-Doub',   title: 'Doub Rapid',    theme: 'Doubles played fast',                 unlocks: 'Ti-Doub',   challenges: [] },

  { id: 9, tier: 'qualifier', featured: null, title: 'Kalifikasyon', theme: 'Everything so far', unlocks: null, challenges: [] },

  { id: 10, tier: 'expert', featured: 'Ti-Jòj',   title: 'Mèt La',      theme: 'Pure winning',              unlocks: 'Ti-Jòj',   challenges: [] },
  { id: 11, tier: 'expert', featured: 'Ti-Tid',   title: 'Mèt Doub',    theme: 'Doubles held back',         unlocks: 'Ti-Tid',   challenges: [] },
  { id: 12, tier: 'expert', featured: 'Ti-Roro',  title: 'Fèmen Tab',   theme: 'Blocking on pips',          unlocks: 'Ti-Roro',  challenges: [] },
  { id: 13, tier: 'expert', featured: 'Ti-Chasè', title: 'Kontwòl',     theme: 'Controlling the ends',      unlocks: 'Ti-Chasè', challenges: [] },
  { id: 14, tier: 'expert', featured: 'Ti-Frè',   title: 'Asosye',      theme: 'Partner play',              unlocks: 'Ti-Frè',   challenges: [] },
  { id: 15, tier: 'expert', featured: 'Ti-Chaj',  title: 'Konte',       theme: 'Killing numbers',           unlocks: 'Ti-Chaj',  challenges: [] },
  { id: 16, tier: 'expert', featured: 'Ti-Pyèj',  title: 'Pyèj',        theme: 'Traps and knock chains',    unlocks: 'Ti-Pyèj',  challenges: [] },
  { id: 17, tier: 'expert', featured: 'Ti-Wa',    title: 'Li Tab La',   theme: 'Reading the table',         unlocks: 'Ti-Wa',    challenges: [] },

  { id: 18, tier: 'final', featured: 'Ti-Wa', title: 'Chanpyona', theme: 'The championship', unlocks: null, challenges: [] },
]

// A bot is available as a partner or free-play opponent once its chapter is
// done — except the featured bot of the chapter being played.
export function availableBots(progress, chapter) {
  const unlocked = progress?.unlocked_bots || []
  return unlocked.filter(b => b !== chapter?.featured)
}
