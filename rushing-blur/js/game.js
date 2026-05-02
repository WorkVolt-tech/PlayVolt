// ══════════════════════════════════════════════════
// RUSHING BLUR — GAME ENGINE
// ══════════════════════════════════════════════════

let GS = null;       // Game State
let _raf = null;
let _lastFrame = 0;

// ════════════════════════════════════
// INIT
// ════════════════════════════════════

function initGame(localPlayerData, roomData, allPlayers) {
  initTrack();

  const laps = roomData.laps || CONFIG.DEFAULT_LAPS;

  // Build car objects for every player
  const cars = {};
  allPlayers.forEach((pRow, index) => {
    const isLocal = pRow.player_id === localPlayerData.playerId;
    const carDef  = CARS.find(c => c.id === pRow.car_id) || CARS[4];
    const startPos = getStartPosition(index);

    const car = {
      id:          pRow.player_id,
      name:        pRow.name,
      carId:       pRow.car_id,
      carDef,
      isLocal,
      x:           startPos.x,
      y:           startPos.y,
      angle:       startPos.angle,
      vx: 0, vy: 0,
      speed: 0,
      health:      carDef.maxHealth,
      maxHealth:   carDef.maxHealth,
      weapon:      null,
      shieldTimer: 0,
      boostFuel:   1,
      isBoosting:  false,
      lap:         0,
      lastProgress:    0,
      progress:        0,
      nextCheckpoint:  0,
      finished:    false,
      finishTime:  null,
      dead:        false,
      snapshots:   [],   // for remote interpolation
    };
    cars[pRow.player_id] = car;
  });

  // Init pickups
  const pickups = PICKUP_SPOTS.map((sp, i) => ({
    id:           'pu_' + i,
    x:            sp.x,
    y:            sp.y,
    active:       true,
    weapon:       randomWeapon(),
    pulse:        Math.random() * Math.PI * 2,
    respawnTimer: 0,
  }));

  GS = {
    phase:        'countdown',   // countdown | racing | finished
    cars,
    localCar:     cars[localPlayerData.playerId],
    pickups,
    projectiles:  [],
    mines:        [],
    particles:    [],
    screenShake:  0,
    damageFlash:  0,
    countdownVal: CONFIG.COUNTDOWN_SECS,
    countdownTimer: CONFIG.COUNTDOWN_SECS * 60,
    raceElapsed:  0,
    totalLaps:    laps,
    finishOrder:  [],
    bestLap:      Infinity,
    lastLapStart: 0,
    // local meta
    localName:    localPlayerData.name,
    localCarId:   localPlayerData.carId,
    isHost:       localPlayerData.isHost,
  };

  // ── Wire up network callbacks ──
  Network.on('onPlayerSnapshot', _onRemoteSnapshot);
  Network.on('onPlayerLeft',     _onPlayerLeft);
  Network.on('onPickupConsumed', _onPickupConsumed);
  Network.on('onWeaponFired',    _onRemoteWeaponFired);
  Network.on('onRoomStateChange',_onRoomStateChange);

  // ── Start broadcasting our position ──
  Network.startBroadcasting(_getLocalSnapshot);

  initRenderer();
}

function startGameLoop() {
  if (_raf) cancelAnimationFrame(_raf);
  _lastFrame = 0;
  _raf = requestAnimationFrame(_loop);
}

function stopGameLoop() {
  if (_raf) cancelAnimationFrame(_raf);
  _raf = null;
}

// ════════════════════════════════════
// MAIN LOOP
// ════════════════════════════════════

function _loop(ts) {
  const dt = Math.min((ts - (_lastFrame || ts)) / 16.667, 3);
  _lastFrame = ts;

  if (GS) {
    _update(dt);
    renderFrame(GS);
    _updateHUD();
  }
  _raf = requestAnimationFrame(_loop);
}

