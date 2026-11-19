import React, {useEffect, useState} from 'react';
import {db} from './supabase.js';
import {TROPHIES, TROPHY_BY_CODE, MODES} from './achievements.js';

function Medal({trophy,earned=false}) {
 return <div className={'trophy-medal '+trophy.tier.toLowerCase()+(earned?' earned':' locked')} role="img" aria-label={trophy.tier+' trophy'}>
    <span>{trophy.icon}</span>
 </div>;
}
export function TrophyUnlockNotice({codes,onClose,onView}) {
 if(!codes?.length)return null;
 return <div className="trophy-popup-backdrop" onClick={onClose}>
  <section className="trophy-popup" role="dialog" aria-modal="true" aria-label="Trophy unlocked" onClick={e=>e.stopPropagation()}>
   <div className="section-eyebrow">PLAYVOLT · DROP &amp; BLOCK</div>
   <h2>{codes.length===1?'Trophy unlocked!':codes.length+' trophies unlocked!'}</h2>
   <div className="trophy-popup-list">{codes.map(code => {
    const t=TROPHY_BY_CODE[code];
    return t&&<div key={code} className="trophy-popup-item"><Medal trophy={t} earned/>
     <div><strong>{t.title}</strong><span>{t.description}</span></div>
    </div>;
   })}</div>
   <div className="trophy-popup-actions"><button className="btn ghost" onClick={onClose}>Nice!</button>
    <button className="btn primary" onClick={onView}>View trophies</button></div>
  </section>
 </div>;
}

export function ProgressHub({userId,onBack,refreshSignal=0}) {
 const [tab,setTab]=useState('leaderboard');
 const [mode,setMode]=useState('all');
 const [period,setPeriod]=useState('all');
 const [data,setData]=useState(null);
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!userId)return;
  let active=true;
  setBusy(true);setError('');
  db.rpc('drop_block_progress',{p_mode:mode,p_period:period,p_limit:25})
   .then(({data:result,error:rpcError})=>{
    if(!active)return;
    if(rpcError){setError(rpcError.message);setData(null);}
    else setData(result);
   })
   .catch(e=>{if(active){setData(null);setError(e.message);}})
   .finally(()=>{if(active)setBusy(false);});
  return ()=>{active=false;};
 },[userId,mode,period,refreshSignal]);
 const earned=new Map((data?.earned||[]).map(x=>[x.code,x.earnedAt]));
 const stats=data?.me;
 return <section className="panel progress-hub">
  <div className="progress-head">
   <div><div className="section-eyebrow">PLAYVOLT PLAYER ACHIEVEMENTS</div><h2>Trophies &amp; Leaderboards</h2>
    <p className="sub">Rankings and achievements count finished online games, not the local demo.</p></div>
   <button className="btn ghost" onClick={onBack}>← Back to game</button>
  </div>
  <div className="progress-stats">
   <div className="progress-stat"><span>Matches played</span><strong>{stats?.played??'—'}</strong></div>
   <div className="progress-stat"><span>Victories</span><strong>{stats?.wins??'—'}</strong></div>
   <div className="progress-stat"><span>Win rate</span><strong>{stats?.winRate??'—'}{stats?'%':''}</strong></div>
   <div className="progress-stat"><span>Trophies</span><strong>{data?earned.size+'/'+TROPHIES.length:'—'}</strong></div>
  </div>
  <div className="progress-tabs" role="tablist" aria-label="Player progress">
   <button type="button" role="tab" aria-selected={tab==='leaderboard'} className={tab==='leaderboard'?'active':''} onClick={()=>setTab('leaderboard')}>🏅 Leaderboards</button>
   <button type="button" role="tab" aria-selected={tab==='trophies'} className={tab==='trophies'?'active':''} onClick={()=>setTab('trophies')}>🏆 Trophy collection</button>
  </div>
  {error&&<div className="notification" role="alert">Could not load game progress: {error}</div>}
  {busy&&<p className="sub" role="status">Loading your PlayVolt progress…</p>}
  {tab==='leaderboard'?<div role="tabpanel">
   <div className="leaderboard-filters">
    <label>Game mode<select value={mode} onChange={e=>setMode(e.target.value)}>
     {MODES.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
    </select></label>
    <label>Period<select value={period} onChange={e=>setPeriod(e.target.value)}>
     <option value="all">All time</option><option value="weekly">Last 7 days</option>
    </select></label>
   </div>
   <div className="leaderboard-headings"><span>Rank / Player</span><span>Wins</span><span>Played</span><span>Win %</span></div>
   {data?.leaders?.length ? <div className="leaderboard-rows">
    {data.leaders.map(p=><div key={p.rank} className={'leaderboard-row'+(p.isMe?' is-me':'')}>
      <span className="rank-name"><b className="rank-number">{p.rank===1?'🥇':p.rank===2?'🥈':p.rank===3?'🥉':'#'+p.rank}</b>
       <span className="rank-player-name">{p.name}{p.isMe?' (You)':''}</span></span>
      <strong>{p.wins}</strong><span>{p.played}</span><span>{p.winRate}%</span>
    </div>)}
   </div>:!busy&&!error&&<div className="leaderboard-empty">No completed online matches for this filter yet. Be the first on the board!</div>}
   <p className="sub leader-foot">Top 25 players · Ranked by wins, then win percentage, then matches played. Each completed rematch counts separately.</p>
  </div>:<div role="tabpanel">
   <div className="trophy-progress-head"><strong>{earned.size} of {TROPHIES.length} earned</strong>
     <span>Locked trophies unlock automatically when you meet their conditions.</span></div>
   <div className="trophy-progress-track"><div style={{width:(earned.size/TROPHIES.length*100)+'%'}}/></div>
   <div className="trophy-collection">{TROPHIES.map(t=>{
    const unlocked=earned.has(t.code);
    return <div key={t.code} className={'trophy-tile'+(unlocked?' unlocked':'')}>
     <Medal trophy={t} earned={unlocked}/>
     <div className="trophy-tile-copy"><span className="trophy-tier">{t.tier} · {unlocked?'UNLOCKED':'LOCKED'}</span>
      <strong>{t.title}</strong><p>{t.description}</p>
      {unlocked&&<small>Earned {new Date(earned.get(t.code)).toLocaleDateString()}</small>}
     </div>
    </div>;
   })}</div>
  </div>}
 </section>;
}
