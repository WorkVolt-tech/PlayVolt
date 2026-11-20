// Supabase Realtime is an invalidation signal, NEVER a gameplay data source.
// Existing signed-in room and read-only TV RPCs enforce all data access.
// The topic is guarded by the existing unguessable 64-hex TV capability.
export function roomTopic(token){
 return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)
  ? 'drop-block-room:'+token : null;
}

export function watchRoomPulse(client,token,onRefresh,onStatus=()=>{}){
 const topic=roomTopic(token);
 if(!topic){onStatus('CHANNEL_ERROR');return ()=>{};}
 let channel;
 let live=true;
 try{
  channel=client.channel(topic,{config:{private:false,broadcast:{self:false,ack:false}}});
  channel.on('broadcast',{event:'refresh'},()=>{
   if(live)onRefresh();
  });
  channel.subscribe(status=>{
   if(live)onStatus(status);
  });
 }catch{
  onStatus('CHANNEL_ERROR');
  if(channel){try{void client.removeChannel(channel);}catch{}}
  return ()=>{};
 }
 return ()=>{
  live=false;
  try{void client.removeChannel(channel);}catch{ /* connection may already be gone */ }
 };
}

// Ignore stale network responses without ever trusting them to determine
// who played first: the server's moveCount and roundNumber are authoritative.
export function reconcileRoom(current,incoming){
 if(!incoming||typeof incoming!=='object')return current;
 if(!current)return incoming;
 if(current.code!==incoming.code)return current;
 const num=v=>Number.isFinite(Number(v))?Number(v):0;
 if(num(incoming.matchNumber)<num(current.matchNumber))return current;
 if(num(incoming.matchNumber)>num(current.matchNumber))return incoming;
 if(num(incoming.moveCount)<num(current.moveCount))return current;
 if(num(incoming.moveCount)>num(current.moveCount))return incoming;
 if(num(incoming.roundNumber)<num(current.roundNumber))return current;
 if(num(incoming.roundNumber)>num(current.roundNumber))return incoming;
 const rank={lobby:1,playing:2,finished:3,cancelled:3};
 if((rank[incoming.status]||0)<(rank[current.status]||0))return current;
 if((rank[incoming.status]||0)>(rank[current.status]||0))return incoming;
 const oldAt=Date.parse(current.serverNow);
 const newAt=Date.parse(incoming.serverNow);
 if(Number.isFinite(oldAt)&&Number.isFinite(newAt)&&newAt<oldAt)return current;
 return incoming;
}

// Burst from the room and player triggers: one GET per burst, with a single
// trailing GET if more changes arrived during the in-flight request.
export function createRefreshCoordinator(refresh,options={}){
 const setDelay=options.setDelay||setTimeout,clearDelay=options.clearDelay||clearTimeout;
 const delay=Number.isFinite(options.delay)?Math.max(0,options.delay):100;
 let disposed=false,timer=null,running=false,queued=false;
 const request=()=>{
  if(disposed)return;
  if(running){queued=true;return;}
  if(timer!==null)return;
  timer=setDelay(()=>{
   timer=null;
   if(disposed)return;
   running=true;
   Promise.resolve().then(refresh).catch(()=>{}).finally(()=>{
    running=false;
    if(queued&&!disposed){queued=false;request();}
   });
  },delay);
 };
 const dispose=()=>{
  disposed=true;
  if(timer!==null){clearDelay(timer);timer=null;}
 };
 return {request,dispose};
}
