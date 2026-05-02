// ══════════════════════════════════════════════════
// RUSHING BLUR — CAR DEFINITIONS
// ══════════════════════════════════════════════════

const CARS = [
  {
    id: 'phantom',
    name: 'PHANTOM',
    type: 'Speed Demon',
    desc: 'Maximum top speed, paper-thin armour. One bad hit can end your run — but nothing on the grid keeps up with you on a straight.',
    color: '#e8ff00', color2: '#aacc00',
    bodyW: 36, bodyH: 20,
    stats: { speed: 10, handling: 5, armour: 2, boost: 8, acceleration: 7 },
    maxSpeed: 9.0, acceleration: 0.28, handling: 0.055, friction: 0.970,
    maxHealth: 60,  boostMultiplier: 1.65, boostDrain: 0.018, boostRecharge: 0.004,
  },
  {
    id: 'titan',
    name: 'TITAN',
    type: 'Armoured Tank',
    desc: 'Nearly indestructible. Shrugs off bolts and mines, but its handling is brutal. Plan your corners three turns ahead.',
    color: '#ff4400', color2: '#cc2200',
    bodyW: 42, bodyH: 24,
    stats: { speed: 5, handling: 3, armour: 10, boost: 4, acceleration: 4 },
    maxSpeed: 5.5, acceleration: 0.15, handling: 0.028, friction: 0.960,
    maxHealth: 220, boostMultiplier: 1.30, boostDrain: 0.025, boostRecharge: 0.003,
  },
  {
    id: 'viper',
    name: 'VIPER',
    type: 'Precision Handler',
    desc: 'Corners like it\'s on rails. Average top speed but the tightest turning circle on the grid — surgical in the right hands.',
    color: '#00aaff', color2: '#0077cc',
    bodyW: 34, bodyH: 18,
    stats: { speed: 6, handling: 10, armour: 5, boost: 6, acceleration: 8 },
    maxSpeed: 6.8, acceleration: 0.26, handling: 0.085, friction: 0.975,
    maxHealth: 120, boostMultiplier: 1.45, boostDrain: 0.020, boostRecharge: 0.005,
  },
  {
    id: 'nitro',
    name: 'NITRO',
    type: 'Boost Specialist',
    desc: 'Massive boost tank and the fastest recharge. Save it for the straights and nothing touches you — until you have to turn.',
    color: '#ff00aa', color2: '#cc0077',
    bodyW: 38, bodyH: 20,
    stats: { speed: 7, handling: 6, armour: 5, boost: 10, acceleration: 6 },
    maxSpeed: 7.2, acceleration: 0.22, handling: 0.062, friction: 0.972,
    maxHealth: 110, boostMultiplier: 1.90, boostDrain: 0.012, boostRecharge: 0.008,
  },
  {
    id: 'ghost',
    name: 'GHOST',
    type: 'All-Rounder',
    desc: 'No extreme weaknesses, no extreme strengths. If you\'re new to the track or want a fair fight, Ghost is your pick.',
    color: '#aaffcc', color2: '#66cc88',
    bodyW: 36, bodyH: 20,
    stats: { speed: 7, handling: 7, armour: 6, boost: 7, acceleration: 7 },
    maxSpeed: 7.0, acceleration: 0.22, handling: 0.065, friction: 0.973,
    maxHealth: 140, boostMultiplier: 1.50, boostDrain: 0.016, boostRecharge: 0.005,
  },
  {
    id: 'wraith',
    name: 'WRAITH',
    type: 'Drift King',
    desc: 'High acceleration and loose grip — it slides everywhere. Master the drift and chain corners into pure speed.',
    color: '#ff8800', color2: '#cc5500',
    bodyW: 38, bodyH: 19,
    stats: { speed: 8, handling: 8, armour: 4, boost: 7, acceleration: 9 },
    maxSpeed: 8.0, acceleration: 0.32, handling: 0.075, friction: 0.958,
    maxHealth: 90,  boostMultiplier: 1.55, boostDrain: 0.017, boostRecharge: 0.006,
  },
];

// Draw a car silhouette on any canvas context
function drawCarShape(ctx, car, cx, cy, angle, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  const w = car.bodyW, h = car.bodyH, hw = w / 2, hh = h / 2;

  ctx.shadowColor = car.color;
  ctx.shadowBlur  = 10;

  // Body
  ctx.fillStyle = car.color2;
  ctx.beginPath();
  ctx.roundRect(-hw, -hh, w, h, 4);
  ctx.fill();

  // Top stripe
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-hw + 4, -hh + 3, w - 8, h * 0.38, 2);
  ctx.fill();

  // Wheels
  ctx.fillStyle = '#111';
  ctx.shadowBlur = 0;
  const wheels = [[-hw - 2, -hh + 2], [-hw - 2, hh - 7], [hw - 6, -hh + 2], [hw - 6, hh - 7]];
  wheels.forEach(([wx, wy]) => ctx.fillRect(wx, wy, 8, 5));

  // Headlights
  ctx.fillStyle = '#ffffaa';
  ctx.fillRect(hw - 4, -hh + 4, 3, 4);
  ctx.fillRect(hw - 4,  hh - 8, 3, 4);

  ctx.restore();
}

// Draw a name tag above a remote car
function drawNameTag(ctx, name, x, y, color) {
  ctx.save();
  ctx.font = '700 10px Rajdhani, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = color;
  ctx.fillText(name, x, y - 2);
  ctx.restore();
}
