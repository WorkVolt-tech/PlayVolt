import React from 'react';
// Lightweight decorative CSS particle field, not canvas or a physics engine.
const BITS=Array.from({length:28},(_,i)=>({
 left:(i*37+11)%98,
 drift:((i*29)%101)-50,
 delay:(i*47)%390,
 duration:1500+(i*83)%1000,
 angle:(i*43)%260-130,
 hue:(i*61)%360
}));
export function ArcadeConfetti({matchNumber=1,winnerSeat=0}){
 return <div className="arcade-confetti" key={matchNumber+'-'+winnerSeat}
   aria-hidden="true">
   {BITS.map((bit,i)=><i key={i} style={{
    '--confetti-x':bit.left+'%',
    '--confetti-drift':bit.drift+'px',
    '--confetti-delay':bit.delay+'ms',
    '--confetti-duration':bit.duration+'ms',
    '--confetti-rotate':bit.angle+'deg',
    '--confetti-hue':bit.hue
   }}/>)}
 </div>;
}
