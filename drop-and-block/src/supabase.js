import { createClient } from '@supabase/supabase-js';
// Public anon key from the same Game DB as Dekabess and Pin & Spin.
// Never put a service-role key in a browser bundle.
const url = 'https://eybzbtyfafmqbkulyvog.supabase.co';
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5YnpidHlmYWZtcWJrdWx5dm9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MjE0MDksImV4cCI6MjA5MDM5NzQwOX0.65mO6dICDWAlS4nh0gBs7tSNobuNMNo103YY0Ylccq8';
export const db = createClient(url, anon);
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
