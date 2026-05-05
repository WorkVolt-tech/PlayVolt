// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER v8 (scanline OutRun style)
// No waypoint projection — pure per-row scanline math.
// Eliminates all flickering and crossing artifacts.
// ══════════════════════════════════════════════════

let _canvas, _ctx, _miniCanvas, _miniCtx;
let _W = 0, _H = 0;

const CAM = {
  horizonRatio: 0.40,
  carYRatio:    0.78,
  roadHalf:     0.52,   // road half-width as fraction of screen at max scale
  drawDist:     180,    // segments to look ahead
  shake:        0,
};

// Track segments derived from TRACK_WAYPOINTS — curve per segment
let _trackSegs = [];
let _segLen     = 200;  // world units per segment

function initRenderer() {
  _canvas     = document.getElementById('game-canvas');
  _ctx        = _canvas.getContext('2d');
  _miniCanvas = document.getElementById('minimap-canvas');
  _miniCtx    = _miniCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  _buildTrackSegs();
}

function resizeCanvas() {
  _canvas.width  = _W = window.innerWidth;
  _canvas.height = _H = window.innerHeight;
}

// Convert TRACK_WAYPOINTS into a flat list of curve values
// curve = how much the road bends left/right at each world segment
function _buildTrackSegs() {
  _trackSegs = [];
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const a = TRACK_WAYPOINTS[i];
    const b = TRACK_WAYPOINTS[(i + 1) % n];
    const c = TRACK_WAYPOINTS[(i + 2) % n];
    // Direction change between consecutive segments = curve
    const a1 = Math.atan2(b.y - a.y, b.x - a.x);
    const a2 = Math.atan2(c.y - b.y, c.x - b.x);
    let da = a2 - a1;
    while (da >  Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    _trackSegs.push({ curve: da * 6.0 });
  }
}

// Get curve value at a given world distance along track
function _getCurveAt(worldPos) {
  const n   = _trackSegs.length;
  const idx = Math.floor(worldPos / _segLen) % n;
  return _trackSegs[((idx % n) + n) % n].curve;
}

// Car's position along the track (world units), derived from nearest waypoint
function _getCarTrackPos(car) {
  const nearest = nearestTrackPoint(car.x, car.y);
  // Accumulate distance up to nearest waypoint
  let dist = 0;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < nearest.index; i++) {
    const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i+1) % n];
    dist += Math.hypot(b.x - a.x, b.y - a.y);
  }
  dist += nearest.t * Math.hypot(
    TRACK_WAYPOINTS[(nearest.index+1)%n].x - TRACK_WAYPOINTS[nearest.index].x,
    TRACK_WAYPOINTS[(nearest.index+1)%n].y - TRACK_WAYPOINTS[nearest.index].y
  );
  return dist;
}

// ════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════
function renderFrame(state) {
  if (!_canvas) return;
  const car = state.localCar;
  if (!car) return;

  if (state.screenShake > 0) {
    CAM.shake = Math.max(CAM.shake, state.screenShake * 2.5);
    state.screenShake = Math.max(0, state.screenShake - 0.8);
  }
  let shakeX = 0, shakeY = 0;
  if (CAM.shake > 0) {
    shakeX = (Math.random() - .5) * CAM.shake;
    shakeY = (Math.random() - .5) * CAM.shake * .4;
    CAM.shake = Math.max(0, CAM.shake - 1.8);
  }

  const ctx = _ctx;
  ctx.save();
  if (shakeX || shakeY) ctx.translate(shakeX, shakeY);
  _drawSkyGround(ctx);
  _drawRoad(ctx, car, state);
  _drawLocalCar(ctx, car);
  ctx.restore();

  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

// ════════════════════════════════════════════
// SKY + GROUND
// ════════════════════════════════════════════
function _drawSkyGround(ctx) {
  const hy = Math.floor(_H * CAM.horizonRatio);

  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#05011c');
  sky.addColorStop(1, '#1a0845');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, _W, hy);

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  for (let i = 0; i < 120; i++) {
    const sx = ((i*173.3+7)%997)/997*_W;
    const sy = ((i*251.7+31)%883)/883*(hy-10);
    ctx.beginPath(); ctx.arc(sx, sy, i%11===0?1.3:.55, 0, 6.28); ctx.fill();
  }

  ctx.fillStyle = 'rgba(120,50,255,0.22)';
  ctx.fillRect(0, hy - 18, _W, 18);

  ctx.fillStyle = 'rgba(160,80,255,0.55)';
  ctx.fillRect(0, hy, _W, 1);

  const gnd = ctx.createLinearGradient(0, hy, 0, _H);
  gnd.addColorStop(0, '#12082a');
  gnd.addColorStop(1, '#060310');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, hy, _W, _H - hy);
}