function _update(dt) {
  const state = GS;

  // ── COUNTDOWN ──
  if (state.phase === 'countdown') {
    state.countdownTimer -= dt;
    const remaining = Math.ceil(state.countdownTimer / 60);
    const el = document.getElementById('countdown');
    if (state.countdownTimer > 0) {
      el.classList.remove('hidden');
      el.textContent = remaining > 0 ? remaining : 'GO!';
    } else {
      el.textContent = 'GO!';
      setTimeout(() => el.classList.add('hidden'), 700);
      state.phase = 'racing';
      state.lastLapStart = 0;
    }
    return;
  }

  if (state.phase !== 'racing') return;

  state.raceElapsed += dt / 60;

  const local = state.localCar;

  // ── LOCAL PLAYER PHYSICS ──
  if (local && !local.finished) {
    updateLocalPlayer(local, dt, state);
    updateCarCheckpoints(local);
    checkPickups(local, state);

    // Lap complete?
    if (local._prevLap === undefined) local._prevLap = 0;
    if (local.lap > local._prevLap) {
      const lapTime = state.raceElapsed - state.lastLapStart;
      if (lapTime < state.bestLap) state.bestLap = lapTime;
      state.lastLapStart = state.raceElapsed;
      local._prevLap = local.lap;
      showToast(`Lap ${local.lap} — ${formatTime(lapTime)}`);
    }

    // Race finished?
    if (local.lap >= state.totalLaps && !local.finished) {
      _playerFinished(local);
    }
  }

  // ── REMOTE CARS: interpolate ──
  for (const car of Object.values(state.cars)) {
    if (!car || car.isLocal) continue;
    interpolateRemoteCar(car);
    updateCarCheckpoints(car);

    // Check if remote player finished
    if (car.lap >= state.totalLaps && !car.finished) {
      car.finished = true;
      state.finishOrder.push({ id: car.id, name: car.name, carId: car.carId, time: state.raceElapsed });
    }
  }

  // ── COLLISIONS ──
  resolveCarCollisions(Object.values(state.cars).filter(c => c && !c.dead));

  // ── WEAPONS / PROJECTILES ──
  updateProjectiles(state);

  // ── CHECK ALL FINISHED ──
  const racing = Object.values(state.cars).filter(c => c && !c.finished && !c.dead);
  if (racing.length === 0 && state.phase === 'racing') {
    state.phase = 'finished';
    setTimeout(() => UI.showResults(state), 2500);
  }
}

// ════════════════════════════════════
// PLAYER FINISHED
// ════════════════════════════════════

function _playerFinished(car) {
  car.finished  = true;
  car.finishTime = GS.raceElapsed;
  const position = GS.finishOrder.length + 1;
  GS.finishOrder.push({ id: car.id, name: car.name, carId: car.carId, time: car.finishTime, position });

  Network.submitFinish(car.finishTime, position);

  // Save to leaderboard if finished in top 3
  if (position <= 3) {
    Network.saveToLeaderboard(GS.localName, GS.localCarId, car.finishTime, position, GS.totalLaps);
  }

  showToast(position === 1 ? '🏆 YOU WON!' : `P${position} — ${formatTime(car.finishTime)}`);

  // Show results after delay
  if (position === 1 || Object.values(GS.cars).every(c => !c || c.finished)) {
    setTimeout(() => UI.showResults(GS), 3000);
  }
}

// ════════════════════════════════════
// NETWORK CALLBACKS
// ════════════════════════════════════

function _onRemoteSnapshot(playerId, snap, serverTime) {
  if (!GS) return;
  const car = GS.cars[playerId];
  if (!car) return;
  pushRemoteSnapshot(car, snap, serverTime);
}

function _onPlayerLeft(playerId) {
  if (!GS || !GS.cars[playerId]) return;
  GS.cars[playerId].dead = true;
  showToast(`${GS.cars[playerId].name} left the race`);
}

function _onPickupConsumed(pickupId, weapon, byPlayerId) {
  if (!GS) return;
  const pu = GS.pickups.find(p => p.id === pickupId);
  if (pu && byPlayerId !== Network.localId) {
    pu.active       = false;
    pu.respawnTimer = 300;
  }
}

