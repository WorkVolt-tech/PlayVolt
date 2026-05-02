// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER v3  (Asphalt-style 3D)
//
// Technique: pseudo-3D perspective projection.
// The camera sits BEHIND and ABOVE the local car,
// looking forward. World positions are projected into
// screen space using a simple perspective divide.
//
// Camera space:
//   - origin = camera world position
//   - X axis = camera right (perpendicular to forward)
//   - Y axis = camera up (world Y is "up" in 3D, Z is depth)
//   - The track lies in the XZ plane (Y=0 for flat road)
//
// Projection:  sx = W/2 + (camX / depth) * FOV_SCALE
//              sy = H * HORIZON - (camY / depth) * FOV_SCALE
// ══════════════════════════════════════════════════

let _canvas, _ctx, _miniCanvas, _miniCtx;
let _W = 0, _H = 0;

// ── Camera state (smoothed) ──
const Cam = {
  x: 0, y: 0,          // world XZ position (2D track coords)
  angle: 0,            // yaw (which direction camera faces, == car angle)
  height: 420,         // camera height above road (Z)
  dist: 520,           // how far behind the car (world units)
  tilt: 0.38,          // horizon position (0=top, 1=bottom of screen)
  fov: 780,            // perspective strength — higher = more zoom
  shake: 0,
};

// Smooth camera targets
let _camTX = 0, _camTY = 0, _camTA = 0;

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

// ── Project a world (x, z) point into screen (sx, sy) ──
// worldX, worldZ are in track coords (Z = distance in front of camera)
// Returns null if behind camera
function project(worldX, worldZ, worldY = 0) {
  if (worldZ < 1) return null;          // behind camera — clip
  const sx = _W / 2 + (worldX / worldZ) * Cam.fov;
  const sy = _H * Cam.tilt - ((Cam.height + worldY) / worldZ) * Cam.fov;
  const scale = Cam.fov / worldZ;       // size scale for objects
  return { sx, sy, scale, depth: worldZ };
}

// ── Transform a track world point into camera space (X, Z) ──
function worldToCamera(wx, wy) {
  const dx  = wx - Cam.x;
  const dy  = wy - Cam.y;
  const cos = Math.cos(-Cam.angle);
  const sin = Math.sin(-Cam.angle);
  return {
    cx: dx * cos - dy * sin,   // lateral (left/right)
    cz: dx * sin + dy * cos,   // depth (forward)
  };
}

