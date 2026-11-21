import React,{useEffect,useState} from 'react';
import {db} from './supabase.js';
export function TvPairHost({room}){
 const [info,setInfo]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{setInfo(null);setError('');},[room?.code]);
 const generate=async()=>{
  if(busy||!room?.host)return;
  setBusy(true);setError('');
  try{
   const {data,error:rpcError}=await db.rpc('drop_block_create_tv_pair',{p_code:room.code});
   if(rpcError)throw rpcError;
   setInfo(data);
  }catch(err){setError(err?.message||'Could not generate TV pairing code.');}
  finally{setBusy(false);}
 };
 const tvConnect=new URL('/',window.location.origin);
 tvConnect.searchParams.set('tv-connect','1');
 if(room?.code)tvConnect.searchParams.set('room',room.code);
 return <div className="tv-pair-host">
  <div>
   <strong>📺 Pair a Fire Stick or another TV</strong>
   <p>Install the Fire TV app or open the TV connection page in Silk. Then enter your room code and a temporary pairing code.</p>
  </div>
  <div className="tv-pair-actions">
   {room?.host&&<button className="btn primary" type="button" onClick={generate}
    disabled={busy}>{busy?'Generating…':info?'Generate new code':'Generate TV pairing code'}</button>}
   <a className="btn ghost" target="_blank" rel="noreferrer" href={tvConnect.toString()}>TV connection screen</a>
   <a className="btn secondary" href="/firetv.apk" download>⬇ Download Fire TV APK</a>
  </div>
  {info?.pairCode&&<div className="tv-pair-info" role="status">
   <div><small>ROOM</small><strong>{info.roomCode}</strong></div>
   <div><small>TV PAIR CODE</small><strong className="pair-code">{info.pairCode}</strong></div>
   <small>One use · Expires in 10 minutes · Generate another code if needed</small>
  </div>}
  {!room?.host&&<p className="tv-pair-muted">Ask the room host to generate a pairing code.</p>}
  {error&&<div className="notification" role="alert">{error}</div>}
  <p className="tv-pair-muted">On compatible Fire OS sticks, use Downloader and enter
   <b> {window.location.host}/firetv.apk</b>. Enable permission to install from Downloader when asked.
   This is a sideloadable Android test app, not an Amazon Appstore listing.
   Newer Vega OS sticks cannot sideload ordinary Android APKs; use Silk where available.</p>
 </div>;
}
