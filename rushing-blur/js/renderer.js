// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER v6 (OutRun pseudo-3D)
//
// Proper OutRun-style road rendering:
//  - Camera behind + above car
//  - Walk track waypoints FORWARD from car position
//  - Project each edge point with proper perspective division
//  - Draw trapezoid strips far→near (no crossings, no triangles)
// ══════════════════════════════════════════════════

let _canvas, _ctx, _miniCanvas, _miniCtx;
let _W = 0, _H = 0;

const CAM = {
  height:       220,
  depth:        0.84,
  horizonRatio: 0.42,
  drawDist:     180,
  camBehind:    80,
  shake:        0,
};

function initRenderer() {
  _canvas     = document.getElementById('game-canvas');
  _ctx        = _canvas.getContext('2d');
  _miniCanvas = document.getElementById('minimap-canvas');
  _miniCtx    = _miniCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  _canvas.width  = _W = window.innerWidth;
  _canvas.height = _H = window.innerHeight;
}

// Projects world point into screen coords given camera.
// Returns { sx, sy, scale, behind }
function projectPoint(wx, wy, camX, camY, camAngle) {
  const dx = wx - camX;
  const dy = wy - camY;
  const cos  = Math.cos(-camAngle);
  const sin  = Math.sin(-camAngle);
  const camZ =  dx*cos - dy*sin;
  const camXr = dx*sin + dy*cos;

  if (camZ <= 0.5) return { sx:0, sy:0, scale:0, behind:true };

  const scale = CAM.depth / camZ;
  const hy    = _H * CAM.horizonRatio;
  const sx    = _W*0.5 + camXr*scale*_W;
  const sy    = hy + (_H - hy)*(1 - scale/CAM.depth);

  return { sx, sy, scale, behind:false };
}

function sampleSegment(idx, camX, camY, camAngle) {
  const n  = TRACK_WAYPOINTS.length;
  const i0 = ((idx   % n) + n) % n;
  const i1 = (((idx+1) % n) + n) % n;
  const wp  = TRACK_WAYPOINTS[i0];
  const wpN = TRACK_WAYPOINTS[i1];
  const fx   = wpN.x - wp.x, fy = wpN.y - wp.y;
  const fLen = Math.hypot(fx,fy)||1;
  const nx   = -fy/fLen, ny = fx/fLen;
  return {
    pL: projectPoint(wp.x+nx*ROAD_HALF, wp.y+ny*ROAD_HALF, camX, camY, camAngle),
    pR: projectPoint(wp.x-nx*ROAD_HALF, wp.y-ny*ROAD_HALF, camX, camY, camAngle),
    pC: projectPoint(wp.x, wp.y, camX, camY, camAngle),
    wpIdx: i0,
  };
}