// ══════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════
function renderFrame(state) {
  if (!_canvas) return;
  const ctx = _ctx;

  // ── Update camera to follow local car ──
  _updateCamera(state);

  // ── Screen shake ──
  let shakeX = 0, shakeY = 0;
  if (Cam.shake > 0) {
    shakeX = (Math.random() - 0.5) * Cam.shake;
    shakeY = (Math.random() - 0.5) * Cam.shake * 0.5;
    Cam.shake -= 1.2;
    if (Cam.shake < 0) Cam.shake = 0;
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);

  // ── Sky + ground ──
  _drawSkyGround(ctx);

  // ── Track road segments (perspective strips) ──
  _drawTrackPerspective(ctx);

  // ── World objects: pickups, mines, projectiles ──
  _drawWorldObjects(ctx, state);

  // ── Cars ──
  _drawCarsPerspective(ctx, state);

  // ── Particles (screen-space for weapons) ──
  _drawParticles2D(ctx, state);

  ctx.restore();

  // ── Flat overlays ──
  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

// ══════════════════════════════════════════════════
// CAMERA
// ══════════════════════════════════════════════════
function _updateCamera(state) {
  const car = state.localCar;
  if (!car) return;

  // Target: position behind the car
  const behindX = car.x - Math.cos(car.angle) * Cam.dist;
  const behindY = car.y - Math.sin(car.angle) * Cam.dist;

  // Smooth follow
  _camTX = behindX;
  _camTY = behindY;
  _camTA = car.angle;

  const lerpSpeed = 0.18;
  Cam.x     += (_camTX - Cam.x) * lerpSpeed;
  Cam.y     += (_camTY - Cam.y) * lerpSpeed;
  Cam.angle += lerpAngle(Cam.angle, _camTA, lerpSpeed) - Cam.angle;
  // Snap angle to avoid wrap-around lerp issues
  let da = _camTA - Cam.angle;
  while (da >  Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  Cam.angle += da * 0.18;

  // Screen shake from game state
  if (state.screenShake > 0) {
    Cam.shake = Math.max(Cam.shake, state.screenShake * 1.5);
    state.screenShake -= 0.8;
    if (state.screenShake < 0) state.screenShake = 0;
  }
}

// ══════════════════════════════════════════════════
// SKY + GROUND
// ══════════════════════════════════════════════════
function _drawSkyGround(ctx) {
  const horizon = _H * Cam.tilt;

  // Sky gradient — deep blue/purple like Asphalt night tracks
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0,   '#0a0015');
  sky.addColorStop(0.5, '#120830');
  sky.addColorStop(1,   '#1e0f45');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, _W, horizon);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  // deterministic star field — same every frame
  for (let i = 0; i < 120; i++) {
    const sx = ((i * 137.5) % 1) * _W;
    const sy = ((i * 97.3)  % 1) * horizon * 0.9;
    const sz = (i % 3 === 0) ? 1.5 : 0.8;
    ctx.beginPath();
    ctx.arc(sx, sy, sz, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant city glow on horizon
  const glow = ctx.createRadialGradient(_W * 0.5, horizon, 0, _W * 0.5, horizon, _W * 0.6);
  glow.addColorStop(0,   'rgba(100,50,255,0.25)');
  glow.addColorStop(0.4, 'rgba(60,20,180,0.1)');
  glow.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, horizon - 80, _W, 80);

  // Ground — dark asphalt colour (the off-track area)
  const ground = ctx.createLinearGradient(0, horizon, 0, _H);
  ground.addColorStop(0,   '#1a1020');
  ground.addColorStop(0.3, '#110d18');
  ground.addColorStop(1,   '#0a080f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, _W, _H - horizon);

  // Horizon line glow
  ctx.strokeStyle = 'rgba(180,100,255,0.3)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(0, horizon);
  ctx.lineTo(_W, horizon);
  ctx.stroke();
}

// ══════════════════════════════════════════════════
// TRACK — PERSPECTIVE STRIPS
// ══════════════════════════════════════════════════
// We walk forward from camera along track waypoints,
// drawing trapezoid strips for each road segment.

function _drawTrackPerspective(ctx) {
  const horizon = _H * Cam.tilt;
  const n = TRACK_WAYPOINTS.length;
  const maxSegments = 80;     // how far ahead to draw
  const minDepth    = 10;
  const maxDepth    = 12000;

  // Find nearest waypoint to camera
  const nearest = nearestWaypoint(Cam.x, Cam.y);
  let wpIdx = nearest.index;

  // Build a list of projected edge pairs (left/right) for each waypoint ahead
  const strips = [];

  for (let s = 0; s < maxSegments; s++) {
    const idx  = (wpIdx + s) % n;
    const wp   = TRACK_WAYPOINTS[idx];
    const wpN  = TRACK_WAYPOINTS[(idx + 1) % n];

    // Track forward direction at this waypoint
    const fwdX = wpN.x - wp.x, fwdY = wpN.y - wp.y;
    const fwdL = Math.hypot(fwdX, fwdY) || 1;
    const nx   = -fwdY / fwdL, ny = fwdX / fwdL;  // left normal

    // Left and right road edges
    const lx = wp.x + nx * ROAD_HALF, ly = wp.y + ny * ROAD_HALF;
    const rx = wp.x - nx * ROAD_HALF, ry = wp.y - ny * ROAD_HALF;

    const lc = worldToCamera(lx, ly);
    const rc = worldToCamera(rx, ry);

    if (lc.cz < minDepth && rc.cz < minDepth) continue; // behind cam

    const pL = project(lc.cx, Math.max(minDepth, lc.cz));
    const pR = project(rc.cx, Math.max(minDepth, rc.cz));
    if (!pL || !pR) continue;
    if (pL.sy < -200 && pR.sy < -200) break;  // above screen — stop

    // Curb colours alternating
    const isCurb = s % 12 < 6;
    // Segment index for alternating road/curb stripe
    const altColor = Math.floor(s / 3) % 2 === 0;

    strips.push({ pL, pR, lc, rc, s, isCurb, altColor, wpIdx: idx });
  }

  // Draw from far to near (painter's algorithm)
  for (let i = strips.length - 1; i >= 0; i--) {
    const cur  = strips[i];
    const next = strips[i - 1];
    if (!next) continue;

    const { pL: cL, pR: cR } = cur;
    const { pL: nL, pR: nR } = next;

    // ── Road surface ──
    // Alternating dark/slightly lighter strips to show speed
    const stripBrightness = cur.altColor ? 42 : 36;
    ctx.fillStyle = `rgb(${stripBrightness},${stripBrightness - 4},${stripBrightness + 8})`;
    ctx.beginPath();
    ctx.moveTo(cL.sx, cL.sy);
    ctx.lineTo(cR.sx, cR.sy);
    ctx.lineTo(nR.sx, nR.sy);
    ctx.lineTo(nL.sx, nL.sy);
    ctx.closePath();
    ctx.fill();

    // ── Kerb (edge stripes) ──
    const kerbW = Math.max(1, (cR.sx - cL.sx) * 0.06);
    // Left kerb
    const kCol = cur.altColor ? '#dd2222' : '#eeeeee';
    ctx.fillStyle = kCol;
    ctx.beginPath();
    ctx.moveTo(cL.sx, cL.sy);
    ctx.lineTo(cL.sx + kerbW, cL.sy);
    ctx.lineTo(nL.sx + kerbW, nL.sy);
    ctx.lineTo(nL.sx, nL.sy);
    ctx.closePath();
    ctx.fill();
    // Right kerb
    ctx.beginPath();
    ctx.moveTo(cR.sx, cR.sy);
    ctx.lineTo(cR.sx - kerbW, cR.sy);
    ctx.lineTo(nR.sx - kerbW, nR.sy);
    ctx.lineTo(nR.sx, nR.sy);
    ctx.closePath();
    ctx.fill();

    // ── Centre dash line ──
    if (i % 6 < 3) {
      const midCurX  = (cL.sx + cR.sx) / 2, midCurY  = (cL.sy + cR.sy) / 2;
      const midNextX = (nL.sx + nR.sx) / 2, midNextY  = (nL.sy + nR.sy) / 2;
      const lw = Math.max(0.5, (cR.sx - cL.sx) * 0.015);
      ctx.strokeStyle = 'rgba(212,255,0,0.5)';
      ctx.lineWidth   = lw;
      ctx.beginPath();
      ctx.moveTo(midCurX, midCurY);
      ctx.lineTo(midNextX, midNextY);
      ctx.stroke();
    }

    // ── Start/finish line ──
    if (cur.wpIdx === 0) {
      const midX1 = cL.sx, midX2 = cR.sx;
      const boxW  = (midX2 - midX1) / 8;
      for (let col = 0; col < 8; col++) {
        for (let row = 0; row < 2; row++) {
          ctx.fillStyle = (row + col) % 2 === 0 ? '#ffffff' : '#000000';
          ctx.fillRect(midX1 + col * boxW, cL.sy - (row + 1) * 4, boxW, 4);
        }
      }
    }

    // ── Road edge glow ──
    const edgeDist = Math.min(1, i / strips.length);
    ctx.strokeStyle = `rgba(150,80,255,${edgeDist * 0.3})`;
    ctx.lineWidth   = Math.max(0.5, (cR.sx - cL.sx) * 0.01);
    ctx.beginPath(); ctx.moveTo(cL.sx, cL.sy); ctx.lineTo(nL.sx, nL.sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cR.sx, cR.sy); ctx.lineTo(nR.sx, nR.sy); ctx.stroke();
  }
}

// ══════════════════════════════════════════════════
// WORLD OBJECTS IN PERSPECTIVE
// ══════════════════════════════════════════════════
function _drawWorldObjects(ctx, state) {
  // Collect everything with a world position and sort by depth (far first)
  const objects = [];

  // Pickups
  for (const pu of (state.pickups || [])) {
    if (!pu.active) continue;
    const c = worldToCamera(pu.x, pu.y);
    if (c.cz < 5) continue;
    const p = project(c.cx, c.cz, 0);
    if (p) objects.push({ type: 'pickup', p, pu, depth: c.cz });
  }

  // Mines
  for (const m of (state.mines || [])) {
    const c = worldToCamera(m.x, m.y);
    if (c.cz < 5) continue;
    const p = project(c.cx, c.cz, 0);
    if (p) objects.push({ type: 'mine', p, m, depth: c.cz });
  }

  // Projectiles — draw as screen-space glows
  for (const proj of (state.projectiles || [])) {
    const c = worldToCamera(proj.x, proj.y);
    if (c.cz < 5) continue;
    const p = project(c.cx, c.cz, 20);
    if (p) objects.push({ type: 'proj', p, proj, depth: c.cz });
  }

  // Sort far to near
  objects.sort((a, b) => b.depth - a.depth);

  for (const obj of objects) {
    const { p } = obj;
    const s = Math.max(0.05, Math.min(4, p.scale));

    ctx.save();
    ctx.translate(p.sx, p.sy);

    if (obj.type === 'pickup') {
      const wt    = WEAPON_TYPES[obj.pu.weapon];
      const pulse = Math.sin(obj.pu.pulse || 0) * 0.3 + 0.7;
      const sz    = Math.max(6, 28 * s);

      ctx.shadowColor = wt ? wt.color : '#fff';
      ctx.shadowBlur  = 20 * pulse * s;
      ctx.strokeStyle = wt ? wt.color : '#fff';
      ctx.fillStyle   = 'rgba(10,5,25,0.8)';
      ctx.lineWidth   = Math.max(1, 2 * s);

      // Rotating box
      ctx.rotate((Date.now() / 1000) % (Math.PI * 2));
      ctx.beginPath();
      ctx.rect(-sz/2, -sz/2, sz, sz);
      ctx.fill(); ctx.stroke();

      ctx.rotate(-(Date.now() / 1000) % (Math.PI * 2));
      ctx.shadowBlur = 0;
      ctx.font       = `${Math.max(8, 14 * s)}px serif`;
      ctx.textAlign  = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle  = '#fff';
      ctx.fillText(wt ? wt.icon : '?', 0, 0);
    }

    if (obj.type === 'mine') {
      const sz   = Math.max(3, 10 * s);
      const pulse = Math.sin(obj.m.pulse || 0) * 0.4 + 0.6;
      ctx.shadowColor = obj.m.color;
      ctx.shadowBlur  = obj.m.armed ? 16 * pulse * s : 4 * s;
      ctx.fillStyle   = obj.m.armed ? obj.m.color : '#666';
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fill();
    }

    if (obj.type === 'proj') {
      const sz = Math.max(2, 8 * s);
      ctx.shadowColor = obj.proj.color;
      ctx.shadowBlur  = 20 * s;
      ctx.fillStyle   = obj.proj.color;
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════
// CARS IN PERSPECTIVE
// ══════════════════════════════════════════════════
function _drawCarsPerspective(ctx, state) {
  const cars = Object.values(state.cars).filter(c => c && !c.dead);

  // Sort far to near
  cars.sort((a, b) => {
    const ca = worldToCamera(a.x, a.y);
    const cb = worldToCamera(b.x, b.y);
    return cb.cz - ca.cz;
  });

  for (const car of cars) {
    const camPos = worldToCamera(car.x, car.y);

    // Skip cars behind camera
    if (camPos.cz < -50) continue;

    const p = project(camPos.cx, Math.max(8, camPos.cz), 0);
    if (!p) continue;
    if (p.sx < -300 || p.sx > _W + 300) continue;
    if (p.sy > _H + 100 || p.sy < -100) continue;

    const s = Math.max(0.05, Math.min(3, p.scale));
    const isLocal = car.isLocal;
    const carDef  = car.carDef || CARS.find(c => c.id === car.carId) || CARS[4];

    ctx.save();
    ctx.translate(p.sx, p.sy);

    // ── Car body (perspective-scaled rectangle with skew) ──
    // Relative angle of car vs camera for visual turn effect
    let relAngle = car.angle - Cam.angle;
    while (relAngle >  Math.PI) relAngle -= Math.PI * 2;
    while (relAngle < -Math.PI) relAngle += Math.PI * 2;

    const bodyW  = carDef.bodyW * s * 2.2;
    const bodyH  = carDef.bodyH * s * 1.4;
    const skewX  = relAngle * bodyW * 0.35;  // horizontal skew = visual turn

    // Shadow on road
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(skewX * 0.3, bodyH * 0.6, bodyW * 0.5, bodyH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shield
    if (car.shieldTimer > 0) {
      ctx.strokeStyle = '#00aaff';
      ctx.lineWidth   = Math.max(1, 3 * s);
      ctx.shadowColor = '#00aaff';
      ctx.shadowBlur  = 20 * s;
      ctx.globalAlpha = Math.min(1, car.shieldTimer / 60) * 0.7;
      ctx.beginPath();
      ctx.ellipse(0, 0, bodyW * 0.65, bodyH * 1.1, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
    }

    // Boost trail (elongated glow behind car)
    if (car.isBoosting) {
      const trailLen = bodyH * (1.5 + Math.random() * 0.5);
      const grad = ctx.createLinearGradient(-skewX, -bodyH * 0.3, -skewX, -bodyH * 0.3 - trailLen);
      grad.addColorStop(0, carDef.color + 'cc');
      grad.addColorStop(1, carDef.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(-skewX * 0.5, -bodyH * 0.3 - trailLen / 2, bodyW * 0.2, trailLen / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Car body ──
    ctx.shadowColor = carDef.color;
    ctx.shadowBlur  = isLocal ? 0 : 8 * s;

    // Main body
    ctx.fillStyle = carDef.color2;
    ctx.beginPath();
    // Perspective trapezoid: top narrower than bottom (foreshortened)
    const tw = bodyW * 0.78;  // top width (far edge, narrower)
    const bw = bodyW;         // bottom width (near edge)
    const th = -bodyH * 0.55, bh = bodyH * 0.45;
    ctx.moveTo(-bw/2 + skewX * 0.6, bh);
    ctx.lineTo( bw/2 + skewX * 0.6, bh);
    ctx.lineTo( tw/2 + skewX,       th);
    ctx.lineTo(-tw/2 + skewX,       th);
    ctx.closePath();
    ctx.fill();

    // Top stripe
    ctx.fillStyle = carDef.color;
    ctx.beginPath();
    ctx.moveTo(-bw/2 * 0.7 + skewX * 0.6, bh * 0.2);
    ctx.lineTo( bw/2 * 0.7 + skewX * 0.6, bh * 0.2);
    ctx.lineTo( tw/2 * 0.7 + skewX,       th * 0.5);
    ctx.lineTo(-tw/2 * 0.7 + skewX,       th * 0.5);
    ctx.closePath();
    ctx.fill();

    // Windshield (dark)
    ctx.fillStyle = 'rgba(0,20,40,0.8)';
    ctx.beginPath();
    ctx.moveTo(-tw/2 * 0.55 + skewX, th * 0.55);
    ctx.lineTo( tw/2 * 0.55 + skewX, th * 0.55);
    ctx.lineTo( tw/2 * 0.45 + skewX, th * 0.25);
    ctx.lineTo(-tw/2 * 0.45 + skewX, th * 0.25);
    ctx.closePath();
    ctx.fill();

    // Headlights
    ctx.shadowBlur = 12 * s;
    ctx.fillStyle  = '#ffffcc';
    ctx.beginPath(); ctx.ellipse( tw/2 * 0.6 + skewX, th * 0.65, Math.max(1, 4*s), Math.max(1, 2*s), 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-tw/2 * 0.6 + skewX, th * 0.65, Math.max(1, 4*s), Math.max(1, 2*s), 0, 0, Math.PI*2); ctx.fill();

    // Tail lights
    ctx.fillStyle  = '#ff3300';
    ctx.shadowColor = '#ff3300';
    ctx.beginPath(); ctx.ellipse( bw/2 * 0.65 + skewX * 0.6, bh * 0.7, Math.max(1, 4*s), Math.max(1, 2*s), 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-bw/2 * 0.65 + skewX * 0.6, bh * 0.7, Math.max(1, 4*s), Math.max(1, 2*s), 0, 0, Math.PI*2); ctx.fill();

    ctx.shadowBlur = 0;

    // ── Name tag + health bar for remote cars ──
    if (!isLocal) {
      const barW = Math.max(20, bodyW * 1.1);
      const barH = Math.max(2,  4 * s);
      const barY = th - barH - Math.max(4, 8 * s);

      // Health bar bg
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-barW/2, barY, barW, barH);

      // Health fill
      const hp = Math.max(0, Math.min(1, car.health / (car.maxHealth || 100)));
      ctx.fillStyle = hp > 0.5 ? '#00ff88' : hp > 0.25 ? '#ffaa00' : '#ff3300';
      ctx.fillRect(-barW/2, barY, barW * hp, barH);

      // Name
      const fs = Math.max(8, Math.min(16, 13 * s));
      ctx.font         = `700 ${fs}px Nunito, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle    = carDef.color;
      ctx.shadowColor  = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur   = 4;
      ctx.fillText(car.name || '???', 0, barY - 2);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }
}

// ══════════════════════════════════════════════════
// SCREEN-SPACE PARTICLES
// ══════════════════════════════════════════════════
function _drawParticles2D(ctx, state) {
  // Project particles into screen space
  for (const pp of (state.particles || [])) {
    const c = worldToCamera(pp.x, pp.y);
    if (c.cz < 5) continue;
    const p = project(c.cx, c.cz, 5);
    if (!p) continue;
    const s = Math.max(0.1, Math.min(3, p.scale));
    ctx.globalAlpha = pp.alpha;
    ctx.fillStyle   = pp.color;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, Math.max(1, pp.r * s), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════
// MINIMAP (flat 2D top-down, corner overlay)
// ══════════════════════════════════════════════════
function _drawMinimap(state) {
  const mctx = _miniCtx, MW = _miniCanvas.width, MH = _miniCanvas.height, pad = 8;
  mctx.clearRect(0, 0, MW, MH);

  // Background
  mctx.fillStyle = 'rgba(5,3,15,0.85)';
  mctx.fillRect(0, 0, MW, MH);

  const bx = WORLD_BOUNDS.x, by = WORLD_BOUNDS.y, bw = WORLD_BOUNDS.w, bh = WORLD_BOUNDS.h;
  const toMini = (wx, wy) => ({
    x: pad + ((wx - bx) / bw) * (MW - pad * 2),
    y: pad + ((wy - by) / bh) * (MH - pad * 2),
  });

  // Track line
  mctx.strokeStyle = '#443355';
  mctx.lineWidth   = 6;
  mctx.lineCap     = 'round';
  mctx.lineJoin    = 'round';
  mctx.beginPath();
  const f = toMini(TRACK_WAYPOINTS[0].x, TRACK_WAYPOINTS[0].y);
  mctx.moveTo(f.x, f.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  // Track inner highlight
  mctx.strokeStyle = '#6644aa';
  mctx.lineWidth   = 2;
  mctx.beginPath();
  mctx.moveTo(f.x, f.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  // Car dots
  for (const car of Object.values(state.cars)) {
    if (!car) continue;
    const m = toMini(car.x, car.y);
    const r = car.isLocal ? 5 : 3.5;

    mctx.shadowColor = car.isLocal ? '#d4ff00' : (car.carDef?.color || '#aaffcc');
    mctx.shadowBlur  = car.isLocal ? 8 : 4;
    mctx.fillStyle   = car.isLocal ? '#d4ff00' : (car.carDef?.color || '#aaffcc');
    mctx.beginPath();
    mctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    mctx.fill();
    mctx.shadowBlur = 0;
  }

  // Camera direction triangle for local player
  const local = state.localCar;
  if (local) {
    const m = toMini(local.x, local.y);
    const a = local.angle;
    const ts = 5;
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.moveTo(m.x + Math.cos(a) * ts * 1.8, m.y + Math.sin(a) * ts * 1.8);
    mctx.lineTo(m.x + Math.cos(a + 2.4) * ts, m.y + Math.sin(a + 2.4) * ts);
    mctx.lineTo(m.x + Math.cos(a - 2.4) * ts, m.y + Math.sin(a - 2.4) * ts);
    mctx.closePath();
    mctx.fill();
  }
}

// ══════════════════════════════════════════════════
// HUD HELPERS
// ══════════════════════════════════════════════════
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
      <span class="lp-name" style="color:${car.carDef?.color || '#fff'}">${car.name || '???'}</span>
      <span class="lp-lap">L${Math.min(car.lap + 1, state.totalLaps)}</span>
    </div>`;
  }).join('');
}

// lerp / lerpAngle defined in physics.js (loaded before renderer)
