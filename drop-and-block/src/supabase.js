import { createClient } from '@supabase/supabase-js';
// Public anon key from the same Game DB as Dekabess and Pin & Spin.
// Never put a service-role key in a browser bundle.
const url = 'https://eybzbtyfafmqbkulyvog.supabase.co';
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5YnpidHlmYWZtcWJrdWx5dm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjE0MDksImV4cCI6MjA5MDM5NzQwOX0.65mO6dICDWAlS4nh0gBs7tSNobuNMNo103YY0Ylccq8';
export const db = createClient(url, anon);
// Unregistered Drop & Block players use a guest-only seat token, not
// auth.users, passwords, or Supabase Anonymous Sign-Ins.
// This follows PlayVolt's existing account-optional multiplayer behavior.
const guestKey='drop_block_guest_session_v1';
let guestMemory=null;
export function readGuestSession(){
  if(guestMemory)return guestMemory;
  try {
    const g=JSON.parse(localStorage.getItem(guestKey)||'null');
    if(g&&/^[a-f0-9]{64}$/.test(g.token)&&/^[a-f0-9-]{36}$/.test(g.id)){
      guestMemory=g;return g;
    }
  } catch{/* Guest state remains in memory if storage is blocked. */}
  return null;
}
export function clearGuestSession(){
  guestMemory=null;
  try{localStorage.removeItem(guestKey);}catch{/* Storage is optional. */}
}
export function asGuestUser(g){
  return g?{id:g.id,is_anonymous:true,user_metadata:{nickname:g.name}}:null;
}
export async function ensureGuestSession(nickname=''){
  const existing=readGuestSession();
  if(existing)return asGuestUser(existing);
  const {data,error}=await db.rpc('drop_block_guest_action',{
    p_action:'register',p_code:'',p_data:{nickname:nickname.trim()},p_token:''
  });
  if(error)throw new Error(error.message||'Could not start a guest session');
  if(!data?.guestToken||!data?.guestId)throw new Error('Guest session could not be created');
  guestMemory={id:data.guestId,name:data.guestName,token:data.guestToken};
  try{localStorage.setItem(guestKey,JSON.stringify(guestMemory));}catch{}
  return asGuestUser(guestMemory);
}

// The older modes still use the existing RPC. Only Power-Up sessions use
// the new server-authoritative power rules and independent state storage.
const roomModes = new Map();
async function callGameService(endpoint,type,code,data) {
  const {data: result,error} = await db.rpc(endpoint,{
    p_action:type,p_code:code,p_data:data
  });
  if(error)throw new Error(error.message || 'Could not contact the game service');
  return result;
}
export async function action(type,code='',data={}) {
  const normalized = typeof code==='string'?code.trim().toUpperCase():'';
  const {data:{session},error:sessionError}=await db.auth.getSession();
  if(sessionError)throw new Error(sessionError.message);
  if(!session?.user){
    const guest=readGuestSession();
    if(!guest)throw new Error('Choose Create Room or Join Room to start guest play.');
    const {data:result,error}=await db.rpc('drop_block_guest_action',{
      p_action:type,p_code:normalized,p_data:data,p_token:guest.token
    });
    if(error)throw new Error(error.message||'Guest room action failed');
    return result;
  }
  const isPower = type==='create'
    ? data?.mode==='power'
    : roomModes.get(normalized)==='power';
  if(type==='double'&&!isPower)throw new Error('Double Drop is only available in Power-Up Arcade');
  const endpoint=isPower?'drop_block_power_action':'drop_block_action';
  let result=await callGameService(endpoint,type,normalized,data);
  if(result?.code&&result?.mode)roomModes.set(result.code,result.mode);
  // On a direct room link, 'join' happens before we know the room mode.
  // Join with the old endpoint, then fetch all Power-Up state through its RPC.
  if(type==='join'&&!isPower&&result?.mode==='power'){
    result=await callGameService('drop_block_power_action','get',result.code,{});
  }
  return result;
}
