// ══════════════════════════════════════════════════
// RUSHING BLUR — WEAPONS SYSTEM
// ══════════════════════════════════════════════════

const WEAPON_TYPES = {
  bolt:   { id: 'bolt',   label: 'BOLT',   icon: '⚡', color: '#e8ff00' },
  mine:   { id: 'mine',   label: 'MINE',   icon: '💣', color: '#ff4400' },
  shield: { id: 'shield', label: 'SHIELD', icon: '🛡️', color: '#00aaff' },
  shunt:  { id: 'shunt',  label: 'SHUNT',  icon: '💥', color: '#ff00aa' },
  repair: { id: 'repair', label: 'REPAIR', icon: '🔧', color: '#00ff88' },
};

const WEAPON_POOL = ['bolt','bolt','bolt','mine','mine','shield','shunt','repair'];
function randomWeapon() { return WEAPON_POOL[Math.floor(Math.random() * WEAPON_POOL.length)]; }

// ── Fire functions (return data for both local and network broadcast) ──
function fireBolt(owner, state) {
  const spd = 14;
  const proj = {
    id: Math.random().toString(36).slice(2),
    type: 'bolt',
    ownerId: owner.id,
    x: owner.x + Math.cos(owner.angle) * 30,
    y: owner.y + Math.sin(owner.angle) * 30,
    vx: Math.cos(owner.angle) * spd + owner.vx * 0.5,
    vy: Math.sin(owner.angle) * spd + owner.vy * 0.5,
    damage: 35, radius: 8, life: 90,
    color: '#e8ff00', trail: [],
  };
  state.projectiles.push(proj);
}

function fireShunt(owner, state) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    state.projectiles.push({
      id: Math.random().toString(36).slice(2),
      type: 'shunt', ownerId: owner.id,
      x: owner.x, y: owner.y,
      vx: Math.cos(a) * 8, vy: Math.sin(a) * 8,
      damage: 20, radius: 7, life: 35,
      color: '#ff00aa', trail: [],
    });
  }
  state.screenShake = 12;
}

function dropMine(owner, state) {
  const behind = owner.angle + Math.PI;
  state.mines.push({
    id: Math.random().toString(36).slice(2),
    ownerId: owner.id,
    x: owner.x + Math.cos(behind) * 28,
    y: owner.y + Math.sin(behind) * 28,
    damage: 55, radius: 18,
    armed: false, armTimer: 60,
    life: 1800, color: '#ff4400', pulse: 0,
  });
}

function activateShield(owner) { owner.shieldTimer = 300; }
function doRepair(owner)       { owner.health = Math.min(owner.maxHealth, owner.health + owner.maxHealth * 0.35); }

// Use a weapon — returns true if consumed
function useWeapon(owner, state) {
  if (!owner.weapon) return false;
  switch (owner.weapon) {
    case 'bolt':   fireBolt(owner, state); break;
    case 'shunt':  fireShunt(owner, state); break;
    case 'mine':   dropMine(owner, state); break;
    case 'shield': activateShield(owner); break;
    case 'repair': doRepair(owner); break;
  }
  owner.weapon = null;
  return true;
}

// ── Damage helper ──
function applyDamage(car, dmg, state) {
  if (car.shieldTimer > 0) return;
  car.health = Math.max(0, car.health - dmg);
  if (car.isLocal) {
    state.damageFlash = 20;
    state.screenShake = Math.max(state.screenShake || 0, 6);
  }
  // knockback
  const a = Math.random() * Math.PI * 2;
  car.vx = (car.vx || 0) + Math.cos(a) * 1.5;
  car.vy = (car.vy || 0) + Math.sin(a) * 1.5;
}

// ── Spawn particles ──
function spawnParticles(state, x, y, color, count) {
  if (!state.particles) state.particles = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, spd = 1 + Math.random() * 4;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      color, life: 20 + Math.random() * 20, maxLife: 40, alpha: 1, r: 2 + Math.random() * 3,
    });
  }
}

// ── Main update (called every frame for local player's weapon state) ──
function updateProjectiles(state) {
  const cars = Object.values(state.cars);

  // Projectiles
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();
    p.x += p.vx; p.y += p.vy; p.life--;
    if (p.life <= 0) { state.projectiles.splice(i, 1); continue; }

    let hit = false;
    for (const car of cars) {
      if (car.id === p.ownerId || car.dead) continue;
      if (Math.hypot(car.x - p.x, car.y - p.y) < p.radius + 16) {
        applyDamage(car, p.damage, state);
        spawnParticles(state, p.x, p.y, p.color, 12);
        state.projectiles.splice(i, 1);
        hit = true; break;
      }
    }
    if (hit) continue;
  }

  // Mines
  for (let i = state.mines.length - 1; i >= 0; i--) {
    const m = state.mines[i];
    m.life--;
    m.pulse = ((m.pulse || 0) + 0.08) % (Math.PI * 2);
    if (m.armTimer > 0) { m.armTimer--; continue; }
    m.armed = true;
    if (m.life <= 0) { state.mines.splice(i, 1); continue; }
    for (const car of cars) {
      if (car.id === m.ownerId || car.dead) continue;
      if (Math.hypot(car.x - m.x, car.y - m.y) < m.radius + 14) {
        applyDamage(car, m.damage, state);
        spawnParticles(state, m.x, m.y, m.color, 20);
        if (state.screenShake !== undefined) state.screenShake = 8;
        state.mines.splice(i, 1); break;
      }
    }
  }

  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life--;
    p.alpha = p.life / p.maxLife;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Pickups: respawn timer
  for (const pu of (state.pickups || [])) {
    if (!pu.active && pu.respawnTimer > 0) {
      pu.respawnTimer--;
      if (pu.respawnTimer <= 0) { pu.active = true; pu.weapon = randomWeapon(); }
    }
    if (pu.active) pu.pulse = ((pu.pulse || 0) + 0.05) % (Math.PI * 2);
  }
}

// Check if local car picks up a weapon box
function checkPickups(car, state) {
  for (const pu of (state.pickups || [])) {
    if (!pu.active) continue;
    if (Math.hypot(car.x - pu.x, car.y - pu.y) < 24) {
      car.weapon = pu.weapon;
      pu.active = false;
      pu.respawnTimer = 300;
      spawnParticles(state, pu.x, pu.y, '#ffffff', 8);
      // Broadcast pickup consumed so other clients hide it
      Network.broadcastPickup(pu.id);
    }
  }
}
