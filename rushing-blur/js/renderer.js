// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER v5
//
// Based directly on CameraCar.cs logic:
//   - Camera sits behind + above the car
//   - World is rotated so car always faces "up" on screen
//   - Road drawn as a 2D top-down view FIRST, then the
//     canvas is perspective-squished vertically to fake 3D
//   - Car sprite fixed at bottom-centre (Asphalt style)
//   - Walls enforced: car cannot leave road
//
// Technique: "rotated world" approach
//   1. Translate canvas so car is at screen bottom-centre
//   2. Rotate canvas by -car.angle so car always faces up
//   3. Draw road, objects in this rotated world space
//   4. Apply vertical scale to upper half to fake perspective
// ══════════════════════════════════════════════════

let _canvas, _ctx, _miniCanvas, _miniCtx;
let _W = 0, _H = 0;

// Camera config — tweak these to adjust the look
const CAM = {
  carScreenX:    0.50,   // car horizontal position (0.5 = centre)
  carScreenY:    0.78,   // car vertical position (0.78 = lower third)
  viewScale:     0.28,   // world-units to pixels at car level (bigger = more zoomed out)
  horizonY:      0.40,   // where the horizon sits (fraction of screen height)
  perspStrength: 3.8,    // how aggressively far things shrink (higher = more 3D)
  shake:         0,
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

// ── Convert world (x,y) → screen (sx,sy) given car position + angle ──
// This is the core transform: rotate world around car, scale, perspective squish.
function worldToScreen(wx, wy, carX, carY, carAngle) {
  // 1. Offset relative to car
  const dx = wx - carX;
  const dy = wy - carY;

  // 2. Rotate so car faces "up" (negative screen Y)
  const cos = Math.cos(-carAngle - Math.PI / 2);
  const sin = Math.sin(-carAngle - Math.PI / 2);
  const rx  =  dx * cos - dy * sin;
  const ry  =  dx * sin + dy * cos;

  // 3. Base screen position (no perspective yet)
  const carSX = _W * CAM.carScreenX;
  const carSY = _H * CAM.carScreenY;
  const scale = CAM.viewScale;

  const flatX = carSX + rx * scale;
  const flatY = carSY + ry * scale;   // ry negative = above car = up screen

  // 4. Perspective squish:
  //    Things above the car (ry < 0) are farther away — squish them toward horizon.
  //    Things below the car (ry > 0) are close — barely squished.
  const horizonSY = _H * CAM.horizonY;

  // How far above car centre (0 = at car, 1 = at horizon)
  const t = Math.max(0, (carSY - flatY) / (carSY - horizonSY));
  // Squish factor: at car level t=0 → factor=1 (no squish)
  //               at horizon  t=1 → factor=0 (collapsed to horizon line)
  const squish = Math.pow(1 - t, CAM.perspStrength);

  // Apply squish: pull Y toward horizon
  const perspY = horizonSY + (flatY - horizonSY) * squish;

  // X also narrows toward vanishing point
  const perspX = carSX + (flatX - carSX) * squish;

  return { sx: perspX, sy: perspY, scale: squish };
}

// ════════════════════════════════════════════
// MAIN RENDER
// ════════════════════════════════════════════
function renderFrame(state) {
  if (!_canvas) return;

  const car = state.localCar;
  if (!car) return;

  // Update screen shake
  if (state.screenShake > 0) {
    CAM.shake = Math.max(CAM.shake, state.screenShake * 2.5);
    state.screenShake = Math.max(0, state.screenShake - 0.8);
  }
  let shakeX = 0, shakeY = 0;
  if (CAM.shake > 0) {
    shakeX = (Math.random() - 0.5) * CAM.shake;
    shakeY = (Math.random() - 0.5) * CAM.shake * 0.4;
    CAM.shake = Math.max(0, CAM.shake - 1.8);
  }

  const ctx = _ctx;
  ctx.save();
  if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

  // Draw layers
  _drawSkyGround(ctx);
  _drawRoad(ctx, car);
  _drawPickups(ctx, car, state);
  _drawMines(ctx, car, state);
  _drawProjectiles(ctx, car, state);
  _drawParticles(ctx, car, state);
  _drawRemoteCars(ctx, car, state);
  _drawLocalCar(ctx, car);

  ctx.restore();

  // Flat overlays (not affected by shake)
  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

// ════════════════════════════════════════════
// SKY + GROUND
// ════════════════════════════════════════════
function _drawSkyGround(ctx) {
  const horizonSY = _H * CAM.horizonY;

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, horizonSY);
  sky.addColorStop(0,   '#04001a');
  sky.addColorStop(0.5, '#0c0530');
  sky.addColorStop(1,   '#180a50');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, _W, horizonSY);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 120; i++) {
    const sx = ((i * 173.3 + 7)  % 997) / 997 * _W;
    const sy = ((i * 251.7 + 31) % 883) / 883 * horizonSY * 0.9;
    const r  = i % 7 === 0 ? 1.5 : 0.7;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }

  // Horizon glow
  const hg = ctx.createRadialGradient(_W*0.5, horizonSY, 10, _W*0.5, horizonSY, _W*0.5);
  hg.addColorStop(0,   'rgba(130,60,255,0.35)');
  hg.addColorStop(0.4, 'rgba(80,20,200,0.12)');
  hg.addColorStop(1,   'transparent');
  ctx.fillStyle = hg;
  ctx.fillRect(0, horizonSY - 80, _W, 80);

  // Ground (off-road)
  const gnd = ctx.createLinearGradient(0, horizonSY, 0, _H);
  gnd.addColorStop(0,   '#170c30');
  gnd.addColorStop(0.3, '#0e0820');
  gnd.addColorStop(1,   '#07050f');
  ctx.fillStyle = gnd;
  ctx.fillRect(0, horizonSY, _W, _H - horizonSY);

  // Horizon line
  ctx.strokeStyle = 'rgba(160,80,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, horizonSY); ctx.lineTo(_W, horizonSY); ctx.stroke();
}