function _onRemoteWeaponFired(data) {
  if (!GS) return;
  // Spawn visual-only projectile for remote player
  if (data.type === 'bolt' || data.type === 'shunt') {
    const count = data.type === 'shunt' ? 8 : 1;
    for (let i = 0; i < count; i++) {
      const a = data.type === 'shunt' ? (i / 8) * Math.PI * 2 : data.angle;
      const spd = data.type === 'shunt' ? 8 : 14;
      GS.projectiles.push({
        id: Math.random().toString(36).slice(2),
        type: data.type, ownerId: data.id,
        x: data.x, y: data.y,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        damage: data.type === 'shunt' ? 20 : 35,
        radius: data.type === 'shunt' ? 7 : 8,
        life: data.type === 'shunt' ? 35 : 90,
        color: data.type === 'shunt' ? '#ff00aa' : '#e8ff00',
        trail: [],
      });
    }
  }
}

function _onRoomStateChange(room) {
  if (!GS) return;
  if (room.state === 'countdown' && GS.phase === 'lobby') {
    GS.phase = 'countdown';
  }
  if (room.state === 'finished') {
    GS.phase = 'finished';
    setTimeout(() => UI.showResults(GS), 1500);
  }
}

// ════════════════════════════════════
// LOCAL SNAPSHOT (sent to network)
// ════════════════════════════════════

function _getLocalSnapshot() {
  const car = GS?.localCar;
  if (!car) return null;
  return {
    x: car.x, y: car.y, angle: car.angle,
    vx: car.vx, vy: car.vy, speed: car.speed,
    isBoosting:  car.isBoosting,
    health:      car.health / car.maxHealth,  // normalized 0-1
    weapon:      car.weapon,
    shieldTimer: car.shieldTimer,
    lap:            car.lap,
    nextCheckpoint: car.nextCheckpoint,
    progress:       car.progress,
    finished:       car.finished,
  };
}

// ════════════════════════════════════
// HUD UPDATE
// ════════════════════════════════════

function _updateHUD() {
  if (!GS) return;
  const local = GS.localCar;
  if (!local) return;

  // Position
  const sorted = Object.values(GS.cars)
    .filter(c => c)
    .sort((a, b) => raceMetric(b) - raceMetric(a));
  const myPos = sorted.findIndex(c => c.isLocal) + 1;
  const suffixes = ['ST','ND','RD','TH','TH','TH'];
  document.getElementById('pos-num').textContent    = myPos;
  document.getElementById('pos-suffix').textContent = suffixes[myPos - 1] || 'TH';

  // Lap
  const displayLap = Math.min(local.lap + 1, GS.totalLaps);
  document.getElementById('lap-num').textContent   = displayLap;
  document.getElementById('lap-total').textContent = GS.totalLaps;

  // Time
  document.getElementById('race-time').textContent = formatTime(GS.raceElapsed);

  // Health
  const hp   = local.health / local.maxHealth;
  const hBar = document.getElementById('health-bar');
  hBar.style.width      = (hp * 100) + '%';
  hBar.style.background = hp > 0.5 ? '#00ff88' : hp > 0.25 ? '#ffaa00' : '#ff3300';

  // Boost
  document.getElementById('boost-bar').style.width = (local.boostFuel * 100) + '%';

  // Speed
  document.getElementById('speed-num').textContent = Math.round(Math.hypot(local.vx, local.vy) * 28);

  // Weapon
  if (local.weapon) {
    const wt = WEAPON_TYPES[local.weapon];
    document.getElementById('weapon-icon').textContent  = wt ? wt.icon : '?';
    document.getElementById('weapon-label').textContent = wt ? wt.label : local.weapon;
  } else {
    document.getElementById('weapon-icon').textContent  = '—';
    document.getElementById('weapon-label').textContent = 'NO WEAPON';
  }
}

// ════════════════════════════════════
// UTILITIES
// ════════════════════════════════════

function formatTime(seconds) {
  const m  = Math.floor(seconds / 60);
  const s  = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}

function showToast(msg, duration = 3000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), duration);
}
