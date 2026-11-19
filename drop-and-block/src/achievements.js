// Names and rarity are presentation-only. The database is the trophy authority.
// Codes must match migration 006_trophies_leaderboard.sql.
export const TROPHIES = [
 {code:'first_match',title:'First Drop',icon:'🎮',tier:'Bronze',description:'Finish your first online Drop & Block match.'},
 {code:'first_win',title:'Line Breaker',icon:'🏆',tier:'Bronze',description:'Win your first online match.'},
 {code:'classic_win',title:'Four the Win',icon:'🔴',tier:'Bronze',description:'Win a Classic match.'},
 {code:'chaos_win',title:'Chaos Commander',icon:'⚡',tier:'Silver',description:'Win a match using Chaos rules.'},
 {code:'territory_win',title:'Territory Titan',icon:'🗺️',tier:'Silver',description:'Win a Territory match.'},
 {code:'collapse_win',title:'Floor Survivor',icon:'🧱',tier:'Silver',description:'Win a Bottom Drop match.'},
 {code:'elimination_win',title:'Last One Standing',icon:'💀',tier:'Silver',description:'Survive and win an Elimination match.'},
 {code:'party_win',title:'Crowd Controller',icon:'🎉',tier:'Gold',description:'Win an online match with at least four players.'},
 {code:'team_win',title:'Teamwork Triumph',icon:'🤝',tier:'Silver',description:'Win Team Battle as a member of the winning team.'},
 {code:'wins_5',title:'Five Alive',icon:'✋',tier:'Silver',description:'Win five online matches.'},
 {code:'streak_3',title:'Triple Threat',icon:'🔥',tier:'Gold',description:'Win three online matches consecutively.'},
 {code:'wins_20',title:'Block Royalty',icon:'👑',tier:'Gold',description:'Win twenty online matches.'},
 {code:'five_modes',title:'Five-Mode Master',icon:'💎',tier:'Platinum',description:'Win in five different game modes.'},
];
export const TROPHY_BY_CODE = Object.fromEntries(TROPHIES.map(t=>[t.code,t]));
export const MODES = [
 {value:'all',label:'All modes'},
 {value:'classic',label:'Classic'},
 {value:'territory',label:'Territory'},
 {value:'elimination',label:'Elimination'},
 {value:'collapse',label:'Bottom Drop'},
 {value:'chaos',label:'Chaos'},
 {value:'team',label:'Team Battle'},
];