// ════════════════════════════════════════════
// ROAD
// Walk waypoints, project each left+right edge, draw trapezoids.
// ════════════════════════════════════════════
function _drawRoad(ctx, car) {
  const n = TRACK_WAYPOINTS.length;
  const horizonSY = _H * CAM.horizonY;
  const carSY     = _H * CAM.carScreenY;

  // Find nearest waypoint to car
  const nearest  = nearestTrackPoint(car.x, car.y);
  const startIdx = nearest.index;

  // Collect projected strip data walking forward from car
  const strips = [];
  const LOOK_AHEAD = 80;   // how many segments ahead to draw
  const LOOK_BEHIND = 8;   // draw a few segments behind car too

  for (let s = -LOOK_BEHIND; s < LOOK_AHEAD; s++) {
    const idx  = ((startIdx + s) % n + n) % n;
    const wp   = TRACK_WAYPOINTS[idx];
    const wpN  = TRACK_WAYPOINTS[(idx + 1) % n];

    // Track normal (perpendicular to road direction)
    const fx   = wpN.x - wp.x, fy = wpN.y - wp.y;
    const fLen = Math.hypot(fx, fy) || 1;
    const nx   = -fy / fLen, ny = fx / fLen;

    // Left and right road edges
    const lx = wp.x + nx * ROAD_HALF, ly = wp.y + ny * ROAD_HALF;
    const rx = wp.x - nx * ROAD_HALF, ry = wp.y - ny * ROAD_HALF;

    const pL = worldToScreen(lx, ly, car.x, car.y, car.angle);
    const pR = worldToScreen(rx, ry, car.x, car.y, car.angle);
    const pC = worldToScreen(wp.x, wp.y, car.x, car.y, car.angle);

    // Only include strips that are on screen or just off
    if (pC.sy < horizonSY - 20 && s > 0) break;  // gone past horizon
    if (pC.sy > _H + 200 && s > 0) continue;       // below screen (behind car)

    strips.push({ pL, pR, pC, segIdx: s, wpIdx: idx });
  }

  if (strips.length < 2) return;

  // Draw far → near (painter's algorithm)
  // Sort by sy ascending (highest on screen = farthest)
  strips.sort((a, b) => a.pC.sy - b.pC.sy);

  for (let i = 0; i < strips.length - 1; i++) {
    const far  = strips[i];
    const near = strips[i + 1];

    // Skip strips entirely above horizon or below screen
    if (near.pL.sy < horizonSY - 10 && near.pR.sy < horizonSY - 10) continue;
    if (far.pL.sy  > _H + 100       && far.pR.sy  > _H + 100)       continue;

    // Clamp to horizon at top
    const fLsy = Math.max(far.pL.sy,  horizonSY);
    const fRsy = Math.max(far.pR.sy,  horizonSY);
    const nLsy = Math.max(near.pL.sy, horizonSY);
    const nRsy = Math.max(near.pR.sy, horizonSY);

    const altColor = Math.floor(i / 5) % 2 === 0;

    // ── Road surface ──
    const rb = altColor ? 46 : 36;
    ctx.fillStyle = `rgb(${rb},${rb},${rb + 12})`;
    ctx.beginPath();
    ctx.moveTo(far.pL.sx,  fLsy);
    ctx.lineTo(far.pR.sx,  fRsy);
    ctx.lineTo(near.pR.sx, nRsy);
    ctx.lineTo(near.pL.sx, nLsy);
    ctx.closePath();
    ctx.fill();

    // ── Kerb stripes ──
    const roadW  = Math.abs(near.pR.sx - near.pL.sx);
    const kerbW  = Math.max(1, roadW * 0.06);
    const kerbC  = altColor ? '#cc1111' : '#eeeeee';
    ctx.fillStyle = kerbC;

    // Left kerb
    ctx.beginPath();
    ctx.moveTo(far.pL.sx,          fLsy);
    ctx.lineTo(far.pL.sx + kerbW,  fLsy);
    ctx.lineTo(near.pL.sx + kerbW, nLsy);
    ctx.lineTo(near.pL.sx,         nLsy);
    ctx.closePath(); ctx.fill();

    // Right kerb
    ctx.beginPath();
    ctx.moveTo(far.pR.sx,          fRsy);
    ctx.lineTo(far.pR.sx - kerbW,  fRsy);
    ctx.lineTo(near.pR.sx - kerbW, nRsy);
    ctx.lineTo(near.pR.sx,         nRsy);
    ctx.closePath(); ctx.fill();

    // ── Centre dashes ──
    if (i % 8 < 4) {
      const mFx = (far.pL.sx  + far.pR.sx)  / 2;
      const mNx = (near.pL.sx + near.pR.sx) / 2;
      ctx.strokeStyle = 'rgba(212,255,0,0.6)';
      ctx.lineWidth   = Math.max(0.8, roadW * 0.012);
      ctx.beginPath();
      ctx.moveTo(mFx, fLsy);
      ctx.lineTo(mNx, nLsy);
      ctx.stroke();
    }

    // ── Edge glow ──
    const gAlpha = Math.min(0.35, (1 - i / strips.length) * 0.4);
    ctx.strokeStyle = `rgba(180,80,255,${gAlpha})`;
    ctx.lineWidth   = Math.max(0.5, roadW * 0.006);
    ctx.beginPath(); ctx.moveTo(far.pL.sx, fLsy); ctx.lineTo(near.pL.sx, nLsy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(far.pR.sx, fRsy); ctx.lineTo(near.pR.sx, nRsy); ctx.stroke();

    // ── Start/Finish line ──
    if (far.wpIdx === 0 || (far.wpIdx === n - 1 && near.wpIdx === 0)) {
      const cols = 10;
      const bW   = roadW / cols;
      const rowH = Math.max(2, Math.abs(nLsy - fLsy) * 0.5);
      for (let col = 0; col < cols; col++) {
        for (let row = 0; row < 2; row++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#fff' : '#111';
          ctx.fillRect(
            near.pL.sx + col * bW,
            nLsy - (row + 1) * rowH,
            Math.max(1, bW - 0.5), rowH
          );
        }
      }
    }
  }

  // ── Horizon fade — blend road into sky at top ──
  const fade = ctx.createLinearGradient(0, horizonSY - 4, 0, horizonSY + _H * 0.06);
  fade.addColorStop(0,   'rgba(24,10,80,0.98)');
  fade.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, horizonSY - 4, _W, _H * 0.07);
}

