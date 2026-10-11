// ── Trophies ─────────────────────────────────────────────────────────────────
// Every trophy: its Kreyòl name, what that name literally means, what earns
// it (in English), its tier (bronze, silver, gold, platinum), and what it unlocks. Trophies are how skins are
// earned — skins.js builds each skin's unlock rule from this list — and the
// earned ones are shown as badges of honour on your profile.
//
// s = the player's stats:
//   { games, vyej, dekabess, tournaments, chapters: [ids], cleanRounds, comebacks,
//     fiveDoubles, fiveDoublesWon }

const ch = n => s => (s.chapters || []).includes(n)

export const TROPHY_GROUPS = [
  { id: 'start',   label: 'Getting started' },
  { id: 'wins',    label: 'Matches won' },
  { id: 'played',  label: 'Matches played' },
  { id: 'dek',     label: 'Dekabess' },
  { id: 'clean',   label: 'Clean rounds' },
  { id: 'comeback',label: 'Comebacks' },
  { id: 'doubles', label: 'Five doubles' },
  { id: 'cups',    label: 'Tournaments' },
  { id: 'story',   label: 'Story Mode' },
]

export const TROPHIES = [
  // Getting started
  { id: 'premye-chez',     group: 'start', tier: 'bronze', kreyol: 'Premye Chèz',     meaning: 'First chair',            desc: 'Play your first match',               test: s => s.games >= 1,       rewards: { tiles: ['kafe'] } },
  { id: 'premye-vyej',     group: 'start', tier: 'bronze', kreyol: 'Premye Vyèj',     meaning: 'First Vyèj',             desc: 'Win your first match',                test: s => s.vyej >= 1,        rewards: { tiles: ['ruby'] } },
  { id: 'premye-dekabess', group: 'start', tier: 'bronze', kreyol: 'Premye Dekabess', meaning: 'First Dekabess',         desc: 'Score your first Dekabess',           test: s => s.dekabess >= 1,    rewards: { tiles: ['kanaval'] } },
  // Matches won
  { id: 'konkiran',  group: 'wins', tier: 'bronze', kreyol: 'Konkiran',  meaning: 'Competitor',          desc: 'Win 3 matches',  test: s => s.vyej >= 3,  rewards: { tiles: ['amethyst'], tables: ['purple'] } },
  { id: 'abitye',    group: 'wins', tier: 'silver', kreyol: 'Abitye',    meaning: 'Used to it',          desc: 'Win 5 matches',  test: s => s.vyej >= 5,  rewards: { tiles: ['usa'], tables: ['usa', 'burgundy'] } },
  { id: 'ansyen',    group: 'wins', tier: 'silver', kreyol: 'Ansyen',    meaning: 'Old hand',            desc: 'Win 10 matches', test: s => s.vyej >= 10, rewards: { tiles: ['quebec'], tables: ['quebec'] } },
  { id: 'chanpyon',  group: 'wins', tier: 'silver', kreyol: 'Chanpyon',  meaning: 'Champion',            desc: 'Win 15 matches', test: s => s.vyej >= 15, rewards: { tiles: ['jamaica'] } },
  { id: 'lejann',    group: 'wins', tier: 'gold',   kreyol: 'Lejann',    meaning: 'Legend',              desc: 'Win 20 matches', test: s => s.vyej >= 20, rewards: { tiles: ['fuchsia'] } },
  { id: 'met-tab',   group: 'wins', tier: 'platinum',   kreyol: 'Mèt Tab',   meaning: 'Master of the table', desc: 'Win 25 matches', test: s => s.vyej >= 25, rewards: { tables: ['jamaica'] } },
  // Matches played
  { id: 'chofe-chez',  group: 'played', tier: 'bronze', kreyol: 'Chofe Chèz',  meaning: 'Warming the chair',  desc: 'Play 10 matches',  test: s => s.games >= 10,  rewards: { tables: ['pink'] } },
  { id: 'figi-konnen', group: 'played', tier: 'bronze', kreyol: 'Figi Konnen', meaning: 'A known face',       desc: 'Play 25 matches',  test: s => s.games >= 25,  rewards: { tiles: ['neonGreen'] } },
  { id: 'pye-tab',     group: 'played', tier: 'silver', kreyol: 'Pye Tab',     meaning: 'Table leg',          desc: 'Play 50 matches',  test: s => s.games >= 50,  rewards: { tiles: ['france'] } },
  { id: 'moun-lakay',  group: 'played', tier: 'silver', kreyol: 'Moun Lakay',  meaning: 'One of the family',  desc: 'Play 75 matches',  test: s => s.games >= 75,  rewards: { tiles: ['neonPink'], tables: ['lakou'] } },
  { id: 'san-match',   group: 'played', tier: 'platinum',   kreyol: 'San Match',   meaning: 'A hundred matches',  desc: 'Play 100 matches', test: s => s.games >= 100, rewards: { tiles: ['playvolt'], tables: ['playvolt'] } },
  // Dekabess
  { id: 'twa-kou',        group: 'dek', tier: 'bronze', kreyol: 'Twa Kou',              meaning: 'Three blows',             desc: 'Score 3 Dekabess',  test: s => s.dekabess >= 3,  rewards: { tiles: ['sunset'] } },
  { id: 'tire',           group: 'dek', tier: 'silver', kreyol: 'Tirè',                 meaning: 'Shooter',                 desc: 'Score 5 Dekabess',  test: s => s.dekabess >= 5,  rewards: { tiles: ['neonOrange'] } },
  { id: 'met-dekabess',   group: 'dek', tier: 'silver', kreyol: 'Mèt Dekabess',         meaning: 'Master of the Dekabess',  desc: 'Score 10 Dekabess', test: s => s.dekabess >= 10, rewards: { tiles: ['trinidad'] } },
  { id: 'kanpe-tout-moun',group: 'dek', tier: 'gold',   kreyol: 'Kanpe Tout Moun',      meaning: 'Stops everyone',          desc: 'Score 15 Dekabess', test: s => s.dekabess >= 15, rewards: { tables: ['neon'] } },
  { id: 'pesonn-pa-touche',group:'dek', tier: 'platinum',   kreyol: 'Pèsonn Pa Ka Touche',  meaning: 'No one can touch you',    desc: 'Score 25 Dekabess', test: s => s.dekabess >= 25, rewards: { tiles: ['glow'] } },
  // Clean rounds — won without knocking once
  { id: 'men-pwop',      group: 'clean', tier: 'bronze', kreyol: 'Men Pwòp',      meaning: 'Clean hands',     desc: 'Win a round without knocking',      test: s => (s.cleanRounds || 0) >= 1,  rewards: { tiles: ['pearl'] } },
  { id: 'pa-janm-frape', group: 'clean', tier: 'silver', kreyol: 'Pa Janm Frape', meaning: 'Never knocks',    desc: 'Win 10 rounds without knocking',    test: s => (s.cleanRounds || 0) >= 10, rewards: { tiles: ['obsidian'] } },
  { id: 'san-frape',     group: 'clean', tier: 'platinum',   kreyol: 'San Frape',     meaning: 'Without a knock', desc: 'Win 25 rounds without knocking',    test: s => (s.cleanRounds || 0) >= 25, rewards: { tiles: ['krisal'], tables: ['krisal'] } },
  // Comebacks — won the match after the other side reached a streak of 3
  { id: 'remonte',       group: 'comeback', tier: 'silver', kreyol: 'Remonte',       meaning: 'Climbed back',        desc: 'Win a match after being down 0–3',  test: s => (s.comebacks || 0) >= 1, rewards: { tiles: ['phoenix'] } },
  { id: 'leve-kanpe',    group: 'comeback', tier: 'gold',   kreyol: 'Leve Kanpe',    meaning: 'Back on your feet',   desc: 'Come back from 0–3 three times',    test: s => (s.comebacks || 0) >= 3, rewards: { tables: ['kanaval'] } },
  { id: 'pa-janm-mouri', group: 'comeback', tier: 'platinum',   kreyol: 'Pa Janm Mouri', meaning: 'Never dies',          desc: 'Come back from 0–3 five times',     test: s => (s.comebacks || 0) >= 5, rewards: { tables: ['phoenix'] } },
  // Five doubles — dealt 5 or more doubles, and you played the round anyway
  // instead of calling a reshuffle (not in partner games)
  { id: 'pa-pe-doub',       group: 'doubles', tier: 'silver', kreyol: 'Pa Pè Doub',       meaning: 'Not afraid of doubles', desc: 'Play a round dealt 5 or more doubles, without reshuffling', test: s => (s.fiveDoubles || 0) >= 1,    rewards: { tiles: ['bone'] } },
  { id: 'doub-pa-bat-mwen', group: 'doubles', tier: 'gold',   kreyol: 'Doub Pa Bat Mwen', meaning: "Doubles can't beat me", desc: 'Win a round dealt 5 or more doubles',                       test: s => (s.fiveDoublesWon || 0) >= 1, rewards: { tiles: ['royal'] } },
  // Tournaments
  { id: 'premye-koup', group: 'cups', tier: 'gold', kreyol: 'Premye Koup', meaning: 'First cup',   desc: 'Win a tournament',  test: s => s.tournaments >= 1, rewards: { tiles: ['gold'], tables: ['haiti'] } },
  { id: 'twa-koup',    group: 'cups', tier: 'gold', kreyol: 'Twa Koup',    meaning: 'Three cups',  desc: 'Win 3 tournaments', test: s => s.tournaments >= 3, rewards: { tiles: ['dominican'] } },
  { id: 'dinasti',     group: 'cups', tier: 'platinum', kreyol: 'Dinasti',     meaning: 'Dynasty',     desc: 'Win 5 tournaments', test: s => s.tournaments >= 5, rewards: { tiles: ['dekabess'], tables: ['dekabess'] } },
  // Story Mode — each named after its chapter
  { id: 'ch2',  group: 'story', tier: 'bronze', kreyol: 'Sak La',       meaning: 'The sack',            desc: 'Beat Story chapter 2',  test: ch(2),  rewards: { tiles: ['ocean'] } },
  { id: 'ch3',  group: 'story', tier: 'bronze', kreyol: 'Konte Pwen',   meaning: 'Counting points',     desc: 'Beat Story chapter 3',  test: ch(3),  rewards: { tiles: ['jade'] } },
  { id: 'ch4',  group: 'story', tier: 'bronze', kreyol: 'Chans',        meaning: 'Luck',                desc: 'Beat Story chapter 4',  test: ch(4),  rewards: { tables: ['ocean'] } },
  { id: 'ch6',  group: 'story', tier: 'silver', kreyol: 'Estrateji',    meaning: 'Strategy',            desc: 'Beat Story chapter 6',  test: ch(6),  rewards: { tables: ['slate'] } },
  { id: 'ch9',  group: 'story', tier: 'silver', kreyol: 'Kalifikasyon', meaning: 'Qualifying',          desc: 'Beat Story chapter 9',  test: ch(9),  rewards: { tiles: ['neonYellow'] } },
  { id: 'ch12', group: 'story', tier: 'gold',   kreyol: 'Fèmen Tab',    meaning: 'Closing the table',   desc: 'Beat Story chapter 12', test: ch(12), rewards: { tables: ['mahogany'] } },
  { id: 'ch15', group: 'story', tier: 'gold',   kreyol: 'Konte',        meaning: 'Counting',            desc: 'Beat Story chapter 15', test: ch(15), rewards: { tiles: ['neonBlue'] } },
  { id: 'istwa-fini', group: 'story', tier: 'platinum', kreyol: 'Istwa Fini', meaning: 'The story is done', desc: 'Beat Story chapter 18', test: ch(18), rewards: { tiles: ['marble'] } },
]

