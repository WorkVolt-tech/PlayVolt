// ══════════════════════════════════════════════════
// RUSHING BLUR — PHYSICS v3
//
// Asphalt arcade feel:
// - Strong instant acceleration
// - Drift / lateral slide scales with car friction stat
// - Hard track boundary via enforceTrackBoundary()
// - Boost = rocket burst, not nudge
// ══════════════════════════════════════════════════

const Keys = {};
window.addEventListener('keydown', e => {
  Keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { Keys[e.code] = false; });

function updateLocalPlayer(car, dt, state) {
  if (!car || car.finished) return;

  const def   = car.carDef;
  const up    = Keys['ArrowUp']    || Keys['KeyW'];
  const down  = Keys['ArrowDown']  || Keys['KeyS'];
  const left  = Keys['ArrowLeft']  || Keys['KeyA'];
  const right = Keys['ArrowRight'] || Keys['KeyD'];
  const boost = Keys['ShiftLeft']  || Keys['ShiftRight'];
  const fire  = Keys['Space'];

  // ── BOOST fuel ──
  car.boostFuel = Math.min(1, car.boostFuel + def.boostRecharge * dt);
  car.isBoosting = false;
  if (boost && car.boostFuel > 0.05 && up) {
    car.isBoosting = true;
    car.boostFuel  = Math.max(0, car.boostFuel - def.boostDrain * dt);
  }

  // ── SPEED along facing direction ──
  const fX = Math.cos(car.angle), fY = Math.sin(car.angle);
  const lX = -fY, lY = fX;   // lateral axis
  const absSpd = Math.hypot(car.vx, car.vy);
  const boostMult = car.isBoosting ? def.boostMultiplier : 1;
  const topSpd    = def.maxSpeed * boostMult;
  const accel     = def.acceleration * (car.isBoosting ? 1.8 : 1);

  // Drive force
  if (up)   { car.vx += fX * accel * dt; car.vy += fY * accel * dt; }
  if (down) { car.vx -= fX * accel * 0.6 * dt; car.vy -= fY * accel * 0.6 * dt; }

  // ── STEERING — speed-sensitive ──
  const steerSpd = Math.min(1, absSpd / (def.maxSpeed * 0.3));
  if (left)  car.angle -= def.handling * steerSpd * dt;
  if (right) car.angle += def.handling * steerSpd * dt;

  // ── LATERAL GRIP (drift) ──
  // Project velocity onto lateral axis — bleed off based on grip
  const latVel = car.vx * lX + car.vy * lY;
  const gripBleed = 1 - def.friction;   // fraction of lateral vel killed per frame
  car.vx -= lX * latVel * gripBleed * Math.min(dt, 2);
  car.vy -= lY * latVel * gripBleed * Math.min(dt, 2);

  // ── SPEED CAP ──
  const curSpd = Math.hypot(car.vx, car.vy);
  if (curSpd > topSpd) {
    car.vx = car.vx / curSpd * topSpd;
    car.vy = car.vy / curSpd * topSpd;
  }

  // ── DRAG ──
  const drag = up ? 0.993 : down ? 0.960 : 0.975;
  car.vx *= Math.pow(drag, dt);
  car.vy *= Math.pow(drag, dt);

  // ── MOVE ──
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // ── HARD TRACK BOUNDARY ──
  enforceTrackBoundary(car);

  // ── SHIELD ──
  if (car.shieldTimer > 0) car.shieldTimer -= dt;

  // ── WEAPON FIRE ──
  if (fire && car.weapon && !Keys['_spacePrev']) useWeapon(car, state);
  Keys['_spacePrev'] = fire;

  // ── TYRE SMOKE on hard drift ──
  const newLatVel = car.vx * lX + car.vy * lY;
  if (Math.abs(newLatVel) > def.maxSpeed * 0.25 && absSpd > def.maxSpeed * 0.2) {
    if (state.particles) spawnParticles(state, car.x, car.y, '#aaa', 2);
  }
}

// ── Remote car interpolation ──
function pushRemoteSnapshot(car, snap, serverTime) {
  if (!car.snapshots) car.snapshots = [];
  car.snapshots.push({ t: serverTime, ...snap });
  if (car.snapshots.length > 24) car.snapshots.shift();
}

function interpolateRemoteCar(car) {
  if (!car.snapshots || car.snapshots.length < 2) return;
  const renderTime = performance.now() - CONFIG.INTERP_BUFFER_MS;

  let before = car.snapshots[0], after = car.snapshots[1];
  for (let i = 0; i < car.snapshots.length - 1; i++) {
    if (car.snapshots[i].t <= renderTime && car.snapshots[i+1].t >= renderTime) {
      before = car.snapshots[i]; after = car.snapshots[i+1]; break;
    }
  }
  if (renderTime > car.snapshots[car.snapshots.length-1].t) {
    const l = car.snapshots.length;
    before = car.snapshots[l-2]; after = car.snapshots[l-1];
  }

  const span = after.t - before.t;
  const t    = span > 0 ? Math.max(0, Math.min(1.5, (renderTime - before.t) / span)) : 1;

  car.x     = lerp(before.x, after.x, t);
  car.y     = lerp(before.y, after.y, t);
  car.angle = lerpAngle(before.angle, after.angle, t);
  car.vx    = lerp(before.vx||0, after.vx||0, t);
  car.vy    = lerp(before.vy||0, after.vy||0, t);

  const latest = car.snapshots[car.snapshots.length-1];
  car.isBoosting     = latest.isBoosting;
  car.health         = latest.health * (car.maxHealth||100);
  car.weapon         = latest.weapon;
  car.shieldTimer    = latest.shieldTimer;
  car.lap            = latest.lap;
  car.nextCheckpoint = latest.nextCheckpoint ?? 0;
  car.progress       = latest.progress;
  car.finished       = latest.finished;
}

function lerp(a, b, t) { return a + (b-a) * t; }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function resolveCarCollisions(carsArray) {
  const minDist = 40;
  for (let i = 0; i < carsArray.length; i++) {
    for (let j = i+1; j < carsArray.length; j++) {
      const a = carsArray[i], b = carsArray[j];
      if (!a || !b) continue;
      const dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx, dy);
      if (d < minDist && d > 0.01) {
        const push = (minDist-d)/d * 0.5;
        const px = dx*push, py = dy*push;
        if (a.isLocal) { a.x -= px; a.y -= py; a.vx -= px*0.4; a.vy -= py*0.4; }
        if (b.isLocal) { b.x += px; b.y += py; b.vx += px*0.4; b.vy += py*0.4; }
      }
    }
  }
}