// ════════════════════════════════════════════
// WORLD OBJECT HELPERS
// ════════════════════════════════════════════
function _projectObj(wx, wy, car) {
  return worldToScreen(wx, wy, car.x, car.y, car.angle);
}

function _objOnScreen(p) {
  if (!p) return false;
  if (p.sy < _H * CAM.horizonY - 20) return false;  // above horizon
  if (p.sy > _H + 100)               return false;  // below screen
  if (p.sx < -200 || p.sx > _W + 200) return false;
  if (p.scale < 0.005)               return false;
  return true;
}

// ── Pickups ──
function _drawPickups(ctx, car, state) {
  for (const pu of (state.pickups || [])) {
    if (!pu.active) continue;
    const p = _projectObj(pu.x, pu.y, car);
    if (!_objOnScreen(p)) continue;

    const wt   = WEAPON_TYPES[pu.weapon];
    const s    = Math.max(0.05, p.scale);
    const sz   = Math.max(6, 55 * s);
    const pulse = Math.sin(pu.pulse || 0) * 0.3 + 0.7;

    ctx.save();
    ctx.translate(p.sx, p.sy - sz * 0.5);
    ctx.rotate(((Date.now() / 1400) % 1) * Math.PI * 2);
    ctx.shadowColor = wt ? wt.color : '#fff';
    ctx.shadowBlur  = 18 * pulse;
    ctx.strokeStyle = wt ? wt.color : '#fff';
    ctx.lineWidth   = Math.max(1.5, 3 * s);
    ctx.fillStyle   = 'rgba(5,2,20,0.88)';
    ctx.beginPath(); ctx.rect(-sz/2, -sz/2, sz, sz);
    ctx.fill(); ctx.stroke();
    ctx.rotate(-(((Date.now() / 1400) % 1) * Math.PI * 2));
    ctx.shadowBlur = 0;
    ctx.font = `${Math.max(10, 24 * s)}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(wt ? wt.icon : '?', 0, 0);
    ctx.restore();
  }
}

// ── Mines ──
function _drawMines(ctx, car, state) {
  for (const m of (state.mines || [])) {
    const p = _projectObj(m.x, m.y, car);
    if (!_objOnScreen(p)) continue;
    const s    = Math.max(0.05, p.scale);
    const sz   = Math.max(3, 16 * s);
    const pulse = Math.sin(m.pulse || 0) * 0.4 + 0.6;
    ctx.save(); ctx.translate(p.sx, p.sy - sz);
    ctx.shadowColor = m.color;
    ctx.shadowBlur  = m.armed ? 18 * pulse : 5;
    ctx.fillStyle   = m.armed ? m.color : '#555';
    ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Projectiles ──
function _drawProjectiles(ctx, car, state) {
  for (const pr of (state.projectiles || [])) {
    // Trail
    for (let i = 0; i < pr.trail.length; i++) {
      const tp = _projectObj(pr.trail[i].x, pr.trail[i].y, car);
      if (!_objOnScreen(tp)) continue;
      ctx.globalAlpha = (i / pr.trail.length) * 0.5;
      ctx.fillStyle   = pr.color;
      ctx.beginPath(); ctx.arc(tp.sx, tp.sy, Math.max(1, 5 * tp.scale), 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const p = _projectObj(pr.x, pr.y, car);
    if (!_objOnScreen(p)) continue;
    const sz = Math.max(2, 12 * p.scale);
    ctx.save(); ctx.translate(p.sx, p.sy);
    ctx.shadowColor = pr.color; ctx.shadowBlur = 20;
    ctx.fillStyle   = pr.color;
    ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ── Particles ──
function _drawParticles(ctx, car, state) {
  for (const pp of (state.particles || [])) {
    const p = _projectObj(pp.x, pp.y, car);
    if (!_objOnScreen(p)) continue;
    ctx.globalAlpha = pp.alpha;
    ctx.fillStyle   = pp.color;
    ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(1, pp.r * p.scale), 0, Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ════════════════════════════════════════════
// REMOTE CARS
// ════════════════════════════════════════════
function _drawRemoteCars(ctx, car, state) {
  const remoteCars = Object.values(state.cars)
    .filter(c => c && !c.isLocal && !c.dead);

  // Sort far → near (higher sy = nearer)
  remoteCars.sort((a, b) => {
    const pa = _projectObj(a.x, a.y, car);
    const pb = _projectObj(b.x, b.y, car);
    return pa.sy - pb.sy;
  });

  for (const rc of remoteCars) {
    const p = _projectObj(rc.x, rc.y, car);
    if (!_objOnScreen(p)) continue;

    const s      = Math.max(0.04, p.scale);
    const carDef = rc.carDef || CARS.find(c => c.id === rc.carId) || CARS[4];
    const bW     = Math.max(8,  carDef.bodyW * s * 2.4);
    const bH     = Math.max(6,  carDef.bodyH * s * 2.0);

    // Yaw relative to local car for skew effect
    let relAngle = rc.angle - car.angle;
    while (relAngle >  Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;
    const skew = relAngle * bW * 0.35;

    ctx.save();
    ctx.translate(p.sx, p.sy - bH * 0.5);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(skew*0.3, bH*0.5, bW*0.5, bH*0.12, 0, 0, Math.PI*2); ctx.fill();

    // Shield
    if (rc.shieldTimer > 0) {
      ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 14; ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.ellipse(0, 0, bW*0.65, bH, 0, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    // Body
    ctx.shadowColor = carDef.color; ctx.shadowBlur = 8;
    ctx.fillStyle   = carDef.color2;
    const tw = bW * 0.75;
    ctx.beginPath();
    ctx.moveTo(-bW/2 + skew*0.6,  bH*0.44);
    ctx.lineTo( bW/2 + skew*0.6,  bH*0.44);
    ctx.lineTo( tw/2 + skew,     -bH*0.56);
    ctx.lineTo(-tw/2 + skew,     -bH*0.56);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = carDef.color;
    ctx.beginPath();
    ctx.moveTo(-bW*0.36 + skew*0.6,  bH*0.08);
    ctx.lineTo( bW*0.36 + skew*0.6,  bH*0.08);
    ctx.lineTo( tw*0.36 + skew,     -bH*0.56);
    ctx.lineTo(-tw*0.36 + skew,     -bH*0.56);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;

    // Tail lights
    ctx.fillStyle = '#ff2200'; ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse( bW*0.37+skew*0.6, bH*0.36, Math.max(1,3*s), Math.max(1,2*s), 0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-bW*0.37+skew*0.6, bH*0.36, Math.max(1,3*s), Math.max(1,2*s), 0,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Health bar + name
    const barW = bW * 1.2, barH = Math.max(2, 4*s);
    const barY = -bH*0.58 - barH - Math.max(3, 7*s);
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(-barW/2, barY, barW, barH);
    const hp = Math.max(0, Math.min(1, rc.health / (rc.maxHealth||100)));
    ctx.fillStyle = hp > 0.5 ? '#00ff88' : hp > 0.25 ? '#ffaa00' : '#ff3300';
    ctx.fillRect(-barW/2, barY, barW * hp, barH);

    const fs = Math.max(8, Math.min(14, 12*s));
    ctx.font = `700 ${fs}px Nunito,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillStyle   = carDef.color;
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    ctx.fillText(rc.name || '???', 0, barY - 2);
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}

// ════════════════════════════════════════════
// LOCAL CAR — fixed sprite, bottom-centre
// ════════════════════════════════════════════
function _drawLocalCar(ctx, car) {
  const carDef = car.carDef || CARS[4];
  const cx = _W * CAM.carScreenX;
  const cy = _H * CAM.carScreenY;

  // Lateral lean based on drift
  const fX = Math.cos(car.angle), fY = Math.sin(car.angle);
  const lX = -fY, lY = fX;
  const latVel = (car.vx||0) * lX + (car.vy||0) * lY;
  const lean   = Math.max(-0.16, Math.min(0.16, latVel * -0.008));

  const bW = 94, bH = 58;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(lean);

  // ── Boost exhaust flames ──
  if (car.isBoosting) {
    const flamePositions = [[-28, 0], [0, 0], [28, 0]];
    for (const [fx, _] of flamePositions) {
      const fH  = 32 + Math.random() * 28;
      const fW  = 9  + Math.random() * 5;
      const g   = ctx.createLinearGradient(fx, bH*0.5, fx, bH*0.5 + fH);
      g.addColorStop(0,   carDef.color);
      g.addColorStop(0.45,'#ff6600');
      g.addColorStop(1,   'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(fx, bH*0.5 + fH*0.45, fW*0.5, fH*0.5, 0, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(3, bH*0.58, bW*0.52, bH*0.15, 0, 0, Math.PI*2); ctx.fill();

  // Shield
  if (car.shieldTimer > 0) {
    const alpha = Math.min(1, car.shieldTimer/60) * 0.7;
    ctx.strokeStyle = '#00aaff'; ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00aaff'; ctx.shadowBlur = 24;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.ellipse(0, 0, bW*0.68, bH*1.1, 0, 0, Math.PI*2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  // ── Car body (front-on view — slightly angled perspective) ──
  const hoodW = bW * 0.90, bmpW = bW * 0.80;
  const hoodY = -bH * 0.50, bmpY = bH * 0.48;

  // Main body
  ctx.shadowColor = carDef.color; ctx.shadowBlur = 14;
  ctx.fillStyle   = carDef.color2;
  ctx.beginPath();
  ctx.moveTo(-bmpW/2, bmpY);
  ctx.lineTo( bmpW/2, bmpY);
  ctx.lineTo( hoodW/2, hoodY);
  ctx.lineTo(-hoodW/2, hoodY);
  ctx.closePath(); ctx.fill();

  // Colour stripe
  ctx.fillStyle = carDef.color;
  ctx.beginPath();
  ctx.moveTo(-bmpW*0.34, bmpY*0.18);
  ctx.lineTo( bmpW*0.34, bmpY*0.18);
  ctx.lineTo( hoodW*0.34, hoodY);
  ctx.lineTo(-hoodW*0.34, hoodY);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  // Windshield
  ctx.fillStyle   = 'rgba(100,180,255,0.15)';
  ctx.strokeStyle = 'rgba(160,210,255,0.35)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(-hoodW*0.30, hoodY + bH*0.12);
  ctx.lineTo( hoodW*0.30, hoodY + bH*0.12);
  ctx.lineTo( hoodW*0.28, hoodY + bH*0.35);
  ctx.lineTo(-hoodW*0.28, hoodY + bH*0.35);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // Headlights
  ctx.shadowColor = '#ffffaa'; ctx.shadowBlur = 20;
  ctx.fillStyle   = '#ffffcc';
  ctx.beginPath(); ctx.ellipse(-hoodW*0.355, hoodY + bH*0.09, 9, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( hoodW*0.355, hoodY + bH*0.09, 9, 5, 0, 0, Math.PI*2); ctx.fill();

  // Tail lights
  ctx.shadowColor = '#ff1100'; ctx.shadowBlur = 18;
  ctx.fillStyle   = '#ff2200';
  ctx.beginPath(); ctx.ellipse(-bmpW*0.36, bmpY - bH*0.07, 11, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( bmpW*0.36, bmpY - bH*0.07, 11, 5, 0, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // Wheel arches
  ctx.fillStyle = '#0a0a0a';
  const wW = bmpW*0.22, wH = bH*0.20;
  const wY = bmpY - bH*0.06;
  ctx.beginPath(); ctx.ellipse(-bmpW*0.41, wY, wW, wH, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( bmpW*0.41, wY, wW, wH, 0, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// ════════════════════════════════════════════
// MINIMAP
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

  // Track outline (thick = road width visible)
  mctx.strokeStyle = '#3a2255'; mctx.lineWidth = 7;
  mctx.lineCap = 'round'; mctx.lineJoin = 'round';
  mctx.beginPath();
  const f0 = toMini(TRACK_WAYPOINTS[0].x, TRACK_WAYPOINTS[0].y);
  mctx.moveTo(f0.x, f0.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  mctx.strokeStyle = '#7755cc'; mctx.lineWidth = 2.5;
  mctx.beginPath(); mctx.moveTo(f0.x, f0.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  // Car dots
  for (const c of Object.values(state.cars)) {
    if (!c) continue;
    const m = toMini(c.x, c.y);
    mctx.shadowColor = c.isLocal ? '#d4ff00' : (c.carDef?.color||'#fff');
    mctx.shadowBlur  = c.isLocal ? 8 : 4;
    mctx.fillStyle   = c.isLocal ? '#d4ff00' : (c.carDef?.color||'#fff');
    mctx.beginPath(); mctx.arc(m.x, m.y, c.isLocal ? 5 : 3.5, 0, Math.PI*2); mctx.fill();
    mctx.shadowBlur = 0;
  }

  // Heading arrow for local car
  const local = state.localCar;
  if (local) {
    const m  = toMini(local.x, local.y);
    const a  = local.angle;
    const ts = 6;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(m.x + Math.cos(a)*ts*2, m.y + Math.sin(a)*ts*2);
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
  el.innerHTML = sorted.map((c, i) => `
    <div class="lp-row${c.isLocal ? ' lp-me' : ''}">
      <span class="lp-rank">${i+1}</span>
      <span class="lp-name" style="color:${c.carDef?.color||'#fff'}">${c.name||'???'}</span>
      <span class="lp-lap">L${Math.min(c.lap+1, state.totalLaps)}</span>
    </div>`).join('');
}
