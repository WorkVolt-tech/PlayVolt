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
  {
    id: 2,
    tier: 'normal',
    featured: 'Ti-Sak',
    title: 'Sak La',
    theme: "He keeps his doubles back. Make him pay for the weight he's carrying.",
    unlocks: 'Ti-Sak',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Sak'],
        rounds: 1,
        brief: "He keeps his doubles back. Make him pay for the weight he's carrying.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Three tiles left. One order empties your hand on both ends at once.",
        objective: { kind: 'dekabess' },
        moves: 3,
        deal: {
          hands: [[[5, 6], [2, 4], [4, 5]], [[6, 6], [0, 5]], [[1, 5], [1, 3]], [[2, 2], [0, 3]]],
          board: [
            { tile: [2, 5], flipped: false },
            { tile: [3, 5], flipped: false },
            { tile: [3, 6], flipped: false }
          ],
          left_end: 2,
          right_end: 6,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Sak', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Sak across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Sak'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Sak joins your table.',
      },
    ],
  },
  {
    id: 3,
    tier: 'normal',
    featured: 'Ti-Pridan',
    title: 'Konte Pwen',
    theme: "He sheds his heavy tiles early. If the table jams, he'll be holding almost nothing.",
    unlocks: 'Ti-Pridan',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Pridan'],
        rounds: 1,
        brief: "He sheds his heavy tiles early. If the table jams, he'll be holding almost nothing.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Three tiles, three moves. Get them all down before he stops you.",
        objective: { kind: 'win' },
        moves: 3,
        deal: {
          hands: [[[2, 6], [1, 2], [4, 6]], [[1, 1], [0, 1]], [[0, 2], [3, 6]], [[1, 5], [5, 5]]],
          board: [
            { tile: [4, 5], flipped: false },
            { tile: [0, 5], flipped: false },
            { tile: [0, 3], flipped: false },
            { tile: [3, 4], flipped: false }
          ],
          left_end: 4,
          right_end: 4,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Pridan', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Pridan across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Pridan'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Pridan joins your table.',
      },
    ],
  },
  {
    id: 4,
    tier: 'normal',
    featured: 'Ti-Cam',
    title: 'Chans',
    theme: "He hunts the Dekabess. Close the ends he needs.",
    unlocks: 'Ti-Cam',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Cam'],
        rounds: 1,
        brief: "He hunts the Dekabess. Close the ends he needs.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Four tiles. Steer the ends so your last one closes on both.",
        objective: { kind: 'dekabess' },
        moves: 4,
        deal: {
          hands: [[[3, 4], [4, 6], [0, 6], [2, 3]], [[4, 5], [2, 4]], [[4, 4], [5, 5]], [[6, 6], [1, 2]]],
          board: [
            { tile: [0, 5], flipped: false },
            { tile: [2, 5], flipped: false },
            { tile: [2, 2], flipped: false }
          ],
          left_end: 0,
          right_end: 2,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Cam', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Cam across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Cam'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Cam joins your table.',
      },
    ],
  },
  {
    id: 5,
    tier: 'normal',
    featured: 'Ti-Jean',
    title: 'Bloke',
    theme: "He squeezes your options. Keep a way out.",
    unlocks: 'Ti-Jean',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Jean'],
        rounds: 1,
        brief: "He squeezes your options. Keep a way out.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Four tiles and one way through. Find the order.",
        objective: { kind: 'win' },
        moves: 4,
        deal: {
          hands: [[[3, 6], [3, 3], [3, 5], [4, 5]], [[5, 5], [2, 2]], [[0, 5], [4, 4]], [[4, 6], [0, 0]]],
          board: [
            { tile: [0, 2], flipped: false },
            { tile: [1, 2], flipped: false },
            { tile: [0, 1], flipped: false },
            { tile: [0, 4], flipped: false }
          ],
          left_end: 0,
          right_end: 4,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Jean', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Jean across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Jean'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Jean joins your table.',
      },
    ],
  },
  {
    id: 6,
    tier: 'normal',
    featured: 'Ti-Djo',
    title: 'Estrateji',
    theme: "No weakness to exploit \u2014 he simply plays well.",
    unlocks: 'Ti-Djo',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Djo'],
        rounds: 1,
        brief: "No weakness to exploit \u2014 he simply plays well.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Four tiles. The finish is there — the ends have to be set up first.",
        objective: { kind: 'dekabess' },
        moves: 4,
        deal: {
          hands: [[[2, 2], [2, 3], [4, 6], [2, 6]], [[5, 6], [1, 6]], [[3, 4], [3, 6]], [[3, 3], [0, 1]]],
          board: [
            { tile: [4, 5], flipped: false },
            { tile: [2, 5], flipped: false },
            { tile: [0, 2], flipped: false },
            { tile: [0, 0], flipped: false },
            { tile: [0, 3], flipped: false }
          ],
          left_end: 4,
          right_end: 3,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Djo', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Djo across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Djo'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Djo joins your table.',
      },
    ],
  },
  {
    id: 7,
    tier: 'normal',
    featured: 'Ti-Mèt',
    title: 'Mèt Nimewo',
    theme: "He picks a number and owns it. Take it away from him.",
    unlocks: 'Ti-Mèt',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Mèt'],
        rounds: 1,
        brief: "He picks a number and owns it. Take it away from him.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Four tiles, no room for error. Empty your hand.",
        objective: { kind: 'win' },
        moves: 4,
        deal: {
          hands: [[[0, 4], [0, 1], [3, 4], [1, 2]], [[3, 6], [1, 4]], [[4, 4], [2, 4]], [[1, 6], [1, 1]]],
          board: [
            { tile: [3, 5], flipped: false },
            { tile: [5, 5], flipped: false },
            { tile: [5, 6], flipped: false },
            { tile: [2, 6], flipped: false },
            { tile: [2, 3], flipped: false }
          ],
          left_end: 3,
          right_end: 3,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Mèt', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Mèt across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Mèt'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Mèt joins your table.',
      },
    ],
  },
  {
    id: 8,
    tier: 'normal',
    featured: 'Ti-Doub',
    title: 'Doub Rapid',
    theme: "He dumps every double the moment he can. Punish the gaps that leaves.",
    unlocks: 'Ti-Doub',
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Doub'],
        rounds: 1,
        brief: "He dumps every double the moment he can. Punish the gaps that leaves.",
      },
      {
        id: 2,
        type: 'puzzle',
        brief: "Five tiles. The longest finish yet, and it ends on both ends.",
        objective: { kind: 'dekabess' },
        moves: 5,
        deal: {
          hands: [[[2, 2], [0, 3], [2, 3], [4, 6], [2, 6]], [[5, 6], [1, 6]], [[3, 4], [3, 6]], [[3, 3], [0, 1]]],
          board: [
            { tile: [4, 5], flipped: false },
            { tile: [2, 5], flipped: false },
            { tile: [0, 2], flipped: false },
            { tile: [0, 0], flipped: false }
          ],
          left_end: 4,
          right_end: 0,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Doub', 'Ti-Bebe', 'Ti-Bebe'],
        rounds: 1,
        brief: 'A full table, with Ti-Doub across from you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Doub'],
        rounds: 3,
        boss: true,
        brief: 'Best of three. Win it and Ti-Doub joins your table.',
      },
    ],
  },

  {
    id: 9,
    tier: 'qualifier',
    featured: null,
    title: 'Kalifikasyon',
    theme: 'Everything the circuit taught you, in one sitting',
    unlocks: null,
    challenges: [
      {
        id: 1,
        type: 'match',
        seats: 2,
        pile: true,
        opponents: ['Ti-Doub'],
        rounds: 1,
        brief: 'The strongest of the circuit, one on one.',
      },
      {
        id: 2,
        type: 'puzzle',
        brief: 'Nobody can move much. Jam it shut while you hold the least.',
        objective: { kind: 'block' },
        moves: 1,
        deal: {
          hands: [
            [[1, 2], [1, 4], [0, 1]],
            [[5, 5], [1, 1]],
            [[2, 4], [2, 5]],
            [[1, 3], [4, 4]],
          ],
          board: [
            { tile: [0, 0], flipped: false },
            { tile: [0, 6], flipped: false },
            { tile: [5, 6], flipped: false },
            { tile: [1, 5], flipped: false },
          ],
          left_end: 0,
          right_end: 1,
          turn: 0,
        },
      },
      {
        id: 3,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Jean', 'Ti-Mèt'],
        partner: 'pick',
        rounds: 1,
        brief: 'Pick a partner you have earned. Two of the circuit against the two of you.',
      },
      {
        id: 4,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Djo', 'Ti-Mèt', 'Ti-Doub'],
        rounds: 1,
        brief: 'Three of them, each playing for themselves.',
      },
      {
        id: 5,
        type: 'match',
        seats: 4,
        opponents: ['Ti-Djo', 'Ti-Jean', 'Ti-Doub'],
        coop: true,
        rounds: 3,
        boss: true,
        brief: 'They are working together now. Best of three — win it and the Expert Circuit opens.',
      },
    ],
  },

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
