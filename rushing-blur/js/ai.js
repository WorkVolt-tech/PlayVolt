// ── AI SYSTEM ──
// Waypoint-following opponents with rubber-banding and weapon use

const AI_NAMES = ['STRIKER', 'NEON', 'RAZOR', 'VOLT', 'HAVOC'];
const AI_CAR_IDS = ['titan', 'viper', 'nitro', 'ghost', 'wraith'];

function createAICar(index, carId, state) {
  const carDef = CARS.find(c => c.id === carId) || CARS[index % CARS.length];
  const startPos = getStartPosition(index + 1);

  return {
    id: 'ai_' + index,
    name: AI_NAMES[index] || ('AI ' + index),
    isPlayer: false,
    carDef,
    x: startPos.x,
    y: startPos.y,
    angle: startPos.angle,
    vx: 0, vy: 0,
    speed: 0,
    health: carDef.maxHealth,
    maxHealth: carDef.maxHealth,
    weapon: null,
    shieldTimer: 0,
    boostFuel: 0.4,
    boosting: false,
    lap: 0,
    lastProgress: startPos.progress || 0,
    progress: 0,
    wpTarget: 1,
    dead: false,
    finished: false,
    finishTime: null,
    // AI tuning
    aggression: 0.3 + Math.random() * 0.5,
    rubberBandStrength: 0.15 + Math.random() * 0.25,
    weaponCooldown: 0,
    steerNoise: 0,
    steerNoiseTimer: 0,
  };
}

function updateAI(car, playerCar, state, dt) {
  if (car.dead || car.finished) return;

  const def = car.carDef;

  // ── TARGET WAYPOINT ──
  // Find which waypoint to steer toward
  const wp = TRACK_WAYPOINTS[car.wpTarget % TRACK_WAYPOINTS.length];
  const dx = wp.x - car.x;
  const dy = wp.y - car.y;
  const distToWp = Math.hypot(dx, dy);

  // Advance to next waypoint
  if (distToWp < 55) {
    car.wpTarget = (car.wpTarget + 1) % TRACK_WAYPOINTS.length;
  }

  // ── STEER TOWARD WAYPOINT ──
  const targetAngle = Math.atan2(dy, dx);
  let angleDiff = targetAngle - car.angle;
  // Normalize
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // Steering noise so AIs don't follow perfectly
  if (--car.steerNoiseTimer <= 0) {
    car.steerNoise = (Math.random() - 0.5) * 0.15;
    car.steerNoiseTimer = 20 + Math.random() * 40;
  }

  const steer = Math.max(-1, Math.min(1, angleDiff * 3 + car.steerNoise));
  car.angle += steer * def.handling;

  // ── THROTTLE ──
  // Rubber banding: slow down when ahead, speed up when behind
  let targetSpeed = def.maxSpeed;
  if (playerCar && !playerCar.finished) {
    const playerProgress = playerCar.progress + playerCar.lap;
    const myProgress = car.progress + car.lap;
    const gap = playerProgress - myProgress;
    // If player is behind, slow a touch; if player is ahead, boost a touch
    const rbFactor = 1 + gap * car.rubberBandStrength * 0.5;
    targetSpeed *= Math.max(0.7, Math.min(1.15, rbFactor));
  }

  // Slow for tight corners (detect large angle change ahead)
  const nextWp = TRACK_WAYPOINTS[(car.wpTarget + 1) % TRACK_WAYPOINTS.length];
  const nowWp = TRACK_WAYPOINTS[car.wpTarget % TRACK_WAYPOINTS.length];
  const a1 = Math.atan2(wp.y - car.y, wp.x - car.x);
  const a2 = Math.atan2(nextWp.y - nowWp.y, nextWp.x - nowWp.x);
  let cornerDiff = Math.abs(a2 - a1);
  if (cornerDiff > Math.PI) cornerDiff = Math.PI * 2 - cornerDiff;
  const cornerSlow = 1 - (cornerDiff / Math.PI) * 0.5;
  targetSpeed *= cornerSlow;

  // Accelerate toward target
  car.speed += (targetSpeed - car.speed) * 0.08;
  car.speed = Math.max(0, car.speed);

  // ── BOOST ──
  car.boostFuel = Math.min(1, car.boostFuel + def.boostRecharge);
  car.boosting = false;
  if (car.boostFuel > 0.7 && cornerDiff < 0.3 && Math.random() < 0.02) {
    car.boosting = true;
    car.boostFuel -= def.boostDrain * 3;
  }
  const boostFactor = car.boosting ? def.boostMultiplier : 1;

  // ── PHYSICS ──
  car.vx = car.vx * def.friction + Math.cos(car.angle) * car.speed * boostFactor * 0.08;
  car.vy = car.vy * def.friction + Math.sin(car.angle) * car.speed * boostFactor * 0.08;
  car.x += car.vx;
  car.y += car.vy;

  // ── SHIELD TIMER ──
  if (car.shieldTimer > 0) car.shieldTimer--;

  // ── WEAPON USE ──
  if (car.weapon && --car.weaponCooldown <= 0) {
    // Use weapon if player is nearby or randomly
    let shouldFire = false;
    if (playerCar) {
      const d = Math.hypot(playerCar.x - car.x, playerCar.y - car.y);
      if (car.weapon === 'shield' && car.health < car.maxHealth * 0.4) shouldFire = true;
      else if (car.weapon === 'repair' && car.health < car.maxHealth * 0.5) shouldFire = true;
      else if (d < 300 && Math.random() < car.aggression * 0.05) shouldFire = true;
    }
    if (shouldFire) {
      const wt = WEAPON_TYPES[car.weapon];
      if (wt) wt.use(car, state);
      car.weapon = null;
      car.weaponCooldown = 120;
    }
  }

  // ── LAP TRACKING ──
  updateCarProgress(car);
}

function updateCarProgress(car) {
  const nearest = nearestWaypoint(car.x, car.y);
  const newProg = nearest.progress;

  // Detect lap completion (crossing 0 going from high to low)
  const prev = car.lastProgress;
  if (prev > 0.85 && newProg < 0.15) {
    car.lap++;
  } else if (prev < 0.15 && newProg > 0.85) {
    // Going backwards - don't count
  }

  car.lastProgress = newProg;
  car.progress = newProg;
}

// Car-to-car collision push
function resolveCarCollisions(cars) {
  const minDist = 30;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < minDist && d > 0) {
        const push = (minDist - d) / d * 0.5;
        const px = dx * push, py = dy * push;
        a.x -= px; a.y -= py;
        b.x += px; b.y += py;
        // Transfer some velocity
        const avgVx = (a.vx + b.vx) * 0.3;
        const avgVy = (a.vy + b.vy) * 0.3;
        a.vx = a.vx * 0.7 - px * 0.5 + avgVx;
        a.vy = a.vy * 0.7 - py * 0.5 + avgVy;
        b.vx = b.vx * 0.7 + px * 0.5 + avgVx;
        b.vy = b.vy * 0.7 + py * 0.5 + avgVy;
      }
    }
  }
}

// Race position sorting
function getRacePositions(cars) {
  return [...cars]
    .sort((a, b) => {
      const aTotal = a.lap + a.progress;
      const bTotal = b.lap + b.progress;
      return bTotal - aTotal;
    })
    .map((car, i) => ({ car, position: i + 1 }));
}