function renderFrame(state) {
  if (!_canvas) return;
  const car = state.localCar;
  if (!car) return;

  if (state.screenShake > 0) {
    CAM.shake = Math.max(CAM.shake, state.screenShake*2.5);
    state.screenShake = Math.max(0, state.screenShake-0.8);
  }
  let shakeX=0, shakeY=0;
  if (CAM.shake > 0) {
    shakeX = (Math.random()-.5)*CAM.shake;
    shakeY = (Math.random()-.5)*CAM.shake*.4;
    CAM.shake = Math.max(0, CAM.shake-1.8);
  }

  const ctx = _ctx;
  ctx.save();
  if (shakeX||shakeY) ctx.translate(shakeX, shakeY);
  _drawSkyGround(ctx);
  _drawRoad(ctx, car);
  _drawWorldObjects(ctx, car, state);
  _drawLocalCar(ctx, car);
  ctx.restore();
  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

function _drawSkyGround(ctx) {
  const hy = _H*CAM.horizonRatio;
  const sky = ctx.createLinearGradient(0,0,0,hy);
  sky.addColorStop(0,'#04001a'); sky.addColorStop(.5,'#0c0530'); sky.addColorStop(1,'#180a50');
  ctx.fillStyle=sky; ctx.fillRect(0,0,_W,hy);

  ctx.fillStyle='rgba(255,255,255,0.75)';
  for(let i=0;i<120;i++){
    const sx=((i*173.3+7)%997)/997*_W;
    const sy=((i*251.7+31)%883)/883*hy*.9;
    ctx.beginPath(); ctx.arc(sx,sy,i%7===0?1.5:.7,0,Math.PI*2); ctx.fill();
  }

  const hg=ctx.createRadialGradient(_W*.5,hy,10,_W*.5,hy,_W*.5);
  hg.addColorStop(0,'rgba(130,60,255,0.35)'); hg.addColorStop(.4,'rgba(80,20,200,0.12)'); hg.addColorStop(1,'transparent');
  ctx.fillStyle=hg; ctx.fillRect(0,hy-80,_W,80);

  const gnd=ctx.createLinearGradient(0,hy,0,_H);
  gnd.addColorStop(0,'#170c30'); gnd.addColorStop(.3,'#0e0820'); gnd.addColorStop(1,'#07050f');
  ctx.fillStyle=gnd; ctx.fillRect(0,hy,_W,_H-hy);

  ctx.strokeStyle='rgba(160,80,255,0.5)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,hy); ctx.lineTo(_W,hy); ctx.stroke();
}

function _drawRoad(ctx, car) {
  const hy      = _H*CAM.horizonRatio;
  const camX    = car.x - Math.cos(car.angle)*CAM.camBehind;
  const camY    = car.y - Math.sin(car.angle)*CAM.camBehind;
  const camAngle= car.angle;
  const nearest = nearestTrackPoint(car.x, car.y);
  const startIdx= nearest.index;

  const segs = [];
  for (let s=-4; s<CAM.drawDist; s++) {
    const seg = sampleSegment(startIdx+s, camX, camY, camAngle);
    if (seg.pC.behind && s>=0) continue;
    if (!seg.pC.behind && seg.pC.sy < hy-2 && s>0) break;
    segs.push({...seg,s});
  }

  if (segs.length < 2) return;
  segs.sort((a,b)=>a.pC.sy-b.pC.sy);

  for (let i=0; i<segs.length-1; i++) {
    const far=segs[i], near=segs[i+1];
    if (far.pC.behind||near.pC.behind) continue;

    let fLx=far.pL.sx, fRx=far.pR.sx, fY=far.pC.sy;
    const nLx=near.pL.sx, nRx=near.pR.sx, nY=near.pC.sy;

    if (fY < hy) {
      if (nY <= hy) continue;
      const t=(hy-fY)/(nY-fY);
      fLx=fLx+(nLx-fLx)*t; fRx=fRx+(nRx-fRx)*t; fY=hy;
    }
    if (nY < hy) continue;
    if (fY >= nY) continue;

    const band  = Math.floor(i/6)%2;
    const roadW = nRx-nLx;

    ctx.fillStyle = band ? '#2e2e3e' : '#252535';
    ctx.beginPath();
    ctx.moveTo(fLx,fY); ctx.lineTo(fRx,fY);
    ctx.lineTo(nRx,nY); ctx.lineTo(nLx,nY);
    ctx.closePath(); ctx.fill();

    const kW = Math.max(2, roadW*0.055);
    const kCol = band ? '#cc1111' : '#eeeeee';
    const kRatio = far.pC.scale>0 ? Math.min(2, far.pC.scale/near.pC.scale) : 0.5;
    ctx.fillStyle = kCol;
    ctx.beginPath();
    ctx.moveTo(fLx,fY); ctx.lineTo(fLx+kW*kRatio,fY);
    ctx.lineTo(nLx+kW,nY); ctx.lineTo(nLx,nY);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fRx,fY); ctx.lineTo(fRx-kW*kRatio,fY);
    ctx.lineTo(nRx-kW,nY); ctx.lineTo(nRx,nY);
    ctx.closePath(); ctx.fill();

    if (i%10<5) {
      const mFx=(fLx+fRx)*.5, mNx=(nLx+nRx)*.5;
      ctx.strokeStyle='rgba(212,255,0,0.65)';
      ctx.lineWidth=Math.max(1.5,roadW*0.012);
      ctx.beginPath(); ctx.moveTo(mFx,fY); ctx.lineTo(mNx,nY); ctx.stroke();
    }

    const ga=Math.min(.4,(1-i/segs.length)*.5);
    ctx.strokeStyle=`rgba(180,80,255,${ga})`; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(fLx,fY); ctx.lineTo(nLx,nY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fRx,fY); ctx.lineTo(nRx,nY); ctx.stroke();

    if (near.wpIdx===0) {
      const cols=10, bW=roadW/cols, rowH=Math.max(3,(nY-fY)*.6);
      for(let c=0;c<cols;c++) for(let r=0;r<2;r++){
        ctx.fillStyle=(r+c)%2===0?'#fff':'#111';
        ctx.fillRect(nLx+c*bW, nY-(r+1)*rowH, Math.max(1,bW-.5), rowH);
      }
    }
  }

  const fade=ctx.createLinearGradient(0,hy-4,0,hy+_H*.06);
  fade.addColorStop(0,'rgba(24,10,80,0.95)'); fade.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=fade; ctx.fillRect(0,hy-4,_W,_H*.07);
}