// ── Which games count toward trophies ────────────────────────────────────────
// Only games against humans and EXPERT bots. A regular bot anywhere at the
// table means the game doesn't count (Story Mode's chapter trophies are
// separate). A bot standing in for a player who dropped counts as that human.
export const EXPERT_BOT_NAMES = ['Ti-Jòj', 'Ti-Tid', 'Ti-Roro', 'Ti-Chasè', 'Ti-Frè', 'Ti-Chaj', 'Ti-Pyèj', 'Ti-Wa']
export function tableCountsForTrophies(players) {
  return (players || []).every(p => !p.is_ai || p.stand_in || EXPERT_BOT_NAMES.includes(p.nickname))
}
// Wa Tab La has no normal-bot exception, including bots standing in for humans.
export function tableCountsForLeaderboard(players, seats = 4) {
  return Array.isArray(players) && players.length === seats &&
    new Set(players.map(p => p.seat)).size === seats &&
    players.every(p => Number.isInteger(p.seat) && p.seat >= 0 && p.seat < seats &&
      ((!p.is_ai && !p.stand_in) || EXPERT_BOT_NAMES.includes(p.nickname)))
}
export function botsCountForTrophies(botNames) {
  return (botNames || []).every(n => EXPERT_BOT_NAMES.includes(n))
}

export function earnedTrophies(stats) {
  const s = stats || {}
  return new Set(TROPHIES.filter(t => t.test(s)).map(t => t.id))
}
