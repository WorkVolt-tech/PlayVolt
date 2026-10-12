import assert from 'node:assert/strict'
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(l=>l.split('=')))
const authURL=env.VITE_NEON_AUTH_URL, dataURL=env.VITE_NEON_DATA_URL
async function jsonFetch(url,init={}) {
 const r=await fetch(url,{...init,signal:AbortSignal.timeout(20000)})
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:r.status,data,headers:r.headers}
}
const anon=await jsonFetch(authURL+'/token/anonymous',{headers:{Origin:'http://localhost:5173'}})
assert.equal(anon.status,200,JSON.stringify(anon.data))
const token=anon.data.token
const a=crypto.randomUUID()+crypto.randomUUID(),b=crypto.randomUUID()+crypto.randomUUID(),stranger=crypto.randomUUID()+crypto.randomUUID()
async function call(path,{key=a,method='GET',body,token:jwt=token}={}) {
 return jsonFetch(dataURL+path,{method,headers:{Authorization:`Bearer ${jwt}`,'x-player-key':key,'Content-Type':'application/json',Prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})})
}
const code=crypto.randomUUID().replaceAll('-','').slice(0,6).toUpperCase()
let r=await call('/domino_rooms',{method:'POST',body:{code,game_mode:'chien'}})
assert.equal(r.status,201,JSON.stringify(r.data)); const room=r.data[0]
console.log('PASS guest room creation')
r=await call('/domino_players',{method:'POST',body:{room_id:room.id,seat:0,nickname:'Migration host'}})
assert.equal(r.status,201,JSON.stringify(r.data))
r=await call('/rpc/join_room',{key:b,method:'POST',body:{p_code:code,p_nickname:'Migration guest'}})
assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.player.seat,1)
console.log('PASS atomic guest join')
r=await call('/domino_rooms?id=eq.'+room.id,{key:stranger,method:'PATCH',body:{status:'finished'}})
assert.deepEqual(r.data,[],'Unrelated guest must not update a room')
r=await call('/domino_players?room_id=eq.'+room.id,{key:stranger})
assert.deepEqual(r.data,[],'Unrelated guest must not read hands')
console.log('PASS cross-room access denied')
r=await call('/board',{method:'POST',body:{room_id:room.id,tiles:[],left_end:null,right_end:null}})
assert.equal(r.status,201,JSON.stringify(r.data))
r=await call('/domino_rooms?id=eq.'+room.id,{method:'PATCH',body:{status:'playing',seat_count:2,ai_difficulty:null,scores:[0,0,0,0],streak:{seat:null,team:null,count:0},pending_point:false,round:1,match_winner:null,deal_variant:'all',pile:[],opening_tile:[6,6]}})
assert.equal(r.status,200,JSON.stringify(r.data))
for(const [seat,hand] of [[0,[[6,6],[1,2]]],[1,[[2,3],[4,5]]]]){
 r=await call(`/domino_players?room_id=eq.${room.id}&seat=eq.${seat}`,{method:'PATCH',body:{hand}})
 assert.equal(r.status,200,JSON.stringify(r.data))
}
r=await call('/rpc/play_move',{method:'POST',body:{p_room_id:room.id,p_seat:0,p_action:'place',p_tile:[6,6],p_board:{tiles:[{tile:[6,6],flipped:false}],left_end:6,right_end:6},p_hand:[[1,2]],p_advance:true,p_check_block:true}})
assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.blocked,true)
console.log('PASS immediate blocked-game detection')
r=await call('/rpc/watch_room',{key:stranger,method:'POST',body:{p_room:room.id}})
assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.room.code,undefined)
assert(r.data.players.every(p=>p.hand.every(t=>t[0]===0&&t[1]===0)))
console.log('PASS spectator hands masked on server')
r=await call('/rpc/live_sync',{method:'POST',body:{p_client:crypto.randomUUID(),p_subscriptions:[{id:'p',kind:'table',table:'domino_players',column:'room_id',value:room.id},{kind:'presence',channel:'game-'+room.id}],p_presence:[{channel:'game-'+room.id,key:'0',meta:{seat:0}}]}})
assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.snapshots.p.length,2);assert.equal(r.data.presence['game-'+room.id]['0'][0].seat,0)
console.log('PASS batched snapshots and presence')
r=await call('/rpc/draw_tile',{key:stranger,method:'POST',body:{p_room_id:room.id,p_seat:0}})
assert(r.status>=400,'Stranger draw must be rejected')
console.log('PASS privileged move access denied')
// Remove only the disposable room created by this run.
r=await call('/domino_rooms?id=eq.'+room.id,{method:'DELETE'});assert.equal(r.status,200)
console.log('Guest integration checks complete')