function _camOf(car){return{x:car.x-Math.cos(car.angle)*CAM.camBehind,y:car.y-Math.sin(car.angle)*CAM.camBehind,angle:car.angle};}
function _proj(wx,wy,cam){return projectPoint(wx,wy,cam.x,cam.y,cam.angle);}
function _onScreen(p){
  if(!p||p.behind)return false;
  if(p.sy<_H*CAM.horizonRatio-10)return false;
  if(p.sy>_H+100)return false;
  if(p.sx<-300||p.sx>_W+300)return false;
  if(p.scale<0.003)return false;
  return true;
}

function _drawWorldObjects(ctx, car, state) {
  const cam=_camOf(car), objs=[];
  for(const pu of(state.pickups||[])){if(!pu.active)continue;const p=_proj(pu.x,pu.y,cam);if(_onScreen(p))objs.push({type:'pickup',data:pu,p});}
  for(const m of(state.mines||[])){const p=_proj(m.x,m.y,cam);if(_onScreen(p))objs.push({type:'mine',data:m,p});}
  for(const rc of Object.values(state.cars)){if(!rc||rc.isLocal||rc.dead)continue;const p=_proj(rc.x,rc.y,cam);if(_onScreen(p))objs.push({type:'car',data:rc,p});}
  objs.sort((a,b)=>a.p.sy-b.p.sy);
  for(const obj of objs){
    if(obj.type==='pickup')_drawPickup(ctx,obj.data,obj.p);
    else if(obj.type==='mine')_drawMine(ctx,obj.data,obj.p);
    else if(obj.type==='car')_drawRemoteCar(ctx,obj.data,obj.p,car);
  }
  _drawProjectiles(ctx,state,cam);
  _drawParticles(ctx,state,cam);
}

