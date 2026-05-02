// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER
// ══════════════════════════════════════════════════

let _canvas, _ctx, _miniCanvas, _miniCtx;
let _camX = 0, _camY = 0, _camTX = 0, _camTY = 0;

function initRenderer() {
  _canvas     = document.getElementById('game-canvas');
  _ctx        = _canvas.getContext('2d');
  _miniCanvas = document.getElementById('minimap-canvas');
  _miniCtx    = _miniCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
}

function resizeCanvas() {
  _canvas.width  = window.innerWidth;
  _canvas.height = window.innerHeight;
}

function renderFrame(state) {
  const ctx = _ctx, W = _canvas.width, H = _canvas.height;

  // ── Camera: follow local player ──
  const local = state.localCar;
  if (local) {
    _camTX = local.x - W / 2;
    _camTY = local.y - H / 2;
  }
  _camX += (_camTX - _camX) * 0.1;
  _camY += (_camTY - _camY) * 0.1;

  // ── Screen shake ──
  let shakeX = 0, shakeY = 0;
  if (state.screenShake > 0) {
    shakeX = (Math.random() - 0.5) * state.screenShake;
    shakeY = (Math.random() - 0.5) * state.screenShake;
    state.screenShake -= 0.8;
  }
  const offX = Math.round(-_camX + shakeX);
  const offY = Math.round(-_camY + shakeY);

  // ── Background ──
  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.save();
  ctx.translate(offX % 80, offY % 80);
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = -80; x < W + 80; x += 80) { ctx.beginPath(); ctx.moveTo(x, -80); ctx.lineTo(x, H + 80); ctx.stroke(); }
  for (let y = -80; y < H + 80; y += 80) { ctx.beginPath(); ctx.moveTo(-80, y); ctx.lineTo(W + 80, y); ctx.stroke(); }
  ctx.restore();

  ctx.save();
  ctx.translate(offX, offY);

  _drawTrack(ctx);
  _drawPickups(ctx, state);
  _drawMines(ctx, state);
  _drawProjectiles(ctx, state);
  _drawParticles(ctx, state);
  _drawCars(ctx, state);

  ctx.restore();

  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

// ── TRACK ──
function _drawTrack(ctx) {
  const n  = TRACK_WAYPOINTS.length;
  const wps = TRACK_WAYPOINTS;

  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Outer glow
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth   = ROAD_WIDTH + 40;
  ctx.beginPath();
  ctx.moveTo(wps[0].x, wps[0].y);
  for (let i = 1; i <= n; i++) { const w = wps[i % n]; ctx.lineTo(w.x, w.y); }
  ctx.closePath(); ctx.stroke();

  // Road surface
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth   = ROAD_WIDTH;
  ctx.beginPath();
  ctx.moveTo(wps[0].x, wps[0].y);
  for (let i = 1; i <= n; i++) { const w = wps[i % n]; ctx.lineTo(w.x, w.y); }
  ctx.closePath(); ctx.stroke();

  // Edge lines
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([30, 20]);
  ctx.beginPath();
  ctx.moveTo(wps[0].x, wps[0].y);
  for (let i = 1; i <= n; i++) { const w = wps[i % n]; ctx.lineTo(w.x, w.y); }
  ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);

  // Centre dashes (volt colour)
  ctx.strokeStyle = 'rgba(212,255,0,0.12)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([20, 30]);
  ctx.beginPath();
  ctx.moveTo(wps[0].x, wps[0].y);
  for (let i = 1; i <= n; i++) { const w = wps[i % n]; ctx.lineTo(w.x, w.y); }
  ctx.closePath(); ctx.stroke();
  ctx.setLineDash([]);

  // Start/finish line
  const sf     = wps[0], sfNext = wps[1];
  const sfAngle = Math.atan2(sfNext.y - sf.y, sfNext.x - sf.x);
  ctx.save();
  ctx.translate(sf.x, sf.y);
  ctx.rotate(sfAngle);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#fff' : '#000';
      ctx.fillRect(col * 10 - 40, row * 8 - 16, 10, 8);
    }
  }
  ctx.restore();
}

// ── PICKUPS ──
function _drawPickups(ctx, state) {
  for (const pu of (state.pickups || [])) {
    if (!pu.active) continue;
    const wt    = WEAPON_TYPES[pu.weapon];
    const pulse = Math.sin(pu.pulse || 0) * 0.3 + 0.7;

    ctx.save();
    ctx.translate(pu.x, pu.y);
    ctx.shadowColor = wt ? wt.color : '#fff';
    ctx.shadowBlur  = 14 * pulse;

    ctx.fillStyle   = 'rgba(0,0,0,0.7)';
    ctx.strokeStyle = wt ? wt.color : '#fff';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.rect(-20, -20, 40, 40); ctx.fill(); ctx.stroke();

    ctx.shadowBlur    = 0;
    ctx.font          = '18px serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillStyle     = '#fff';
    ctx.fillText(wt ? wt.icon : '?', 0, 0);
    ctx.restore();
  }
}

