// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER v4
// Proper Asphalt/OutRun style chase camera.
//
// HOW IT WORKS:
// 1. Camera sits behind + above the local car (world space)
// 2. Every world point is transformed into CAMERA space:
//      rotate so camera faces forward (+Z is ahead of car)
//      translate so camera is at origin
// 3. Perspective project: sx = W/2 + camX/camZ * focalLen
//                         sy = horizon - camY/camZ * focalLen
// 4. Draw road by walking TRACK waypoints ahead of the car,
//    projecting each left/right edge pair, drawing trapezoids.
// 5. Draw objects (cars, pickups) by projecting their centres.
//
// The car itself is NOT drawn in 3D — it's a fixed sprite
// at the bottom-centre of screen (like Asphalt / OutRun).
// ══════════════════════════════════════════════════

let _canvas, _ctx, _miniCanvas, _miniCtx;
let _W = 0, _H = 0;

// ── Camera parameters (tunable) ──
const CAM = {
  heightAboveRoad: 160,   // world units above road surface
  behindCar:       200,   // world units behind car
  focalLen:        600,   // perspective strength (higher = more zoom)
  horizonRatio:    0.42,  // where horizon sits (0=top, 1=bottom)
  smoothX:         0,     // current smoothed camera world X
  smoothY:         0,     // current smoothed camera world Y
  smoothAngle:     0,     // current smoothed camera yaw
  shake:           0,
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

// ════════════════════════════════════════════
// COORDINATE TRANSFORM HELPERS
// ════════════════════════════════════════════

// Transform a world (wx, wy) point into camera-local (cx, cz) space.
// Camera is at (CAM.smoothX, CAM.smoothY) facing angle CAM.smoothAngle.
// cx = lateral (left/right), cz = depth (forward from camera)
function worldToCam(wx, wy) {
  const dx  = wx - CAM.smoothX;
  const dy  = wy - CAM.smoothY;
  const cos = Math.cos(-CAM.smoothAngle);
  const sin = Math.sin(-CAM.smoothAngle);
  return {
    cx:  dx * cos - dy * sin,   // lateral
    cz:  dx * sin + dy * cos,   // depth (positive = in front)
  };
}

// Project camera-space (cx, cz) + worldHeight into screen (sx, sy) + scale
// Returns null if behind camera (cz <= 0)
function camToScreen(cx, cz, worldHeight = 0) {
  if (cz < 1) return null;
  const horizonY = _H * CAM.horizonRatio;
  const sx = _W / 2 + (cx / cz) * CAM.focalLen;
  const sy = horizonY - ((worldHeight - CAM.heightAboveRoad) / cz) * CAM.focalLen;
  const scale = CAM.focalLen / cz;
  return { sx, sy, scale };
}

// ════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════
function renderFrame(state) {
  if (!_canvas) return;
  const ctx = _ctx;

  // Update camera position
  _updateCamera(state);

  // Shake offset
  let shakeX = 0, shakeY = 0;
  if (CAM.shake > 0) {
    shakeX = (Math.random() - 0.5) * CAM.shake;
    shakeY = (Math.random() - 0.5) * CAM.shake * 0.4;
    CAM.shake = Math.max(0, CAM.shake - 1.5);
  }

  ctx.save();
  if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

  // 1. Sky + ground
  _drawSkyGround(ctx);

  // 2. Road strips (drawn back to front = far to near)
  _drawRoad(ctx);

  // 3. World objects at correct depth
  _drawWorldObjects(ctx, state);

  // 4. Remote cars
  _drawRemoteCars(ctx, state);

  // 5. Local car — fixed sprite at bottom-centre (Asphalt style)
  _drawLocalCar(ctx, state);

  // 6. Screen-space particles / flash
  _drawParticles(ctx, state);

  ctx.restore();

  // Flat HUD overlays
  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

// ════════════════════════════════════════════
// CAMERA UPDATE
// ════════════════════════════════════════════
function _updateCamera(state) {
  const car = state.localCar;
  if (!car) return;

  // Camera world position = directly at car (we offset with CAM.behindCar in projection)
  // Actually place camera behind the car in world space
  const camWX = car.x - Math.cos(car.angle) * CAM.behindCar;
  const camWY = car.y - Math.sin(car.angle) * CAM.behindCar;

  // Smooth follow
  const spd = 0.20;
  CAM.smoothX += (camWX - CAM.smoothX) * spd;
  CAM.smoothY += (camWY - CAM.smoothY) * spd;

  // Smooth angle — handle wrap
  let da = car.angle - CAM.smoothAngle;
  while (da >  Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  CAM.smoothAngle += da * 0.15;

  // Screen shake from state
  if (state.screenShake > 0) {
    CAM.shake = Math.max(CAM.shake, state.screenShake * 2);
    state.screenShake = Math.max(0, state.screenShake - 0.8);
  }
}

// ════════════════════════════════════════════
// SKY + GROUND
// ════════════════════════════════════════════
function _drawSkyGround(ctx) {
  const horizonY = _H * CAM.horizonRatio;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0,   '#05001a');
  sky.addColorStop(0.6, '#0f0535');
  sky.addColorStop(1,   '#1a0a4a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, _W, horizonY);

  // Stars (static pattern, no flicker)
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 100; i++) {
    const sx = ((i * 173.7 + 11) % 997) / 997 * _W;
    const sy = ((i * 251.3 + 37) % 883) / 883 * horizonY * 0.92;
    const r  = i % 5 === 0 ? 1.4 : 0.7;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }

  // Horizon glow
  const hg = ctx.createRadialGradient(_W/2, horizonY, 0, _W/2, horizonY, _W * 0.55);
  hg.addColorStop(0,   'rgba(120, 60, 255, 0.28)');
  hg.addColorStop(0.5, 'rgba(80,  30, 200, 0.10)');
  hg.addColorStop(1,   'rgba(0,   0,  0,   0)');
  ctx.fillStyle = hg;
  ctx.fillRect(0, horizonY - 100, _W, 100);

  // Ground (off-track surface seen below horizon)
  const gnd = ctx.createLinearGradient(0, horizonY, 0, _H);
  gnd.addColorStop(0,   '#150c28');
  gnd.addColorStop(0.4, '#0e0818');
  gnd.addColorStop(1,   '#080510');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, horizonY, _W, _H - horizonY);

  // Horizon line
  ctx.strokeStyle = 'rgba(160,80,255,0.4)';
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(0, horizonY); ctx.lineTo(_W, horizonY); ctx.stroke();
}

// ════════════════════════════════════════════
// ROAD RENDERING
// Walk track waypoints ahead of camera,
// project each edge pair, draw trapezoid strips.
// ════════════════════════════════════════════
function _drawRoad(ctx) {
  const n          = TRACK_WAYPOINTS.length;
  const minDepth   = 5;
  const maxStrips  = 120;   // how many segments to draw ahead
  const horizonY   = _H * CAM.horizonRatio;

  // Find nearest waypoint to camera position
  const nearest = nearestWaypoint(CAM.smoothX, CAM.smoothY);
  const startIdx = nearest.index;

  // Build projected strip data — walk forward from camera
  const strips = [];
  let   firstVisible = -1;

  for (let s = 0; s < maxStrips; s++) {
    const idx  = (startIdx + s) % n;
    const wp   = TRACK_WAYPOINTS[idx];
    const wpN  = TRACK_WAYPOINTS[(idx + 1) % n];

    // Track normal (perpendicular to direction)
    const fx   = wpN.x - wp.x, fy = wpN.y - wp.y;
    const fLen = Math.hypot(fx, fy) || 1;
    const nx   = -fy / fLen, ny = fx / fLen;  // left-pointing normal

    // Left and right road edges in world space
    const lx = wp.x + nx * ROAD_HALF,  ly = wp.y + ny * ROAD_HALF;
    const rx = wp.x - nx * ROAD_HALF,  ry = wp.y - ny * ROAD_HALF;

    // Centre line
    const cc  = worldToCam(wp.x, wp.y);
    const lc  = worldToCam(lx, ly);
    const rc  = worldToCam(rx, ry);

    // Skip if behind camera
    if (cc.cz < minDepth) continue;

    const pL  = camToScreen(lc.cx, Math.max(minDepth, lc.cz), 0);
    const pR  = camToScreen(rc.cx, Math.max(minDepth, rc.cz), 0);
    const pC  = camToScreen(cc.cx, Math.max(minDepth, cc.cz), 0);
    if (!pL || !pR || !pC) continue;

    // Stop drawing when we've gone way above screen
    if (strips.length > 10 && pL.sy < -_H * 0.5) break;

    if (firstVisible < 0) firstVisible = strips.length;

    strips.push({ pL, pR, pC, idx, s, wpIdx: idx });
  }

  if (strips.length < 2) return;

  // ── Draw from FAR (high index) to NEAR (low index) — painter's algo ──
  for (let i = strips.length - 1; i >= 1; i--) {
    const far  = strips[i];
    const near = strips[i - 1];

    const { pL: fL, pR: fR } = far;
    const { pL: nL, pR: nR } = near;

    // Clip: don't draw below screen
    if (nL.sy > _H + 60 && nR.sy > _H + 60) continue;
    // Clip: don't draw above horizon (extreme distance)
    if (fL.sy < horizonY - 20 && fR.sy < horizonY - 20) continue;

    const segIdx   = far.s;
    const altColor = Math.floor(segIdx / 4) % 2 === 0;

    // ── Road surface ──
    const rb = altColor ? 44 : 36;
    ctx.fillStyle = `rgb(${rb},${rb - 2},${rb + 10})`;
    ctx.beginPath();
    ctx.moveTo(nL.sx, nL.sy);
    ctx.lineTo(nR.sx, nR.sy);
    ctx.lineTo(fR.sx, fR.sy);
    ctx.lineTo(fL.sx, fL.sy);
    ctx.closePath();
    ctx.fill();

    // ── Kerb stripes (left and right edges) ──
    const kerbW = Math.max(1, Math.abs(nR.sx - nL.sx) * 0.07);
    const kerbCol = altColor ? '#cc1111' : '#f0f0f0';
    ctx.fillStyle = kerbCol;
    // Left kerb
    ctx.beginPath();
    ctx.moveTo(nL.sx,           nL.sy);
    ctx.lineTo(nL.sx + kerbW,   nL.sy);
    ctx.lineTo(fL.sx + kerbW,   fL.sy);
    ctx.lineTo(fL.sx,           fL.sy);
    ctx.closePath(); ctx.fill();
    // Right kerb
    ctx.beginPath();
    ctx.moveTo(nR.sx,           nR.sy);
    ctx.lineTo(nR.sx - kerbW,   nR.sy);
    ctx.lineTo(fR.sx - kerbW,   fR.sy);
    ctx.lineTo(fR.sx,           fR.sy);
    ctx.closePath(); ctx.fill();

    // ── Centre dashes ──
    if (segIdx % 8 < 4) {
      const mNx = (nL.sx + nR.sx) / 2, mNy = nL.sy;
      const mFx = (fL.sx + fR.sx) / 2, mFy = fL.sy;
      const lw  = Math.max(0.5, Math.abs(nR.sx - nL.sx) * 0.012);
      ctx.strokeStyle = 'rgba(212,255,0,0.55)';
      ctx.lineWidth   = lw;
      ctx.beginPath(); ctx.moveTo(mNx, mNy); ctx.lineTo(mFx, mFy); ctx.stroke();
    }

    // ── Road edge glow ──
    const glowAlpha = Math.min(0.4, (i / strips.length) * 0.5);
    ctx.strokeStyle = `rgba(180,80,255,${glowAlpha})`;
    ctx.lineWidth   = Math.max(0.5, Math.abs(nR.sx - nL.sx) * 0.008);
    ctx.beginPath(); ctx.moveTo(nL.sx, nL.sy); ctx.lineTo(fL.sx, fL.sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nR.sx, nR.sy); ctx.lineTo(fR.sx, fR.sy); ctx.stroke();

    // ── Start / Finish line ──
    if (far.wpIdx === 0 || near.wpIdx === 0) {
      const cols = 10;
      const rows = 3;
      const bW   = (nR.sx - nL.sx) / cols;
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < rows; row++) {
          const tx = nL.sx + col * bW;
          const ty = nL.sy - (row + 1) * Math.max(2, Math.abs(nL.sy - fL.sy) / rows);
          ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#111111';
          ctx.fillRect(tx, ty, Math.max(1, bW - 0.5), Math.max(2, Math.abs(nL.sy - fL.sy) / rows));
        }
      }
    }
  }

  // ── Road fade at horizon (blend into sky) ──
  const fade = ctx.createLinearGradient(0, horizonY, 0, horizonY + _H * 0.08);
  fade.addColorStop(0, 'rgba(26,10,74,0.95)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, horizonY - 2, _W, _H * 0.1);
}