function _drawPickup(ctx,pu,p){
  const wt=WEAPON_TYPES[pu.weapon],s=Math.max(.05,p.scale),sz=Math.max(6,55*s),pulse=Math.sin(pu.pulse||0)*.3+.7;
  ctx.save();ctx.translate(p.sx,p.sy-sz*.5);ctx.rotate(((Date.now()/1400)%1)*Math.PI*2);
  ctx.shadowColor=wt?wt.color:'#fff';ctx.shadowBlur=18*pulse;ctx.strokeStyle=wt?wt.color:'#fff';ctx.lineWidth=Math.max(1.5,3*s);ctx.fillStyle='rgba(5,2,20,0.88)';
  ctx.beginPath();ctx.rect(-sz/2,-sz/2,sz,sz);ctx.fill();ctx.stroke();
  ctx.rotate(-(((Date.now()/1400)%1)*Math.PI*2));ctx.shadowBlur=0;
  ctx.font=`${Math.max(10,24*s)}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';
  ctx.fillText(wt?wt.icon:'?',0,0);ctx.restore();
}

function _drawMine(ctx,m,p){
  const s=Math.max(.05,p.scale),sz=Math.max(3,16*s),pulse=Math.sin(m.pulse||0)*.4+.6;
  ctx.save();ctx.translate(p.sx,p.sy-sz);ctx.shadowColor=m.color;ctx.shadowBlur=m.armed?18*pulse:5;ctx.fillStyle=m.armed?m.color:'#555';
  ctx.beginPath();ctx.arc(0,0,sz,0,Math.PI*2);ctx.fill();ctx.restore();
}

function _drawRemoteCar(ctx,rc,p,localCar){
  const s=Math.max(.04,p.scale),carDef=rc.carDef||CARS.find(c=>c.id===rc.carId)||CARS[4];
  const bW=Math.max(8,carDef.bodyW*s*2.4),bH=Math.max(6,carDef.bodyH*s*2.0);
  let relA=rc.angle-localCar.angle;while(relA>Math.PI)relA-=Math.PI*2;while(relA<-Math.PI)relA+=Math.PI*2;
  const skew=relA*bW*.35;
  ctx.save();ctx.translate(p.sx,p.sy-bH*.5);
  ctx.fillStyle='rgba(0,0,0,0.3)';ctx.beginPath();ctx.ellipse(skew*.3,bH*.5,bW*.5,bH*.12,0,0,Math.PI*2);ctx.fill();
  if(rc.shieldTimer>0){ctx.strokeStyle='#00aaff';ctx.lineWidth=2.5;ctx.shadowColor='#00aaff';ctx.shadowBlur=14;ctx.globalAlpha=.65;ctx.beginPath();ctx.ellipse(0,0,bW*.65,bH,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;}
  ctx.shadowColor=carDef.color;ctx.shadowBlur=8;ctx.fillStyle=carDef.color2;
  const tw=bW*.75;
  ctx.beginPath();ctx.moveTo(-bW/2+skew*.6,bH*.44);ctx.lineTo(bW/2+skew*.6,bH*.44);ctx.lineTo(tw/2+skew,-bH*.56);ctx.lineTo(-tw/2+skew,-bH*.56);ctx.closePath();ctx.fill();
  ctx.fillStyle=carDef.color;ctx.beginPath();ctx.moveTo(-bW*.36+skew*.6,bH*.08);ctx.lineTo(bW*.36+skew*.6,bH*.08);ctx.lineTo(tw*.36+skew,-bH*.56);ctx.lineTo(-tw*.36+skew,-bH*.56);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#ff2200';ctx.shadowColor='#ff2200';ctx.shadowBlur=8;
  ctx.beginPath();ctx.ellipse(bW*.37+skew*.6,bH*.36,Math.max(1,3*s),Math.max(1,2*s),0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(-bW*.37+skew*.6,bH*.36,Math.max(1,3*s),Math.max(1,2*s),0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;
  const barW=bW*1.2,barH=Math.max(2,4*s),barY=-bH*.58-barH-Math.max(3,7*s);
  ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(-barW/2,barY,barW,barH);
  const hp=Math.max(0,Math.min(1,rc.health/(rc.maxHealth||100)));
  ctx.fillStyle=hp>.5?'#00ff88':hp>.25?'#ffaa00':'#ff3300';ctx.fillRect(-barW/2,barY,barW*hp,barH);
  const fs=Math.max(8,Math.min(14,12*s));
  ctx.font=`700 ${fs}px Nunito,sans-serif`;ctx.textAlign='center';ctx.textBaseline='bottom';
  ctx.fillStyle=carDef.color;ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillText(rc.name||'???',0,barY-2);ctx.shadowBlur=0;
  ctx.restore();
}

function _drawProjectiles(ctx,state,cam){
  for(const pr of(state.projectiles||[])){
    for(let i=0;i<pr.trail.length;i++){const tp=_proj(pr.trail[i].x,pr.trail[i].y,cam);if(!_onScreen(tp))continue;ctx.globalAlpha=(i/pr.trail.length)*.5;ctx.fillStyle=pr.color;ctx.beginPath();ctx.arc(tp.sx,tp.sy,Math.max(1,5*tp.scale),0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;const p=_proj(pr.x,pr.y,cam);if(!_onScreen(p))continue;
    const sz=Math.max(2,12*p.scale);ctx.save();ctx.translate(p.sx,p.sy);ctx.shadowColor=pr.color;ctx.shadowBlur=20;ctx.fillStyle=pr.color;ctx.beginPath();ctx.arc(0,0,sz,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}

function _drawParticles(ctx,state,cam){
  for(const pp of(state.particles||[])){const p=_proj(pp.x,pp.y,cam);if(!_onScreen(p))continue;ctx.globalAlpha=pp.alpha;ctx.fillStyle=pp.color;ctx.beginPath();ctx.arc(p.sx,p.sy,Math.max(1,pp.r*p.scale),0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;
}

function _drawLocalCar(ctx,car){
  const carDef=car.carDef||CARS[4];
  const cx=_W*.5,cy=_H*.82;
  const fX=Math.cos(car.angle),fY=Math.sin(car.angle);
  const lX=-fY,lY=fX;
  const latVel=(car.vx||0)*lX+(car.vy||0)*lY;
  const lean=Math.max(-.16,Math.min(.16,latVel*-.008));
  const bW=94,bH=58;
  ctx.save();ctx.translate(cx,cy);ctx.rotate(lean);

  if(car.isBoosting){
    for(const [fx] of[[-28],[0],[28]]){
      const fH=32+Math.random()*28,fW=9+Math.random()*5;
      const g=ctx.createLinearGradient(fx,bH*.5,fx,bH*.5+fH);
      g.addColorStop(0,carDef.color);g.addColorStop(.45,'#ff6600');g.addColorStop(1,'transparent');
      ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(fx,bH*.5+fH*.45,fW*.5,fH*.5,0,0,Math.PI*2);ctx.fill();
    }
  }

  ctx.fillStyle='rgba(0,0,0,0.45)';ctx.beginPath();ctx.ellipse(3,bH*.58,bW*.52,bH*.15,0,0,Math.PI*2);ctx.fill();
  if(car.shieldTimer>0){const alpha=Math.min(1,car.shieldTimer/60)*.7;ctx.strokeStyle='#00aaff';ctx.lineWidth=3.5;ctx.shadowColor='#00aaff';ctx.shadowBlur=24;ctx.globalAlpha=alpha;ctx.beginPath();ctx.ellipse(0,0,bW*.68,bH*1.1,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;}

  const hoodW=bW*.90,bmpW=bW*.80,hoodY=-bH*.50,bmpY=bH*.48;
  ctx.shadowColor=carDef.color;ctx.shadowBlur=14;ctx.fillStyle=carDef.color2;
  ctx.beginPath();ctx.moveTo(-bmpW/2,bmpY);ctx.lineTo(bmpW/2,bmpY);ctx.lineTo(hoodW/2,hoodY);ctx.lineTo(-hoodW/2,hoodY);ctx.closePath();ctx.fill();
  ctx.fillStyle=carDef.color;ctx.beginPath();ctx.moveTo(-bmpW*.34,bmpY*.18);ctx.lineTo(bmpW*.34,bmpY*.18);ctx.lineTo(hoodW*.34,hoodY);ctx.lineTo(-hoodW*.34,hoodY);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='rgba(100,180,255,0.15)';ctx.strokeStyle='rgba(160,210,255,0.35)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-hoodW*.30,hoodY+bH*.12);ctx.lineTo(hoodW*.30,hoodY+bH*.12);ctx.lineTo(hoodW*.28,hoodY+bH*.35);ctx.lineTo(-hoodW*.28,hoodY+bH*.35);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowColor='#ffffaa';ctx.shadowBlur=20;ctx.fillStyle='#ffffcc';
  ctx.beginPath();ctx.ellipse(-hoodW*.355,hoodY+bH*.09,9,5,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(hoodW*.355,hoodY+bH*.09,9,5,0,0,Math.PI*2);ctx.fill();
  ctx.shadowColor='#ff1100';ctx.shadowBlur=18;ctx.fillStyle='#ff2200';
  ctx.beginPath();ctx.ellipse(-bmpW*.36,bmpY-bH*.07,11,5,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(bmpW*.36,bmpY-bH*.07,11,5,0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#0a0a0a';
  const wW=bmpW*.22,wH=bH*.20,wY=bmpY-bH*.06;
  ctx.beginPath();ctx.ellipse(-bmpW*.41,wY,wW,wH,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.ellipse(bmpW*.41,wY,wW,wH,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function _drawMinimap(state){
  const mctx=_miniCtx,MW=_miniCanvas.width,MH=_miniCanvas.height,pad=8;
  mctx.clearRect(0,0,MW,MH);mctx.fillStyle='rgba(4,2,12,0.88)';mctx.fillRect(0,0,MW,MH);
  const{x:bx,y:by,w:bw,h:bh}=WORLD_BOUNDS;
  const toMini=(wx,wy)=>({x:pad+((wx-bx)/bw)*(MW-pad*2),y:pad+((wy-by)/bh)*(MH-pad*2)});
  mctx.strokeStyle='#3a2255';mctx.lineWidth=7;mctx.lineCap='round';mctx.lineJoin='round';
  mctx.beginPath();const f0=toMini(TRACK_WAYPOINTS[0].x,TRACK_WAYPOINTS[0].y);mctx.moveTo(f0.x,f0.y);
  for(let i=1;i<=TRACK_WAYPOINTS.length;i++){const wp=TRACK_WAYPOINTS[i%TRACK_WAYPOINTS.length];const m=toMini(wp.x,wp.y);mctx.lineTo(m.x,m.y);}
  mctx.closePath();mctx.stroke();
  mctx.strokeStyle='#7755cc';mctx.lineWidth=2.5;mctx.beginPath();mctx.moveTo(f0.x,f0.y);
  for(let i=1;i<=TRACK_WAYPOINTS.length;i++){const wp=TRACK_WAYPOINTS[i%TRACK_WAYPOINTS.length];const m=toMini(wp.x,wp.y);mctx.lineTo(m.x,m.y);}
  mctx.closePath();mctx.stroke();
  for(const c of Object.values(state.cars)){if(!c)continue;const m=toMini(c.x,c.y);mctx.shadowColor=c.isLocal?'#d4ff00':(c.carDef?.color||'#fff');mctx.shadowBlur=c.isLocal?8:4;mctx.fillStyle=c.isLocal?'#d4ff00':(c.carDef?.color||'#fff');mctx.beginPath();mctx.arc(m.x,m.y,c.isLocal?5:3.5,0,Math.PI*2);mctx.fill();mctx.shadowBlur=0;}
  const local=state.localCar;if(local){const m=toMini(local.x,local.y),a=local.angle,ts=6;mctx.fillStyle='#ffffff';mctx.beginPath();mctx.moveTo(m.x+Math.cos(a)*ts*2,m.y+Math.sin(a)*ts*2);mctx.lineTo(m.x+Math.cos(a+2.5)*ts,m.y+Math.sin(a+2.5)*ts);mctx.lineTo(m.x+Math.cos(a-2.5)*ts,m.y+Math.sin(a-2.5)*ts);mctx.closePath();mctx.fill();}
}

function _updateDamageFlash(state){const el=document.getElementById('damage-flash');if(!el)return;if(state.damageFlash>0){state.damageFlash--;el.classList.remove('hidden');}else el.classList.add('hidden');}

function _updateLivePositions(state){
  const el=document.getElementById('lp-list');if(!el)return;
  const sorted=Object.values(state.cars).filter(c=>c).sort((a,b)=>raceMetric(b)-raceMetric(a));
  el.innerHTML=sorted.map((c,i)=>`<div class="lp-row${c.isLocal?' lp-me':''}"><span class="lp-rank">${i+1}</span><span class="lp-name" style="color:${c.carDef?.color||'#fff'}">${c.name||'???'}</span><span class="lp-lap">L${Math.min(c.lap+1,state.totalLaps)}</span></div>`).join('');
}