// ════════════════════════════════════════════
// ROAD — pure scanline renderer
// For each screen row from horizon→car, compute depth,
// look up which track segment that row sees, get curve,
// draw road strip. No waypoint projection = no flickering.
// ════════════════════════════════════════════
function _drawRoad(ctx, car, state) {
  const HORIZON   = Math.floor(_H * CAM.horizonRatio);
  const CAR_Y     = Math.floor(_H * CAM.carYRatio);
  const screenH   = CAR_Y - HORIZON;
  const cx        = _W / 2;
  const camPos    = _getCarTrackPos(car);

  // Lateral offset: how far car is from road centre (for road position on screen)
  // We use nearestTrackPoint lateral distance
  const nearest   = nearestTrackPoint(car.x, car.y);
  // Lateral = dot of (car - nearestPt) with road normal
  const npx = nearest.wx, npy = nearest.wy;
  const seg0 = TRACK_WAYPOINTS[nearest.index];
  const seg1 = TRACK_WAYPOINTS[(nearest.index + 1) % TRACK_WAYPOINTS.length];
  const fwdX = seg1.x - seg0.x, fwdY = seg1.y - seg0.y;
  const fwdL = Math.hypot(fwdX, fwdY) || 1;
  const normX = -fwdY / fwdL, normY = fwdX / fwdL;
  const lateralWorld = (car.x - npx) * normX + (car.y - npy) * normY;
  // Convert lateral world offset to a screen fraction
  const lateralScreen = (lateralWorld / ROAD_HALF) * CAM.roadHalf * _W * 0.5;

  // Build one row per pixel from HORIZON to CAR_Y
  const rows = [];
  let curveX = 0;

  for (let y = HORIZON + 1; y <= CAR_Y; y++) {
    // t: 0 at horizon (far), 1 at car (near)
    const t = (y - HORIZON) / screenH;
    // Quadratic perspective: near rows much wider than far
    const scale  = t * t;
    const roadPx = CAM.roadHalf * scale * _W;

    // Which track segment does this row correspond to?
    const worldDist = (1 - t) * CAM.drawDist * _segLen;
    const curve     = _getCurveAt(camPos + worldDist);

    // Accumulate curve offset (far rows steer the horizon, near rows affect car)
    curveX += curve * (1 - t) * 0.10;

    // Road centre x: screen centre + curve drift - lateral car offset
    const roadCX = cx + curveX - lateralScreen * scale;
    const lx = roadCX - roadPx;
    const rx = roadCX + roadPx;

    // Band alternates for distance illusion
    const segIdx = Math.floor((camPos + worldDist) / _segLen);
    const band   = Math.floor(segIdx) % 2;

    rows.push({ y, lx, rx, band, scale, roadCX });
  }

  // Draw strips top→bottom (far→near, no sorting needed, no flicker)
  for (let i = 0; i < rows.length - 1; i++) {
    const r0 = rows[i], r1 = rows[i + 1];
    const roadW = r1.rx - r1.lx;
    const band  = r0.band;

    // Road surface
    ctx.fillStyle = band ? '#23233a' : '#1c1c30';
    ctx.beginPath();
    ctx.moveTo(r0.lx, r0.y); ctx.lineTo(r0.rx, r0.y);
    ctx.lineTo(r1.rx, r1.y); ctx.lineTo(r1.lx, r1.y);
    ctx.closePath();
    ctx.fill();

    // Kerbs
    const kFrac = 0.055;
    const kCol  = band ? '#cc1111' : '#dddddd';
    ctx.fillStyle = kCol;
    const k0W = (r0.rx - r0.lx) * kFrac;
    const k1W = (r1.rx - r1.lx) * kFrac;
    // Left kerb
    ctx.beginPath();
    ctx.moveTo(r0.lx,       r0.y); ctx.lineTo(r0.lx + k0W, r0.y);
    ctx.lineTo(r1.lx + k1W, r1.y); ctx.lineTo(r1.lx,       r1.y);
    ctx.closePath(); ctx.fill();
    // Right kerb
    ctx.beginPath();
    ctx.moveTo(r0.rx,       r0.y); ctx.lineTo(r0.rx - k0W, r0.y);
    ctx.lineTo(r1.rx - k1W, r1.y); ctx.lineTo(r1.rx,       r1.y);
    ctx.closePath(); ctx.fill();

    // Centre dashes
    if (band === 0) {
      ctx.fillStyle = 'rgba(212,255,0,0.75)';
      const mW0 = Math.max(1, (r0.rx - r0.lx) * 0.013);
      const mW1 = Math.max(1, (r1.rx - r1.lx) * 0.013);
      const mx0 = r0.roadCX, mx1 = r1.roadCX;
      ctx.beginPath();
      ctx.moveTo(mx0 - mW0, r0.y); ctx.lineTo(mx0 + mW0, r0.y);
      ctx.lineTo(mx1 + mW1, r1.y); ctx.lineTo(mx1 - mW1, r1.y);
      ctx.closePath(); ctx.fill();
    }
  }

  // Edge glow lines drawn as smooth curves over road
  if (rows.length > 1) {
    ctx.strokeStyle = 'rgba(180,80,255,0.4)';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(rows[0].lx, rows[0].y);
    for (let i = 1; i < rows.length; i++) ctx.lineTo(rows[i].lx, rows[i].y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rows[0].rx, rows[0].y);
    for (let i = 1; i < rows.length; i++) ctx.lineTo(rows[i].rx, rows[i].y);
    ctx.stroke();
  }

  // Horizon fade
  const fade = ctx.createLinearGradient(0, HORIZON - 1, 0, HORIZON + 28);
  fade.addColorStop(0, 'rgba(10,4,28,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, HORIZON - 1, _W, 30);

  // Draw world objects (pickups, mines, remote cars, projectiles) on top of road
  _drawWorldObjects(ctx, car, state, rows);
}

// ════════════════════════════════════════════
// WORLD OBJECTS
// Project using the same scanline depth logic
// ════════════════════════════════════════════
function _worldToScreen(wx, wy, car, rows) {
  const HORIZON = Math.floor(_H * CAM.horizonRatio);
  const CAR_Y   = Math.floor(_H * CAM.carYRatio);
  const screenH = CAR_Y - HORIZON;

  // Distance from car in world units along track direction
  const fwdX = Math.cos(car.angle), fwdY = Math.sin(car.angle);
  const latX = -fwdY, latY = fwdX;
  const dx = wx - car.x, dy = wy - car.y;
  const fwd = dx * fwdX + dy * fwdY;   // forward distance
  const lat = dx * latX + dy * latY;   // lateral distance

  if (fwd <= 0) return null;

  // Map fwd distance to screen row
  // t = 1 - fwd/(drawDist*segLen) clamped to [0,1]
  const maxDist = CAM.drawDist * _segLen;
  const t = Math.max(0, Math.min(1, 1 - fwd / maxDist));
  if (t < 0.01) return null;

  const scale  = t * t;
  const sy     = HORIZON + t * screenH;
  const roadPx = CAM.roadHalf * scale * _W;

  // Find the row closest to this sy to get the curve offset
  const rowIdx = Math.max(0, Math.min(rows.length - 1, Math.floor(t * rows.length)));
  const row    = rows[rowIdx];
  const roadCX = row ? row.roadCX : _W / 2;

  // Lateral: convert world lateral to screen pixels at this depth
  const screenLat = (lat / ROAD_HALF) * roadPx;
  const sx = roadCX + screenLat;

  return { sx, sy, scale };
}

function _objOnScreen(p) {
  if (!p) return false;
  const hy = _H * CAM.horizonRatio;
  return p.sy > hy && p.sy < _H + 60 && p.sx > -200 && p.sx < _W + 200 && p.scale > 0.004;
}

function _drawWorldObjects(ctx, car, state, rows) {
  const objs = [];

  for (const pu of (state.pickups || [])) {
    if (!pu.active) continue;
    const p = _worldToScreen(pu.x, pu.y, car, rows);
    if (_objOnScreen(p)) objs.push({ type: 'pickup', data: pu, p });
  }
  for (const m of (state.mines || [])) {
    const p = _worldToScreen(m.x, m.y, car, rows);
    if (_objOnScreen(p)) objs.push({ type: 'mine', data: m, p });
  }
  for (const rc of Object.values(state.cars)) {
    if (!rc || rc.isLocal || rc.dead) continue;
    const p = _worldToScreen(rc.x, rc.y, car, rows);
    if (_objOnScreen(p)) objs.push({ type: 'car', data: rc, p });
  }

  // far to near
  objs.sort((a, b) => a.p.sy - b.p.sy);

  for (const o of objs) {
    if      (o.type === 'pickup') _drawPickup(ctx, o.data, o.p);
    else if (o.type === 'mine')   _drawMine(ctx, o.data, o.p);
    else if (o.type === 'car')    _drawRemoteCar(ctx, o.data, o.p, car);
  }

  // Projectiles & particles
  for (const pr of (state.projectiles || [])) {
    for (let i = 0; i < pr.trail.length; i++) {
      const tp = _worldToScreen(pr.trail[i].x, pr.trail[i].y, car, rows);
      if (!_objOnScreen(tp)) continue;
      ctx.globalAlpha = (i / pr.trail.length) * 0.5;
      ctx.fillStyle   = pr.color;
      ctx.beginPath(); ctx.arc(tp.sx, tp.sy, Math.max(1, 5 * tp.scale), 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const p = _worldToScreen(pr.x, pr.y, car, rows);
    if (!_objOnScreen(p)) continue;
    ctx.save(); ctx.translate(p.sx, p.sy);
    ctx.shadowColor = pr.color; ctx.shadowBlur = 16;
    ctx.fillStyle   = pr.color;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(2, 12 * p.scale), 0, 6.28); ctx.fill();
    ctx.restore();
  }
  for (const pp of (state.particles || [])) {
    const p = _worldToScreen(pp.x, pp.y, car, rows);
    if (!_objOnScreen(p)) continue;
    ctx.globalAlpha = pp.alpha;
    ctx.fillStyle   = pp.color;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1, pp.r * p.scale), 0, 6.28); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function _drawPickup(ctx, pu, p) {
  const wt = WEAPON_TYPES[pu.weapon], s = Math.max(.05, p.scale), sz = Math.max(6, 55*s), pulse = Math.sin(pu.pulse||0)*.3+.7;
  ctx.save(); ctx.translate(p.sx, p.sy - sz*.5); ctx.rotate(((Date.now()/1400)%1)*6.28);
  ctx.shadowColor = wt?wt.color:'#fff'; ctx.shadowBlur = 18*pulse; ctx.strokeStyle = wt?wt.color:'#fff'; ctx.lineWidth = Math.max(1.5,3*s);
  ctx.fillStyle = 'rgba(5,2,20,0.88)'; ctx.beginPath(); ctx.rect(-sz/2,-sz/2,sz,sz); ctx.fill(); ctx.stroke();
  ctx.rotate(-(((Date.now()/1400)%1)*6.28)); ctx.shadowBlur = 0;
  ctx.font = `${Math.max(10,24*s)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
  ctx.fillText(wt?wt.icon:'?', 0, 0); ctx.restore();
}

function _drawMine(ctx, m, p) {
  const s = Math.max(.05,p.scale), sz = Math.max(3,16*s), pulse = Math.sin(m.pulse||0)*.4+.6;
  ctx.save(); ctx.translate(p.sx, p.sy-sz); ctx.shadowColor = m.color; ctx.shadowBlur = m.armed?18*pulse:5;
  ctx.fillStyle = m.armed?m.color:'#555'; ctx.beginPath(); ctx.arc(0,0,sz,0,6.28); ctx.fill(); ctx.restore();
}

function _drawRemoteCar(ctx, rc, p, localCar) {
  const s = Math.max(.04,p.scale), carDef = rc.carDef||CARS.find(c=>c.id===rc.carId)||CARS[4];
  const bW = Math.max(8,carDef.bodyW*s*2.4), bH = Math.max(6,carDef.bodyH*s*2.0);
  let relA = rc.angle-localCar.angle; while(relA>Math.PI)relA-=6.28; while(relA<-Math.PI)relA+=6.28;
  const skew = relA*bW*.35;
  ctx.save(); ctx.translate(p.sx, p.sy-bH*.5);
  ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(skew*.3,bH*.5,bW*.5,bH*.12,0,0,6.28); ctx.fill();
  if(rc.shieldTimer>0){ctx.strokeStyle='#00aaff';ctx.lineWidth=2.5;ctx.shadowColor='#00aaff';ctx.shadowBlur=14;ctx.globalAlpha=.65;ctx.beginPath();ctx.ellipse(0,0,bW*.65,bH,0,0,6.28);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;}
  ctx.shadowColor=carDef.color;ctx.shadowBlur=8;ctx.fillStyle=carDef.color2;
  const tw=bW*.75;
  ctx.beginPath();ctx.moveTo(-bW/2+skew*.6,bH*.44);ctx.lineTo(bW/2+skew*.6,bH*.44);ctx.lineTo(tw/2+skew,-bH*.56);ctx.lineTo(-tw/2+skew,-bH*.56);ctx.closePath();ctx.fill();
  ctx.fillStyle=carDef.color;ctx.beginPath();ctx.moveTo(-bW*.36+skew*.6,bH*.08);ctx.lineTo(bW*.36+skew*.6,bH*.08);ctx.lineTo(tw*.36+skew,-bH*.56);ctx.lineTo(-tw*.36+skew,-bH*.56);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#ff2200';ctx.shadowColor='#ff2200';ctx.shadowBlur=8;
  ctx.beginPath();ctx.ellipse(bW*.37+skew*.6,bH*.36,Math.max(1,3*s),Math.max(1,2*s),0,0,6.28);ctx.fill();
  ctx.beginPath();ctx.ellipse(-bW*.37+skew*.6,bH*.36,Math.max(1,3*s),Math.max(1,2*s),0,0,6.28);ctx.fill();
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

// ════════════════════════════════════════════
// LOCAL CAR
// ════════════════════════════════════════════
function _drawLocalCar(ctx, car) {
  const carDef = car.carDef || CARS[4];
  const cx = _W * .5, cy = _H * CAM.carYRatio + 10;
  const lX = -Math.sin(car.angle), lY = Math.cos(car.angle);
  const latVel = (car.vx||0)*lX + (car.vy||0)*lY;
  const lean   = Math.max(-.16, Math.min(.16, latVel * -.008));
  const bW = 94, bH = 58;

  ctx.save(); ctx.translate(cx, cy); ctx.rotate(lean);

  if (car.isBoosting) {
    for (const [fx] of [[-28],[0],[28]]) {
      const fH=32+Math.random()*28, fW=9+Math.random()*5;
      const g=ctx.createLinearGradient(fx,bH*.5,fx,bH*.5+fH);
      g.addColorStop(0,carDef.color); g.addColorStop(.45,'#ff6600'); g.addColorStop(1,'transparent');
      ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(fx,bH*.5+fH*.45,fW*.5,fH*.5,0,0,6.28); ctx.fill();
    }
  }

  ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(3,bH*.58,bW*.52,bH*.15,0,0,6.28); ctx.fill();

  if (car.shieldTimer>0) {
    ctx.strokeStyle='#00aaff';ctx.lineWidth=3.5;ctx.shadowColor='#00aaff';ctx.shadowBlur=24;
    ctx.globalAlpha=Math.min(1,car.shieldTimer/60)*.7;
    ctx.beginPath();ctx.ellipse(0,0,bW*.68,bH*1.1,0,0,6.28);ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;
  }

  const hoodW=bW*.90,bmpW=bW*.80,hoodY=-bH*.50,bmpY=bH*.48;
  ctx.shadowColor=carDef.color;ctx.shadowBlur=14;ctx.fillStyle=carDef.color2;
  ctx.beginPath();ctx.moveTo(-bmpW/2,bmpY);ctx.lineTo(bmpW/2,bmpY);ctx.lineTo(hoodW/2,hoodY);ctx.lineTo(-hoodW/2,hoodY);ctx.closePath();ctx.fill();
  ctx.fillStyle=carDef.color;
  ctx.beginPath();ctx.moveTo(-bmpW*.34,bmpY*.18);ctx.lineTo(bmpW*.34,bmpY*.18);ctx.lineTo(hoodW*.34,hoodY);ctx.lineTo(-hoodW*.34,hoodY);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;
  ctx.fillStyle='rgba(100,180,255,0.15)';ctx.strokeStyle='rgba(160,210,255,0.35)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(-hoodW*.30,hoodY+bH*.12);ctx.lineTo(hoodW*.30,hoodY+bH*.12);ctx.lineTo(hoodW*.28,hoodY+bH*.35);ctx.lineTo(-hoodW*.28,hoodY+bH*.35);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowColor='#ffffaa';ctx.shadowBlur=20;ctx.fillStyle='#ffffcc';
  ctx.beginPath();ctx.ellipse(-hoodW*.355,hoodY+bH*.09,9,5,0,0,6.28);ctx.fill();
  ctx.beginPath();ctx.ellipse(hoodW*.355,hoodY+bH*.09,9,5,0,0,6.28);ctx.fill();
  ctx.shadowColor='#ff1100';ctx.shadowBlur=18;ctx.fillStyle='#ff2200';
  ctx.beginPath();ctx.ellipse(-bmpW*.36,bmpY-bH*.07,11,5,0,0,6.28);ctx.fill();
  ctx.beginPath();ctx.ellipse(bmpW*.36,bmpY-bH*.07,11,5,0,0,6.28);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#0a0a0a';
  const wW=bmpW*.22,wH=bH*.20,wY=bmpY-bH*.06;
  ctx.beginPath();ctx.ellipse(-bmpW*.41,wY,wW,wH,0,0,6.28);ctx.fill();
  ctx.beginPath();ctx.ellipse(bmpW*.41,wY,wW,wH,0,0,6.28);ctx.fill();
  ctx.restore();
}

// ════════════════════════════════════════════
// MINIMAP
// ════════════════════════════════════════════
function _drawMinimap(state) {
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
  for(const c of Object.values(state.cars)){if(!c)continue;const m=toMini(c.x,c.y);mctx.shadowColor=c.isLocal?'#d4ff00':(c.carDef?.color||'#fff');mctx.shadowBlur=c.isLocal?8:4;mctx.fillStyle=c.isLocal?'#d4ff00':(c.carDef?.color||'#fff');mctx.beginPath();mctx.arc(m.x,m.y,c.isLocal?5:3.5,0,6.28);mctx.fill();mctx.shadowBlur=0;}
  const local=state.localCar;
  if(local){const m=toMini(local.x,local.y),a=local.angle,ts=6;mctx.fillStyle='#ffffff';mctx.beginPath();mctx.moveTo(m.x+Math.cos(a)*ts*2,m.y+Math.sin(a)*ts*2);mctx.lineTo(m.x+Math.cos(a+2.5)*ts,m.y+Math.sin(a+2.5)*ts);mctx.lineTo(m.x+Math.cos(a-2.5)*ts,m.y+Math.sin(a-2.5)*ts);mctx.closePath();mctx.fill();}
}

function _updateDamageFlash(state){
  const el=document.getElementById('damage-flash');if(!el)return;
  if(state.damageFlash>0){state.damageFlash--;el.classList.remove('hidden');}else el.classList.add('hidden');
}

function _updateLivePositions(state){
  const el=document.getElementById('lp-list');if(!el)return;
  const sorted=Object.values(state.cars).filter(c=>c).sort((a,b)=>raceMetric(b)-raceMetric(a));
  el.innerHTML=sorted.map((c,i)=>`<div class="lp-row${c.isLocal?' lp-me':''}"><span class="lp-rank">${i+1}</span><span class="lp-name" style="color:${c.carDef?.color||'#fff'}">${c.name||'???'}</span><span class="lp-lap">L${Math.min(c.lap+1,state.totalLaps)}</span></div>`).join('');
}
