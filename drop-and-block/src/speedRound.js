// Pure presentation guard; server timestamps, room locks and unique keys
// enforce actual synchronized GO and one drop per player per round.
export function speedRoundState(game,seat){
 const isSpeed=game?.mode==='speed';
 const players=Array.isArray(game?.players)?game.players:[];
 const allowed=new Set(players.map(p=>p.seat));
 const submitted=new Set((Array.isArray(game?.speedPlayedSeats)?game.speedPlayedSeats:[])
  .filter(n=>Number.isInteger(n)&&allowed.has(n)));
 function orderedRows(rows){
   if(!Array.isArray(rows))return [];
   const seen=new Set();
   return rows.filter(row=>{
     if(!row||!Number.isInteger(row.seat)||!allowed.has(row.seat)||
       !Number.isInteger(row.place)||row.place<1||row.place>players.length||
       seen.has(row.seat))return false;
     seen.add(row.seat);return true;
   }).sort((a,b)=>a.place-b.place);
 }
 const currentOrder=orderedRows(game?.speedOrder);
 const previousOrder=orderedRows(game?.speedPreviousOrder);
 const positionBySeat=new Map(currentOrder.map(row=>[row.seat,row.place]));
 const alreadyPlayed=submitted.has(seat);
 const canSubmit=isSpeed&&game?.status==='playing'&&allowed.has(seat)&&!alreadyPlayed;
 return {isSpeed,submitted,alreadyPlayed,canSubmit,playedCount:submitted.size,
  playerCount:players.length,round:Number(game?.roundNumber)||1,
  currentOrder,previousOrder,positionBySeat};
}
