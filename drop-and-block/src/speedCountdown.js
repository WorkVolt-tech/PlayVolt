// Display only. Server-side speed_round_opens_at is the source of truth.
// Base animations on serverNow plus monotonic elapsed milliseconds, not Date.now.
export function speedStartPhase(opensAt,serverNow,elapsedMs=0) {
 const start=Date.parse(opensAt),now=Date.parse(serverNow);
 if(!Number.isFinite(start)||!Number.isFinite(now))return {phase:'active',count:0};
 const elapsed=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
 const ms=start-now-elapsed;
 if(ms>0)return {phase:'countdown',count:Math.min(3,Math.max(1,Math.ceil(ms/1000)))};
 if(ms> -950)return {phase:'go',count:0};
 return {phase:'active',count:0};
}