// ── MINES ──
function _drawMines(ctx, state) {
  for (const m of (state.mines || [])) {
    const pulse = Math.sin(m.pulse || 0) * 0.4 + 0.6;
    ctx.save(); ctx.translate(m.x, m.y);
    ctx.shadowColor = m.color; ctx.shadowBlur = m.armed ? 12 * pulse : 4;
    ctx.fillStyle   = m.armed ? m.color : '#666';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    if (m.armed) {
      ctx.strokeStyle = m.color; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*8, Math.sin(a)*8); ctx.lineTo(Math.cos(a)*14, Math.sin(a)*14); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// ── PROJECTILES ──
function _drawProjectiles(ctx, state) {
  for (const p of (state.projectiles || [])) {
    ctx.save();
    for (let i = 0; i < p.trail.length; i++) {
      const t   = p.trail[i];
      const alpha = (i / p.trail.length) * 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.beginPath(); ctx.arc(t.x, t.y, p.radius * 0.5 * (i / p.trail.length), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = p.color; ctx.shadowBlur = 14;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

// ── PARTICLES ──
function _drawParticles(ctx, state) {
  for (const p of (state.particles || [])) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── ALL CARS ──
function _drawCars(ctx, state) {
  const all = Object.values(state.cars).sort((a, b) => a.y - b.y);
  for (const car of all) {
    if (!car || car.dead) continue;

    // Shield ring
    if (car.shieldTimer > 0) {
      ctx.save();
      ctx.globalAlpha  = Math.min(1, car.shieldTimer / 60) * 0.5;
      ctx.strokeStyle  = '#00aaff';
      ctx.lineWidth    = 3;
      ctx.shadowColor  = '#00aaff';
      ctx.shadowBlur   = 18;
      ctx.beginPath(); ctx.arc(car.x, car.y, 28, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Boost trail
    if (car.isBoosting) {
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle + Math.PI);
      const tLen = 30 + Math.random() * 20;
      const grad = ctx.createLinearGradient(0, 0, tLen, 0);
      grad.addColorStop(0, (car.carDef?.color || '#fff') + 'cc');
      grad.addColorStop(1, (car.carDef?.color || '#fff') + '00');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.ellipse(tLen / 2, 0, tLen / 2, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Car body
    drawCarShape(ctx, car.carDef || CARS.find(c => c.id === car.carId) || CARS[4], car.x, car.y, car.angle);

    // Name + health bar for remote players
    if (!car.isLocal) {
      const bw = 32, bh = 4;
      const bx = car.x - bw / 2, by = car.y - (car.carDef?.bodyH || 20) / 2 - 14;
      ctx.fillStyle = '#333'; ctx.fillRect(bx, by, bw, bh);
      const hp = Math.max(0, Math.min(1, car.health / (car.maxHealth || 100)));
      ctx.fillStyle = hp > 0.5 ? '#00ff88' : hp > 0.25 ? '#ffaa00' : '#ff3300';
      ctx.fillRect(bx, by, bw * hp, bh);
      drawNameTag(ctx, car.name || '???', car.x, by - 2, car.carDef?.color || '#aaffcc');
    }
  }
}

// ── MINIMAP ──
function _drawMinimap(state) {
  const mctx = _miniCtx, MW = _miniCanvas.width, MH = _miniCanvas.height, pad = 8;
  mctx.clearRect(0, 0, MW, MH);
  mctx.fillStyle = 'rgba(0,0,0,0.8)'; mctx.fillRect(0, 0, MW, MH);

  const bx = WORLD_BOUNDS.x, by = WORLD_BOUNDS.y, bw = WORLD_BOUNDS.w, bh = WORLD_BOUNDS.h;
  const toMini = (wx, wy) => ({
    x: pad + ((wx - bx) / bw) * (MW - pad * 2),
    y: pad + ((wy - by) / bh) * (MH - pad * 2),
  });

  // Track line
  mctx.strokeStyle = '#555'; mctx.lineWidth = 4; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
  mctx.beginPath();
  const f = toMini(TRACK_WAYPOINTS[0].x, TRACK_WAYPOINTS[0].y);
  mctx.moveTo(f.x, f.y);
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
    mctx.fillStyle = car.isLocal ? '#d4ff00' : (car.carDef?.color || '#aaffcc');
    mctx.beginPath(); mctx.arc(m.x, m.y, car.isLocal ? 4 : 3, 0, Math.PI * 2); mctx.fill();
  }
}

// ── DAMAGE FLASH ──
function _updateDamageFlash(state) {
  const el = document.getElementById('damage-flash');
  if (!el) return;
  if (state.damageFlash > 0) {
    state.damageFlash--;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// ── LIVE POSITIONS PANEL ──
function _updateLivePositions(state) {
  const el = document.getElementById('lp-list');
  if (!el) return;
  const sorted = Object.values(state.cars)
    .filter(c => c)
    .sort((a, b) => (b.lap + b.progress) - (a.lap + a.progress));

  el.innerHTML = sorted.map((car, i) => {
    const isMe = car.isLocal;
    return `<div class="lp-row${isMe ? ' lp-me' : ''}">
      <span class="lp-rank">${i + 1}</span>
      <span class="lp-name" style="color:${car.carDef?.color || '#fff'}">${car.name || '???'}</span>
      <span class="lp-lap">L${Math.min(car.lap + 1, state.totalLaps)}</span>
    </div>`;
  }).join('');
}
