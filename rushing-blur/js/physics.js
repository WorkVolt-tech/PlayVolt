// ══════════════════════════════════════════════════
// RUSHING BLUR — PHYSICS
// Local player: full physics from input
// Remote players: interpolated between received packets
// ══════════════════════════════════════════════════

const Keys = {};
window.addEventListener('keydown', e => {
  Keys[e.code] = true;
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { Keys[e.code] = false; });

// ── Update local player (full physics) ──
function updateLocalPlayer(car, dt, state) {
  if (!car || car.finished) return;

  const def = car.carDef;
  const up    = Keys['ArrowUp']    || Keys['KeyW'];
  const down  = Keys['ArrowDown']  || Keys['KeyS'];
  const left  = Keys['ArrowLeft']  || Keys['KeyA'];
  const right = Keys['ArrowRight'] || Keys['KeyD'];
  const boost = Keys['ShiftLeft']  || Keys['ShiftRight'];
  const fire  = Keys['Space'];

  // Steering (speed-dependent grip)
  const curSpd = Math.hypot(car.vx, car.vy);
  const steer  = Math.min(1, curSpd / 3);
  if (left)  car.angle -= def.handling * steer * dt;
  if (right) car.angle += def.handling * steer * dt;

  // Throttle
  if (up)   car.speed = Math.min(def.maxSpeed, car.speed + def.acceleration * dt);
  if (down) car.speed = Math.max(-def.maxSpeed * 0.4, car.speed - def.acceleration * 1.2 * dt);
  if (!up && !down) car.speed *= 0.97;

  // Boost
  car.boostFuel = Math.min(1, car.boostFuel + def.boostRecharge * dt);
  car.isBoosting = false;
  if (boost && car.boostFuel > 0.05 && up) {
    car.isBoosting = true;
    car.boostFuel  = Math.max(0, car.boostFuel - def.boostDrain * dt);
  }
  const boostMult = car.isBoosting ? def.boostMultiplier : 1;

  // Physics
  car.vx = car.vx * def.friction + Math.cos(car.angle) * car.speed * boostMult * 0.1;
  car.vy = car.vy * def.friction + Math.sin(car.angle) * car.speed * boostMult * 0.1;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // Shield decay
  if (car.shieldTimer > 0) car.shieldTimer -= dt;

  // Fire weapon (edge trigger)
  if (fire && car.weapon && !Keys['_spacePrev']) {
    useWeapon(car, state);
  }
  Keys['_spacePrev'] = fire;
}

// ── Remote car: store received snapshots and interpolate ──
// Each remote car object has:
//   snapshots: array of { t, x, y, angle, vx, vy, speed, isBoosting, health, weapon, shieldTimer }
// We render at `now - INTERP_BUFFER_MS` to always have two snapshots to lerp between.

function pushRemoteSnapshot(car, snap, serverTime) {
  if (!car.snapshots) car.snapshots = [];
  car.snapshots.push({ t: serverTime, ...snap });
  // Keep only last 20 snapshots
  if (car.snapshots.length > 20) car.snapshots.shift();
}

function interpolateRemoteCar(car) {
  if (!car.snapshots || car.snapshots.length < 2) return;

  const now        = performance.now();
  const renderTime = now - CONFIG.INTERP_BUFFER_MS;

  // Find the two snapshots straddling renderTime
  let before = car.snapshots[0], after = car.snapshots[1];
  for (let i = 0; i < car.snapshots.length - 1; i++) {
    if (car.snapshots[i].t <= renderTime && car.snapshots[i + 1].t >= renderTime) {
      before = car.snapshots[i];
      after  = car.snapshots[i + 1];
      break;
    }
  }

  // If we've passed all snapshots, extrapolate from last two
  if (renderTime > car.snapshots[car.snapshots.length - 1].t) {
    before = car.snapshots[car.snapshots.length - 2];
    after  = car.snapshots[car.snapshots.length - 1];
  }

  const span = after.t - before.t;
  const t    = span > 0 ? Math.max(0, Math.min(1, (renderTime - before.t) / span)) : 1;

  // Lerp position
  car.x     = lerp(before.x, after.x, t);
  car.y     = lerp(before.y, after.y, t);
  car.angle = lerpAngle(before.angle, after.angle, t);
  car.vx    = lerp(before.vx, after.vx, t);
  car.vy    = lerp(before.vy, after.vy, t);

  // Copy non-interpolated state from latest snapshot
  const latest = car.snapshots[car.snapshots.length - 1];
  car.isBoosting  = latest.isBoosting;
  car.health      = latest.health;
  car.weapon      = latest.weapon;
  car.shieldTimer = latest.shieldTimer;
  car.lap         = latest.lap;
  car.progress    = latest.progress;
  car.finished    = latest.finished;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ── Car-to-car collision (local simulation — applied to all cars for feel) ──
function resolveCarCollisions(carsArray) {
  const minDist = 28;
  for (let i = 0; i < carsArray.length; i++) {
    for (let j = i + 1; j < carsArray.length; j++) {
      const a = carsArray[i], b = carsArray[j];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d  = Math.hypot(dx, dy);
      if (d < minDist && d > 0) {
        const push = (minDist - d) / d * 0.5;
        const px = dx * push, py = dy * push;
        if (a.isLocal) { a.x -= px; a.y -= py; a.vx -= px * 0.5; a.vy -= py * 0.5; }
        if (b.isLocal) { b.x += px; b.y += py; b.vx += px * 0.5; b.vy += py * 0.5; }
      }
    }
  }
}
