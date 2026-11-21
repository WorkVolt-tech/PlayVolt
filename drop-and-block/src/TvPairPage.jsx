import React,{useState} from 'react';
import {db} from './supabase.js';
import {buildTvDisplayUrl} from './tvLink.js';
import {VersionAlert} from './VersionAlert.jsx';

export function TvPairPage(){
 const params=new URLSearchParams(window.location.search);
 const [code,setCode]=useState((params.get('room')||'').toUpperCase().slice(0,6));
 const [pin,setPin]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const submit=async e=>{
  e.preventDefault();
  if(loading||code.length!==6||pin.length!==10)return;
  setLoading(true);setError('');
  try{
   const {data,error:rpcError}=await db.rpc('drop_block_redeem_tv_pair',{
    p_code:code.toUpperCase(),p_pair:pin.toUpperCase()
   });
   if(rpcError)throw rpcError;
   if(!data?.displayToken)throw Error('This code did not return a valid TV session');
   window.location.assign(buildTvDisplayUrl(window.location,data.roomCode,data.displayToken));
  }catch(err){setError(err?.message||'Pairing failed. Request a new TV code from the host.');}
  finally{setLoading(false);}
 };
 return <main className="tv-pair-page">
  <div className="tv-pair-panel">
   <div className="tv-logo">DROP <em>&</em> BLOCK <small>BY PLAYVOLT</small></div>
   <div className="section-eyebrow">FIRE TV · SMART TV · BIG SCREEN</div>
   <h1>Connect your TV</h1>
   <p>Your TV is a <strong>read-only spectator</strong>. Players continue making moves on their phones.</p>
   <form onSubmit={submit} className="tv-pair-form">
    <label htmlFor="tv-room">Room code (6 characters)</label>
    <input id="tv-room" value={code} autoCapitalize="characters" maxLength="6"
     inputMode="text" required pattern="[A-Fa-f0-9]{6}"
     onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,6))}
     placeholder="ABC123"/>
    <label htmlFor="tv-pin">Temporary TV pairing code (10 characters)</label>
    <input id="tv-pin" value={pin} autoCapitalize="characters" maxLength="10"
     inputMode="text" required pattern="[A-Fa-f0-9]{10}"
     onChange={e=>setPin(e.target.value.toUpperCase().replace(/[^A-F0-9]/g,'').slice(0,10))}
     placeholder="1A2B3C4D5E"/>
    <button type="submit" className="btn primary full"
     disabled={loading||code.length!==6||pin.length!==10}>
     {loading?'Connecting…':'CONNECT TO LIVE TV'}
    </button>
   </form>
   {error&&<div className="notification" role="alert">{error}</div>}
   <div className="tv-pair-help">
    <strong>How to get the code</strong>
    <p>On the host's phone: open the online room → <b>TV Party Mode</b> → <b>Pair Fire Stick / TV</b>.
      Type the room code and the new 10-character code here. The code expires after 10 minutes and can be used once.</p>
    <p>Local same-device demos do not stream to another device. Create an online room for a separate TV or Fire Stick.</p>
   </div>
   <p className="tv-pair-install">Compatible Fire OS TV? Install the
    <a href="/firetv.apk"> Drop &amp; Block TV APK</a> with Downloader to open this connection screen directly.
    Alternatively, bookmark this page in Amazon Silk. Newer Vega OS sticks do not run Android APKs.</p>
   <a className="tv-pair-home" href="/">← Back to Drop &amp; Block</a>
  </div>
  <VersionAlert autoUpdate/>
 </main>;
}
