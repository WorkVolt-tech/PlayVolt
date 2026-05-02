// ══════════════════════════════════════════════════
// RUSHING BLUR — PHYSICS v2  (Asphalt-style)
//
// Feel targets:
// - Instant throttle response — flooring it feels powerful
// - Speed-sensitive steering — tight at low speed, looser at high speed
// - Drift: lateral velocity bleeds off slower when cornering hard
//   (car slides outward, but recovers — not simulation, not kart)
// - Boost feels like a rocket, not a nudge
// - Braking is crisp, not floaty
// - Car stays on track by natural feel, not invisible walls
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

  // ── BOOST ──
  car.boostFuel = Math.min(1, car.boostFuel + def.boostRecharge * dt);
  car.isBoosting = false;
  if (boost && car.boostFuel > 0.05 && up) {
    car.isBoosting = true;
    car.boostFuel  = Math.max(0, car.boostFuel - def.boostDrain * dt);
  }

  // ── THROTTLE / BRAKE ──
  // Current speed along the car's facing direction
  const facingX = Math.cos(car.angle), facingY = Math.sin(car.angle);
  const forwardSpeed = car.vx * facingX + car.vy * facingY;
  const absSpeed     = Math.hypot(car.vx, car.vy);

  const topSpeed     = def.maxSpeed * (car.isBoosting ? def.boostMultiplier : 1);
  const accel        = def.acceleration * (car.isBoosting ? 1.6 : 1);

  let throttle = 0;
  if (up)   throttle =  1;
  if (down) throttle = -0.6;  // brake/reverse — strong but not instant

  // Apply force along facing direction
  const driveForce = throttle * accel * dt;
  car.vx += facingX * driveForce;
  car.vy += facingY * driveForce;

  // ── STEERING ──
  // Speed-sensitive: full turn authority at medium speed, reduced at very high speed
  // Asphalt feel: steering is snappy, not sluggish
  const steerPower  = def.handling;
  const speedFactor = Math.min(1.0, Math.max(0.15, absSpeed / (def.maxSpeed * 0.5)));
  const highSpeedReduce = Math.max(0.4, 1 - (absSpeed / (def.maxSpeed * 2.5)));

  let steerAmt = 0;
  if (left)  steerAmt = -1;
  if (right) steerAmt =  1;

  if (steerAmt !== 0) {
    car.angle += steerAmt * steerPower * speedFactor * highSpeedReduce * dt;
  }

  // ── DRIFT / LATERAL GRIP ──
  // Decompose velocity into forward and lateral components
  const lateralX     = -facingY, lateralY = facingX;   // perpendicular to facing
  const lateralSpeed  = car.vx * lateralX + car.vy * lateralY;

  // Grip factor: how strongly lateral speed is corrected each frame
  // Lower = more drift. Wraith drifts most, Viper grips hardest.
  // def.friction repurposed: 0.95 = grippy, 0.88 = drifty
  const grip = def.friction;   // 0.88–0.975 range in car definitions

  // Kill lateral velocity by (1 - grip) — leaves some slide
  const lateralKill = lateralSpeed * (1 - grip) * Math.min(dt, 2);
  car.vx -= lateralX * lateralKill;
  car.vy -= lateralY * lateralKill;

  // ── SPEED CAP ──
  const curSpd = Math.hypot(car.vx, car.vy);
  if (curSpd > topSpeed) {
    const scale = topSpeed / curSpd;
    car.vx *= scale; car.vy *= scale;
  }

  // ── DRAG (natural deceleration when not throttling) ──
  const drag = up ? 0.992 : down ? 0.96 : 0.978;
  car.vx *= Math.pow(drag, dt);
  car.vy *= Math.pow(drag, dt);

  // ── MOVE ──
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  // ── SHIELD DECAY ──
  if (car.shieldTimer > 0) car.shieldTimer -= dt;

  // ── FIRE WEAPON (edge trigger) ──
  if (fire && car.weapon && !Keys['_spacePrev']) {
    useWeapon(car, state);
  }
  Keys['_spacePrev'] = fire;

  // ── DRIFT PARTICLES ──
  if (Math.abs(lateralSpeed) > def.maxSpeed * 0.3 && absSpeed > def.maxSpeed * 0.3) {
    spawnParticles(state, car.x - facingX * 20, car.y - facingY * 20, '#888', 2);
  }
}

// ── Remote car interpolation ──
function pushRemoteSnapshot(car, snap, serverTime) {
  if (!car.snapshots) car.snapshots = [];
  car.snapshots.push({ t: serverTime, ...snap });
  if (car.snapshots.length > 20) car.snapshots.shift();
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
  if (renderTime > car.snapshots[car.snapshots.length - 1].t) {
    const last = car.snapshots.length - 1;
    before = car.snapshots[last - 1]; after = car.snapshots[last];
  }

  const span = after.t - before.t;
  const t    = span > 0 ? Math.max(0, Math.min(1, (renderTime - before.t) / span)) : 1;

  car.x     = lerp(before.x, after.x, t);
  car.y     = lerp(before.y, after.y, t);
  car.angle = lerpAngle(before.angle, after.angle, t);
  car.vx    = lerp(before.vx || 0, after.vx || 0, t);
  car.vy    = lerp(before.vy || 0, after.vy || 0, t);

  const latest       = car.snapshots[car.snapshots.length - 1];
  car.isBoosting     = latest.isBoosting;
  car.health         = latest.health;
  car.weapon         = latest.weapon;
  car.shieldTimer    = latest.shieldTimer;
  car.lap            = latest.lap;
  car.nextCheckpoint = latest.nextCheckpoint ?? car.nextCheckpoint;
  car.progress       = latest.progress;
  car.finished       = latest.finished;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d >  Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Car-to-car collision (local feels solid)
function resolveCarCollisions(carsArray) {
  const minDist = 36;
  for (let i = 0; i < carsArray.length; i++) {
    for (let j = i + 1; j < carsArray.length; j++) {
      const a = carsArray[i], b = carsArray[j];
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < minDist && d > 0.01) {
        const push = (minDist - d) / d * 0.55;
        const px = dx * push, py = dy * push;
        if (a.isLocal) { a.x -= px; a.y -= py; a.vx -= px * 0.4; a.vy -= py * 0.4; }
        if (b.isLocal) { b.x += px; b.y += py; b.vx += px * 0.4; b.vy += py * 0.4; }
      }
    }
  }
}
