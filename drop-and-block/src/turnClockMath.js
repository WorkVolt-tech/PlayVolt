export const TURN_SECONDS=60;
export function secondsLeft(deadline,serverNow) {
 if(!deadline||!serverNow)return null;
 const a=Date.parse(deadline),b=Date.parse(serverNow);
 if(!Number.isFinite(a)||!Number.isFinite(b))return null;
 return Math.max(0,Math.min(TURN_SECONDS,Math.ceil((a-b)/1000)));
}
export function clockText(seconds) {
 if(seconds===null)return '--:--';
 const safe=Math.max(0,Math.floor(seconds));
 return String(Math.floor(safe/60)).padStart(2,'0')+':'+String(safe%60).padStart(2,'0');
}
