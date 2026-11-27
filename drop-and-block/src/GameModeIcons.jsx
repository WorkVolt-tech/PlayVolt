import React from 'react';

// Standalone vector emblems: sharp at every phone resolution, no emoji/font dependency.
export const MODE_CHOICES=[
 {id:'classic',name:'Classic',subtitle:'Connect to win',tone:'coral'},
 {id:'speed',name:'Speed Round',subtitle:'Race to drop first',tone:'gold'},
 {id:'territory',name:'Territory',subtitle:'Capture more points',tone:'cyan'},
 {id:'elimination',name:'Elimination',subtitle:'Knock rivals out',tone:'red'},
 {id:'collapse',name:'Bottom Drop',subtitle:'The floor disappears',tone:'orange'},
 {id:'chaos',name:'Chaos',subtitle:'Barrier and Blast',tone:'violet'},
 {id:'gravity',name:'Gravity Shift',subtitle:'The board rearranges',tone:'mint',local:true},
 {id:'power',name:'Power-Up Arcade',subtitle:'Charge special abilities',tone:'yellow'},
 {id:'team',name:'Team Battle',subtitle:'Combine team chips',tone:'blue'}
];

export function GameModeIcon({mode,size=32,className=''}) {
 const shared={viewBox:'0 0 64 64',width:size,height:size,fill:'none',stroke:'currentColor',strokeWidth:4,
   strokeLinecap:'round',strokeLinejoin:'round',role:'img','aria-label':MODE_CHOICES.find(x=>x.id===mode)?.name||'Game mode',
   className:'game-mode-icon '+className};
 const marks={
  classic:<><circle cx="18" cy="46" r="8"/><circle cx="29" cy="35" r="8"/><circle cx="40" cy="24" r="8"/><circle cx="51" cy="13" r="8"/></>,
  speed:<><path d="M36 7 17 35h14l-5 22 23-33H34z" fill="currentColor" fillOpacity=".24"/><path d="M7 17h13M3 29h12M9 43h9"/></>,
  territory:<><path d="M12 15h40v35H12z"/><path d="M12 27h40M26 15v35M40 15v35"/><path d="M31 37h8m-4-4v8" strokeWidth="5"/><circle cx="19" cy="43" r="3" fill="currentColor" stroke="none"/></>,
  elimination:<><path d="M18 15 46 49M46 15 18 49" strokeWidth="7"/><path d="M23 7h18M23 57h18" strokeWidth="3"/></>,
  collapse:<><path d="M13 12h38M18 20h28M23 28h18M32 32v20m-9-9 9 9 9-9"/><path d="M10 57h44" strokeDasharray="6 5"/></>,
  chaos:<><path d="m32 5 5 16 16-8-7 16 14 9-17 3 3 17-14-11-13 11 2-17-17-4 15-8-7-16 16 8z" fill="currentColor" fillOpacity=".15"/><path d="M32 23v17M25 31h14"/></>,
  gravity:<><path d="M10 22h44m-10-10 10 10-10 10M54 43H10m10-10L10 43l10 10"/><circle cx="32" cy="32" r="4" fill="currentColor" stroke="none"/></>,
  power:<><path d="M36 5 16 35h16l-4 24 22-34H34z" fill="currentColor" fillOpacity=".18"/><path d="M8 9v10M3 14h10M53 48v12m-6-6h12" strokeWidth="3"/></>,
  team:<><circle cx="20" cy="21" r="9"/><circle cx="44" cy="21" r="9"/><path d="M5 51c0-12 7-19 15-19s15 7 15 19M29 51c0-12 7-19 15-19s15 7 15 19"/><path d="M29 12h6M32 9v6" strokeWidth="3"/></>
 };
 return <svg {...shared}>{marks[mode]||marks.classic}</svg>;
}

export function ModeChoiceGrid({value,onChange}){
 return <div className="mode-choice-grid" role="radiogroup" aria-label="Choose game mode">
  {MODE_CHOICES.map(choice=><button type="button" key={choice.id} role="radio"
     aria-checked={value===choice.id} onClick={()=>onChange(choice.id)}
     className={'mode-choice mode-tone-'+choice.tone+(value===choice.id?' is-selected':'')}>
     <span className="mode-choice-emblem"><GameModeIcon mode={choice.id} size={32}/></span>
     <span className="mode-choice-copy"><strong>{choice.name}</strong><small>{choice.subtitle}</small></span>
     {choice.local&&<span className="mode-choice-preview">LOCAL</span>}
  </button>)}
 </div>;
}
