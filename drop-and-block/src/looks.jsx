import React from 'react';
import {MARKS,AVATARS,safeBoard,safeChip,safeAvatar} from './looksData.js';
export {MARKS,AVATARS,safeBoard,safeChip,safeAvatar} from './looksData.js';
export function AvatarBadge({id='sentinel',small=false}) {
 const key=safeAvatar(id);
 return <span className={'avatar-badge av-'+key+(small?' avatar-small':'')} aria-label={'Avatar '+key}>{AVATARS[key]}</span>;
}
export function ChipDisc({seat=0,style='round',teamMode=false,compact=false}) {
 const n=Number(seat)||0;
 return <span className={'disc '+(n?'seat-'+n:'empty')+(n>=1&&n<=8?' shape-'+safeChip(style):'')+
 (teamMode&&n>=1&&n<=8?' team-ring-'+(n%2?1:2):'')+(compact?' compact-disc':'')}
 aria-label={n===9?'Neutral barrier':n?'Player '+n+', '+safeChip(style)+' chip':'Empty'}>
 {n?MARKS[n]||'':''}
 </span>;
}
const SAMPLE=[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,1,2,3,0,0,2,1,3,1,2,4,0];
export function BoardLookPreview({board='deep-navy',chip='round',avatar='sentinel'}) {
 return <div className="look-preview">
  <div className="look-preview-heading"><AvatarBadge id={avatar}/><div><strong>YOUR PLAYER LOOK</strong><small>Changes instantly as you select</small></div></div>
  <div className={'board look-demo-board board-theme-'+safeBoard(board)} style={{gridTemplateColumns:'repeat(7,minmax(0,1fr))'}}>
   {SAMPLE.map((seat,i)=><div className="board-cell" key={i}><ChipDisc seat={seat} style={seat===1?chip:'round'}/></div>)}
  </div>
  <small className="look-preview-foot">Your board · Your avatar · Your chip style</small>
 </div>;
}
