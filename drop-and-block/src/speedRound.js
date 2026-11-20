// Pure presentation guard; the server's unique key and room-row locking
// enforce the real one-chip-per-account-per-round rule.
export function speedRoundState(game,seat){
 const isSpeed=game?.mode==='speed';
 const players=Array.isArray(game?.players)?game.players:[];
 const allowed=new Set(players.map(p=>p.seat));
 const submitted=new Set((Array.isArray(game?.speedPlayedSeats)?game.speedPlayedSeats:[])
  .filter(n=>Number.isInteger(n)&&allowed.has(n)));
 const alreadyPlayed=submitted.has(seat);
 const canSubmit=isSpeed&&game?.status==='playing'&&allowed.has(seat)&&!alreadyPlayed;
 return {isSpeed,submitted,alreadyPlayed,canSubmit,playedCount:submitted.size,
    playerCount:players.length,round:Number(game?.roundNumber)||1};
}