// ════════════════════════════════════════════
// WORLD OBJECTS (pickups, mines, projectiles)
// ════════════════════════════════════════════
function _drawWorldObjects(ctx, state) {
  const objs = [];

  for (const pu of (state.pickups || [])) {
    if (!pu.active) continue;
    const c = worldToCam(pu.x, pu.y);
    if (c.cz < 10) continue;
    const p = camToScreen(c.cx, c.cz, 0);
    if (p) objs.push({ type: 'pickup', p, data: pu, cz: c.cz });
  }

  for (const m of (state.mines || [])) {
    const c = worldToCam(m.x, m.y);
    if (c.cz < 10) continue;
    const p = camToScreen(c.cx, c.cz, 0);
    if (p) objs.push({ type: 'mine', p, data: m, cz: c.cz });
  }

  for (const pr of (state.projectiles || [])) {
    const c = worldToCam(pr.x, pr.y);
    if (c.cz < 10) continue;
    const p = camToScreen(c.cx, c.cz, 10);
    if (p) objs.push({ type: 'proj', p, data: pr, cz: c.cz });
  }

  // Sort far → near
  objs.sort((a, b) => b.cz - a.cz);

  for (const obj of objs) {
    const { sx, sy, scale } = obj.p;
    const s = Math.max(0.05, Math.min(5, scale * 0.035));

    // Clip if off screen
    if (sx < -100 || sx > _W + 100 || sy < 0 || sy > _H) continue;

    ctx.save();
    ctx.translate(sx, sy);

    if (obj.type === 'pickup') {
      const wt    = WEAPON_TYPES[obj.data.weapon];
      const pulse = Math.sin((obj.data.pulse || 0)) * 0.3 + 0.7;
      const sz    = Math.max(8, 40 * s);

      ctx.shadowColor = wt ? wt.color : '#fff';
      ctx.shadowBlur  = 16 * pulse;
      ctx.strokeStyle = wt ? wt.color : '#fff';
      ctx.lineWidth   = Math.max(1.5, 2.5 * s);
      ctx.fillStyle   = 'rgba(5,2,20,0.85)';

      ctx.save();
      ctx.rotate(((Date.now() / 1200) % 1) * Math.PI * 2);
      ctx.beginPath(); ctx.rect(-sz/2, -sz/2, sz, sz);
      ctx.fill(); ctx.stroke();
      ctx.restore();

      const fs = Math.max(8, Math.min(22, 20 * s));
      ctx.font          = `${fs}px serif`;
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.shadowBlur    = 0;
      ctx.fillStyle     = '#fff';
      ctx.fillText(wt ? wt.icon : '?', 0, 0);
    }

    if (obj.type === 'mine') {
      const sz    = Math.max(4, 14 * s);
      const pulse = Math.sin(obj.data.pulse || 0) * 0.4 + 0.6;
      ctx.shadowColor = obj.data.color;
      ctx.shadowBlur  = obj.data.armed ? 18 * pulse : 5;
      ctx.fillStyle   = obj.data.armed ? obj.data.color : '#555';
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI*2); ctx.fill();
    }

    if (obj.type === 'proj') {
      const sz = Math.max(3, 10 * s);
      ctx.shadowColor = obj.data.color;
      ctx.shadowBlur  = 18;
      ctx.fillStyle   = obj.data.color;
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();
  }
}

