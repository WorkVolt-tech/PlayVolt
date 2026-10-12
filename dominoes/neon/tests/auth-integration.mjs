import assert from 'node:assert/strict'
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').trim().split('\n').map(l=>l.split('=')))
const cookies = new Map(), key = crypto.randomUUID()+crypto.randomUUID()
async function request(base,path,body,extra={}) {
 const r = await fetch(base+path,{method:body ? 'POST':'GET',headers:{Origin:'http://localhost:5173','Content-Type':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...extra},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)})
 for(const cookie of r.headers.getSetCookie()) {const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
 const text = await r.text(), data = text ? JSON.parse(text) : null
 assert(r.ok,`HTTP ${r.status}: ${data?.message || data?.error || JSON.stringify(data)}`)
 return {data,headers:r.headers}
}
const auth=(path,body)=>request(env.VITE_NEON_AUTH_URL,path,body)
const email=`migration-${crypto.randomUUID()}@example.invalid`,password=crypto.randomUUID()+'aA1!'
let r=await auth('/sign-up/email',{email,password,name:'MigrationTest'})
const uid=r.data.user.id
console.log('PASS account signup')
r=await auth('/get-session')
assert.equal(r.data.user.id,uid)
const token=r.headers.get('set-auth-jwt') || (await auth('/token')).data.token
assert(token)
const api=(path,body)=>request(env.VITE_NEON_DATA_URL,path,body,{Authorization:`Bearer ${token}`,'x-player-key':key})
r=await api('/rpc/ensure_profile',{})
assert.equal(r.data.id,uid);assert.match(r.data.nickname,/MigrationTest/)
console.log('PASS signed-in profile initialization')
r=await api('/rpc/ensure_story_progress',{})
assert.equal(r.data.current_chapter,1)
r=await api('/rpc/record_challenge',{p_chapter:2,p_challenge:1,p_stars:3,p_complete_chapter:true,p_unlock_bot:null})
assert.equal(r.data.current_chapter,3);assert.equal(r.data.stars['2']['1'],3)
r=await api('/story_progress?user_id=eq.'+uid)
assert.equal(r.data[0].current_chapter,3)
console.log('PASS Chapter 2 completion persists and unlocks Chapter 3')
const playerId=crypto.randomUUID(), week=new Date()
week.setUTCHours(0,0,0,0);week.setUTCDate(week.getUTCDate()-((week.getUTCDay()+6)%7))
const win={p_player_id:playerId,p_nickname:'MigrationTest',p_mode:'teams',p_week_start:week.toISOString().slice(0,10)}
await api('/rpc/wa_tab_la_win',win)
await api('/rpc/wa_tab_la_win',win)
await api('/rpc/record_round_stats',{p_results:[{user_id:uid,won:false,vyej:false,dekabess:false,match_over:false,trophy:false}]})
r=await api('/wa_tab_la?player_id=eq.'+playerId)
assert.equal(r.data[0].wins,2)
console.log('PASS two leaderboard wins survive a subsequent round loss')
await auth('/sign-out',{})
r=await auth('/get-session');assert.equal(r.data,null)
console.log('PASS sign out')
await auth('/sign-in/email',{email,password})
r=await auth('/get-session');assert.equal(r.data.user.id,uid)
console.log('PASS sign in and restored session')
await auth('/sign-out',{})
console.log('Account integration checks complete (isolated migration-test branch)')
