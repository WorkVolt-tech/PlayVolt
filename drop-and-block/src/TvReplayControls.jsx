import React,{useEffect,useState} from 'react';
import {db} from './supabase.js';

// This component only renders for the host. The RPC independently enforces
// host identity, completed match ownership, and non-playing room status.
export function TvReplayControls({room,onRefresh}) {
 const [options,setOptions]=useState([]);
 const [selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{
  if(!room?.host||!['lobby','finished'].includes(room.status))return;
  let alive=true;
  setError('');
  db.rpc('drop_block_tv_replay_control',{
   p_code:room.code,p_action:'status',p_match:null,p_mode:'highlights'
  }).then(({data,error:e})=>{
   if(!alive)return;if(e)throw e;
   const rows=data?.matches||[];
   setOptions(rows);
   setSelected(old=>rows.some(x=>String(x.matchNumber)===old)?old:
      rows.length?String(rows[0].matchNumber):'');
  }).catch(e=>{if(alive)setError(e.message||'Could not load TV match options');});
  return ()=>{alive=false;};
 },[room?.code,room?.host,room?.matchNumber,room?.status]);
 const active=Boolean(room?.tvReplay?.active);
 async function run(command,mode='highlights'){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try {
   const {data,error:e}=await db.rpc('drop_block_tv_replay_control',{
    p_code:room.code,p_action:command,p_match:command==='play'?Number(selected):null,p_mode:mode
   });
   if(e)throw e;
   setMessage(command==='stop'?'TV replay stopped.':
    (mode==='highlights'?'Highlight reel':'Full replay')+' sent to the TV.');
   await onRefresh?.();
  }catch(e){setError(e.message||'Could not control TV replay');}
  finally{setBusy(false);}
 }
 return <div className="tv-replay-host">
  <div className="tv-replay-host-copy">
   <div className="section-eyebrow">TV PARTY REPLAY</div>
   <strong>Relive the biggest moments</strong>
   <p>Choose a finished match. The TV will play its highlights or the entire recording. Starting a real match automatically stops TV replay.</p>
  </div>
  {error&&<p className="notification" role="alert">{error}</p>}
  {message&&<p className="tv-replay-confirmation" role="status">{message}</p>}
  {options.length?<>
   <label className="tv-replay-match-label">Recorded match
    <select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}>
     {options.map(m=><option key={m.matchNumber} value={m.matchNumber}>
      Match {m.matchNumber} · {m.moveCount} moves
     </option>)}
    </select>
   </label>
   <div className="tv-replay-host-actions">
    <button type="button" className="btn primary" disabled={busy||!selected||room.status==='playing'}
      onClick={()=>run('play','highlights')}>★ Show Highlights on TV</button>
    <button type="button" className="btn secondary" disabled={busy||!selected||room.status==='playing'}
      onClick={()=>run('play','full')}>▶ Full Replay on TV</button>
    {active&&<button type="button" className="btn ghost" disabled={busy}
      onClick={()=>run('stop')}>■ Stop Replay</button>}
   </div>
   {active&&<div className="tv-replay-playing">● NOW ON TV · Match {room.tvReplay.matchNumber} · {room.tvReplay.mode==='highlights'?'Highlights':'Full Replay'}</div>}
  </>:<p className="tv-replay-host-empty">Finish an online match to unlock TV highlights. Old matches recorded before replay snapshots are not available.</p>}
 </div>;
}