// ════════════════════════════════════════════
// REMOTE CARS (in perspective)
// ════════════════════════════════════════════
function _drawRemoteCars(ctx, state) {
  const remoteCars = Object.values(state.cars).filter(c => c && !c.isLocal && !c.dead);

  // Sort far → near
  remoteCars.sort((a, b) => {
    const ca = worldToCam(a.x, a.y);
    const cb = worldToCam(b.x, b.y);
    return cb.cz - ca.cz;
  });

  for (const car of remoteCars) {
    const camC = worldToCam(car.x, car.y);
    if (camC.cz < 15) continue;

    const p = camToScreen(camC.cx, camC.cz, 0);
    if (!p) continue;
    if (p.sx < -200 || p.sx > _W + 200 || p.sy < 0 || p.sy > _H + 100) continue;

    const s      = Math.max(0.04, Math.min(3, p.scale * 0.04));
    const carDef = car.carDef || CARS.find(c => c.id === car.carId) || CARS[4];

    // Relative yaw for turn skew
    let relAngle = car.angle - CAM.smoothAngle;
    while (relAngle >  Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;

    const bW  = Math.max(8, carDef.bodyW * s * 2.5);
    const bH  = Math.max(6, carDef.bodyH * s * 2.0);
    const skew = relAngle * bW * 0.4;

    ctx.save();
    ctx.translate(p.sx, p.sy - bH * 0.5);

    // Ground shadow
    ctx.fillStyle   = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(skew * 0.3, bH * 0.55, bW * 0.5, bH * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield
    if (car.shieldTimer > 0) {
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth   = Math.max(1, 2.5 * s);
      ctx.shadowColor = '#00aaff';
      ctx.shadowBlur  = 16;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, bW * 0.65, bH, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    }

    // Boost trail
    if (car.isBoosting) {
      const tLen = bH * 1.8;
      const g    = ctx.createLinearGradient(0, bH*0.3, 0, bH*0.3 + tLen);
      g.addColorStop(0, carDef.color + 'bb');
      g.addColorStop(1, carDef.color + '00');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(-skew*0.4, bH*0.3 + tLen*0.4, bW*0.18, tLen*0.5, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // Car body — perspective trapezoid (top narrower = foreshortened hood)
    const tw = bW * 0.75;
    ctx.shadowColor = carDef.color;
    ctx.shadowBlur  = 8;

    ctx.fillStyle = carDef.color2;
    ctx.beginPath();
    ctx.moveTo(-bW/2 + skew*0.6,  bH*0.45);
    ctx.lineTo( bW/2 + skew*0.6,  bH*0.45);
    ctx.lineTo( tw/2 + skew,     -bH*0.55);
    ctx.lineTo(-tw/2 + skew,     -bH*0.55);
    ctx.closePath(); ctx.fill();

    // Colour stripe
    ctx.fillStyle = carDef.color;
    ctx.beginPath();
    ctx.moveTo(-bW*0.38 + skew*0.6,  bH*0.1);
    ctx.lineTo( bW*0.38 + skew*0.6,  bH*0.1);
    ctx.lineTo( tw*0.38 + skew,     -bH*0.55);
    ctx.lineTo(-tw*0.38 + skew,     -bH*0.55);
    ctx.closePath(); ctx.fill();

    ctx.shadowBlur = 0;

    // Tail lights
    ctx.fillStyle   = '#ff2200';
    ctx.shadowColor = '#ff2200';
    ctx.shadowBlur  = 8;
    ctx.beginPath(); ctx.ellipse( bW*0.38 + skew*0.6, bH*0.38, Math.max(1,3*s), Math.max(1,2*s), 0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-bW*0.38 + skew*0.6, bH*0.38, Math.max(1,3*s), Math.max(1,2*s), 0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Name + health
    const barW = bW * 1.2;
    const barH = Math.max(2, 4 * s);
    const barY = -bH * 0.6 - barH - Math.max(4, 8*s);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-barW/2, barY, barW, barH);
    const hp = Math.max(0, Math.min(1, car.health / (car.maxHealth || 100)));
    ctx.fillStyle = hp > 0.5 ? '#00ff88' : hp > 0.25 ? '#ffaa00' : '#ff3300';
    ctx.fillRect(-barW/2, barY, barW * hp, barH);

    const fs = Math.max(8, Math.min(15, 13 * s));
    ctx.font          = `700 ${fs}px Nunito, sans-serif`;
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'bottom';
    ctx.fillStyle     = carDef.color;
    ctx.shadowColor   = '#000';
    ctx.shadowBlur    = 5;
    ctx.fillText(car.name || '???', 0, barY - 2);
    ctx.shadowBlur    = 0;

    ctx.restore();
  }
}

// ════════════════════════════════════════════
// LOCAL CAR — fixed at bottom-centre (Asphalt style)
// ════════════════════════════════════════════
function _drawLocalCar(ctx, state) {
  const car = state.localCar;
  if (!car) return;

  const carDef = car.carDef || CARS[4];

  // Position: centred horizontally, lower quarter of screen
  const cx = _W / 2;
  const cy = _H * 0.78;
  const bW = 90;
  const bH = 56;

  ctx.save();
  ctx.translate(cx, cy);

  // Tilt based on lateral velocity (lean into corners)
  const facing  = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const lateral = { x: -facing.y, y: facing.x };
  const latVel  = car.vx * lateral.x + car.vy * lateral.y;
  const tilt    = Math.max(-0.18, Math.min(0.18, latVel * -0.012));
  ctx.rotate(tilt);

  // Boost flame
  if (car.isBoosting) {
    for (let f = 0; f < 3; f++) {
      const fw = 10 + Math.random() * 8;
      const fh = 28 + Math.random() * 30;
      const fx = (f - 1) * 22;
      const g  = ctx.createLinearGradient(fx, bH * 0.5, fx, bH * 0.5 + fh);
      g.addColorStop(0,   carDef.color);
      g.addColorStop(0.4, '#ff8800');
      g.addColorStop(1,   'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(fx, bH * 0.5 + fh * 0.4, fw / 2, fh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(4, bH * 0.6, bW * 0.55, bH * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Shield bubble
  if (car.shieldTimer > 0) {
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#00aaff';
    ctx.shadowBlur  = 22;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(0, 0, bW * 0.7, bH * 1.1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  // ── Car body (front-facing perspective view) ──
  // Hood (top of car — wider, further back)
  const hoodW = bW * 0.88, hoodY = -bH * 0.5;
  // Bumper (bottom — slightly narrower, closest to us)
  const bmpW  = bW * 0.78, bmpY = bH * 0.48;

  ctx.shadowColor = carDef.color;
  ctx.shadowBlur  = 12;

  // Main body
  ctx.fillStyle = carDef.color2;
  ctx.beginPath();
  ctx.moveTo(-bmpW/2,  bmpY);
  ctx.lineTo( bmpW/2,  bmpY);
  ctx.lineTo( hoodW/2, hoodY);
  ctx.lineTo(-hoodW/2, hoodY);
  ctx.closePath(); ctx.fill();

  // Colour stripe (roof/bonnet)
  ctx.fillStyle = carDef.color;
  ctx.beginPath();
  ctx.moveTo(-bmpW*0.35, bmpY * 0.2);
  ctx.lineTo( bmpW*0.35, bmpY * 0.2);
  ctx.lineTo( hoodW*0.35, hoodY);
  ctx.lineTo(-hoodW*0.35, hoodY);
  ctx.closePath(); ctx.fill();

  ctx.shadowBlur = 0;

  // Windshield
  ctx.fillStyle = 'rgba(100,180,255,0.18)';
  ctx.strokeStyle = 'rgba(150,200,255,0.35)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(-hoodW*0.3,  hoodY + bH*0.12);
  ctx.lineTo( hoodW*0.3,  hoodY + bH*0.12);
  ctx.lineTo( hoodW*0.28, hoodY + bH*0.36);
  ctx.lineTo(-hoodW*0.28, hoodY + bH*0.36);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Headlights
  ctx.shadowColor = '#ffffaa';
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = '#ffffcc';
  ctx.beginPath(); ctx.ellipse(-hoodW*0.36, hoodY + bH*0.08, 9, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( hoodW*0.36, hoodY + bH*0.08, 9, 5, 0, 0, Math.PI*2); ctx.fill();

  // Tail lights
  ctx.fillStyle   = '#ff1100';
  ctx.shadowColor = '#ff1100';
  ctx.shadowBlur  = 14;
  ctx.beginPath(); ctx.ellipse(-bmpW*0.36, bmpY - bH*0.06, 10, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( bmpW*0.36, bmpY - bH*0.06, 10, 5, 0, 0, Math.PI*2); ctx.fill();

  // Wheel arches
  ctx.fillStyle   = '#111';
  ctx.shadowBlur  = 0;
  const wheelY   = bmpY - bH * 0.05;
  const wheelW   = bmpW * 0.22, wheelH = bH * 0.2;
  ctx.beginPath(); ctx.ellipse(-bmpW*0.42, wheelY, wheelW, wheelH, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( bmpW*0.42, wheelY, wheelW, wheelH, 0, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// ════════════════════════════════════════════
// SCREEN-SPACE PARTICLES
// ════════════════════════════════════════════
function _drawParticles(ctx, state) {
  for (const p of (state.particles || [])) {
    const c = worldToCam(p.x, p.y);
    if (c.cz < 5) continue;
    const sp = camToScreen(c.cx, c.cz, 5);
    if (!sp) continue;
    const s = Math.max(0.1, sp.scale * 0.03);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = p.color;
    ctx.beginPath();
    ctx.arc(sp.sx, sp.sy, Math.max(1, p.r * s), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ════════════════════════════════════════════
// MINIMAP (flat 2D corner overlay)
// ════════════════════════════════════════════
function _drawMinimap(state) {
  const mctx = _miniCtx;
  const MW = _miniCanvas.width, MH = _miniCanvas.height, pad = 8;
  mctx.clearRect(0, 0, MW, MH);

  mctx.fillStyle = 'rgba(4,2,12,0.88)';
  mctx.fillRect(0, 0, MW, MH);

  const bx = WORLD_BOUNDS.x, by = WORLD_BOUNDS.y;
  const bw = WORLD_BOUNDS.w, bh = WORLD_BOUNDS.h;
  const toMini = (wx, wy) => ({
    x: pad + ((wx - bx) / bw) * (MW - pad*2),
    y: pad + ((wy - by) / bh) * (MH - pad*2),
  });

  // Track
  mctx.strokeStyle = '#3a2255';
  mctx.lineWidth   = 7;
  mctx.lineCap     = 'round';
  mctx.lineJoin    = 'round';
  mctx.beginPath();
  const f0 = toMini(TRACK_WAYPOINTS[0].x, TRACK_WAYPOINTS[0].y);
  mctx.moveTo(f0.x, f0.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  mctx.strokeStyle = '#7755bb';
  mctx.lineWidth   = 2.5;
  mctx.beginPath();
  mctx.moveTo(f0.x, f0.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  // Cars
  for (const car of Object.values(state.cars)) {
    if (!car) continue;
    const m = toMini(car.x, car.y);
    mctx.shadowColor = car.isLocal ? '#d4ff00' : (car.carDef?.color || '#fff');
    mctx.shadowBlur  = car.isLocal ? 8 : 4;
    mctx.fillStyle   = car.isLocal ? '#d4ff00' : (car.carDef?.color || '#fff');
    mctx.beginPath();
    mctx.arc(m.x, m.y, car.isLocal ? 5 : 3.5, 0, Math.PI*2);
    mctx.fill();
    mctx.shadowBlur = 0;
  }

  // Heading indicator for local car
  const local = state.localCar;
  if (local) {
    const m  = toMini(local.x, local.y);
    const a  = local.angle;
    const ts = 6;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(m.x + Math.cos(a)*ts*1.9, m.y + Math.sin(a)*ts*1.9);
    mctx.lineTo(m.x + Math.cos(a+2.5)*ts, m.y + Math.sin(a+2.5)*ts);
    mctx.lineTo(m.x + Math.cos(a-2.5)*ts, m.y + Math.sin(a-2.5)*ts);
    mctx.closePath(); mctx.fill();
  }
}

// ════════════════════════════════════════════
// HUD HELPERS
// ════════════════════════════════════════════
function _updateDamageFlash(state) {
  const el = document.getElementById('damage-flash');
  if (!el) return;
  if (state.damageFlash > 0) { state.damageFlash--; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function _updateLivePositions(state) {
  const el = document.getElementById('lp-list');
  if (!el) return;
  const sorted = Object.values(state.cars)
    .filter(c => c)
    .sort((a, b) => raceMetric(b) - raceMetric(a));

  el.innerHTML = sorted.map((car, i) => {
    const isMe = car.isLocal;
    return `<div class="lp-row${isMe ? ' lp-me' : ''}">
      <span class="lp-rank">${i+1}</span>
      <span class="lp-name" style="color:${car.carDef?.color||'#fff'}">${car.name||'???'}</span>
      <span class="lp-lap">L${Math.min(car.lap+1, state.totalLaps)}</span>
    </div>`;
  }).join('');
}
