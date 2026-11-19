import React,{useEffect,useState} from 'react';
import {db} from './supabase.js';
import {AvatarBadge,ChipDisc,BoardLookPreview} from './looks.jsx';
import {TROPHY_BY_CODE} from './achievements.js';
const DEFAULTS={board:'deep-navy',chip:'round',avatar:'sentinel'};
const TABS=[
 {id:'board',label:'Board Themes',info:'Your board theme shows on your phone; the room host’s theme shows on TV.'},
 {id:'chip',label:'Chip Shapes',info:'Your own chip silhouette appears for everyone. Player color and symbol remain visible.'},
 {id:'avatar',label:'Avatars',info:'Your avatar appears beside your name on the phone and TV.'}
];
export function CustomizeHub({userId,onBack,onEquipped}) {
 const [tab,setTab]=useState('board');
 const [items,setItems]=useState([]);
 const [equipped,setEquipped]=useState(DEFAULTS);
 const [preview,setPreview]=useState(DEFAULTS);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{
  if(!userId)return;
  let alive=true;
  setLoading(true);setError('');
  db.rpc('drop_block_customization',{p_action:'get',p_category:'',p_item:''})
   .then(({data,error:e})=>{if(!alive)return;if(e)throw e;
    setItems(data.items||[]);setEquipped(data.equipped||DEFAULTS);setPreview(data.equipped||DEFAULTS);})
   .catch(e=>{if(alive)setError(e.message);})
   .finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[userId]);
 const list=items.filter(x=>x.category===tab);
 const picked=list.find(x=>x.id===preview[tab]);
 const canEquip=Boolean(picked?.unlocked)&&picked?.id!==equipped[tab]&&!busy;
 async function equip() {
  if(!canEquip)return;
  setBusy(true);setError('');setMessage('');
  try{
   const {data,error:e}=await db.rpc('drop_block_customization',{
    p_action:'equip',p_category:tab,p_item:picked.id
   });
   if(e)throw e;
   setItems(data.items||items);setEquipped(data.equipped);setPreview(data.equipped);
   onEquipped?.(data.equipped);
   setMessage(picked.title+' equipped and saved to your PlayVolt account.');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="panel customize-hub">
  <div className="custom-head"><div><div className="section-eyebrow">DROP & BLOCK · PERSONALIZE</div>
   <h2>Your collection</h2><p className="sub">Win online to unlock new designs. Most items begin locked.</p></div>
   <button className="btn ghost" onClick={onBack}>← Back to game</button></div>
  <p className="custom-count">{loading?'Checking trophies…':items.filter(x=>x.unlocked).length+' of '+items.length+' items unlocked'}</p>
  <div className="custom-tabs" role="tablist">{TABS.map(c=><button key={c.id} role="tab"
    aria-selected={c.id===tab} className={c.id===tab?'active':''} onClick={()=>{setTab(c.id);setMessage('');}}>
    {c.id==='board'?'▦':c.id==='chip'?'◆':'◉'} {c.label}
   </button>)}</div>
  {error&&<p className="notification" role="alert">{error}</p>}
  {message&&<p className="custom-saved" role="status">{message}</p>}
  <div className="custom-content">
   <div className="custom-choices"><h3>{TABS.find(c=>c.id===tab)?.label}</h3>
    <p className="sub">{TABS.find(c=>c.id===tab)?.info}</p>
    {loading?<p className="sub">Loading designs…</p>:<div className="custom-items">
     {list.map(item=><button key={item.id} className={'custom-item'+(preview[tab]===item.id?' selected':'')+(item.unlocked?'':' locked')}
      aria-pressed={preview[tab]===item.id} onClick={()=>{setPreview(p=>({...p,[tab]:item.id}));setMessage('');}}>
      <span className="custom-art">{tab==='avatar'?<AvatarBadge id={item.id}/>:
       tab==='chip'?<ChipDisc seat={1} style={item.id}/>:
       <span className={'custom-board-tile board-theme-'+item.id}><i/><i/><i/></span>}</span>
      <span className="custom-item-copy"><strong>{item.title}</strong>
       <small>{equipped[tab]===item.id?'✓ Equipped':item.unlocked?'Unlocked':'🔒 '+(TROPHY_BY_CODE[item.trophy]?.title||'Trophy required')}</small>
      </span>
     </button>)}
    </div>}
   </div>
   <aside className="custom-preview-pane"><div className="custom-sticky">
    <BoardLookPreview board={preview.board} chip={preview.chip} avatar={preview.avatar}/>
    <div className="custom-preview-copy"><strong>{picked?.title||'Your player look'}</strong>
     <span>{picked?.unlocked?'Available to equip':'Locked — preview only'}</span>
     {picked?.trophy&&<small>Unlock: {TROPHY_BY_CODE[picked.trophy]?.title||picked.trophy}</small>}
    </div>
    <button className="btn primary full" disabled={!canEquip} onClick={equip}>
      {busy?'Saving…':!picked?'Choose a style':!picked.unlocked?'🔒 Earn the trophy':equipped[tab]===picked.id?'✓ Equipped':'Equip '+picked.title}
    </button>
    <p className="sub">You can preview locked designs. Only earned rewards can be equipped.</p>
   </div></aside>
  </div>
 </section>;
}
