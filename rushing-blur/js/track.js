// ══════════════════════════════════════════════════
// RUSHING BLUR — TRACK v3
//
// CRITICAL FIXES:
// 1. Start facing UP (negative Y = north in canvas).
//    First waypoint goes UP so "forward" = up on screen.
//    Camera faces up = correct Asphalt perspective.
// 2. ROAD_WIDTH = 500. Track world is 4000x4000.
//    500 units = ~12% of track width = visually wide.
// 3. Hard boundary: car is clamped to road surface.
//    Off-road = strong push force back onto track + speed penalty.
// 4. Checkpoints every ~5 waypoints, must pass in order.
// ══════════════════════════════════════════════════

const ROAD_WIDTH = 500;          // very wide — 4+ cars side by side
const ROAD_HALF  = ROAD_WIDTH / 2;
const WORLD_BOUNDS = { x: -500, y: -500, w: 5000, h: 5000 };

// ── Track centre-line ──
// Start at bottom-centre, FIRST MOVE IS UPWARD (negative Y).
// This means car.angle starts at -PI/2 (pointing up).
// "Forward" = up the screen = correct for Asphalt view.
const TRACK_WAYPOINTS = [
  // 0-4: Start straight — going NORTH (up)
  { x: 2000, y: 3800 },
  { x: 2000, y: 3400 },
  { x: 2000, y: 3000 },
  { x: 2000, y: 2600 },
  { x: 2000, y: 2200 },

  // 5-8: Sweeping right turn (east)
  { x: 2000, y: 1800 },
  { x: 2100, y: 1500 },
  { x: 2350, y: 1300 },
  { x: 2650, y: 1200 },

  // 9-12: East straight
  { x: 3000, y: 1200 },
  { x: 3350, y: 1200 },
  { x: 3650, y: 1200 },
  { x: 3900, y: 1200 },

  // 13-16: Sharp hairpin north-east — turn south
  { x: 4100, y: 1100 },
  { x: 4250, y: 900  },
  { x: 4250, y: 650  },
  { x: 4100, y: 450  },
  { x: 3850, y: 350  },
  { x: 3600, y: 380  },
  { x: 3450, y: 550  },
  { x: 3400, y: 750  },

  // 20-23: West straight (back)
  { x: 3200, y: 750  },
  { x: 2900, y: 750  },
  { x: 2600, y: 750  },
  { x: 2300, y: 750  },
  { x: 2000, y: 750  },

  // 24-27: Chicane — jog left then right
  { x: 1700, y: 750  },
  { x: 1500, y: 650  },
  { x: 1300, y: 550  },
  { x: 1100, y: 600  },
  { x: 950,  y: 750  },
  { x: 850,  y: 950  },

  // 30-33: Wide left sweeper going south
  { x: 700,  y: 1100 },
  { x: 600,  y: 1350 },
  { x: 550,  y: 1650 },
  { x: 550,  y: 1950 },

  // 34-37: Bottom left hairpin — turn east then north-east
  { x: 550,  y: 2250 },
  { x: 600,  y: 2550 },
  { x: 700,  y: 2800 },
  { x: 900,  y: 3000 },
  { x: 1150, y: 3100 },
  { x: 1400, y: 3050 },
  { x: 1600, y: 2900 },
  { x: 1750, y: 2700 },

  // Back to start going north-north-east
  { x: 1850, y: 2500 },
  { x: 1950, y: 3000 },
  { x: 2000, y: 3400 },
  { x: 2000, y: 3800 },
];

// Checkpoint gate indices — evenly spaced around circuit
const CHECKPOINT_GATE_INDICES = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
let CHECKPOINT_GATES = [];

const PICKUP_SPOTS = [
  { x: 2000, y: 3200 },  // start straight
  { x: 2500, y: 1200 },  // east straight
  { x: 4100, y: 700  },  // hairpin
  { x: 2000, y: 750  },  // top straight
  { x: 1200, y: 600  },  // chicane
  { x: 600,  y: 1500 },  // west sweeper
  { x: 650,  y: 2700 },  // south hairpin
  { x: 1300, y: 3000 },  // return
];

let _segLengths = [], _totalLength = 0;

function initTrack() {
  _segLengths = []; _totalLength = 0;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    _segLengths.push(d);
    _totalLength += d;
  }

  // Build checkpoint gates perpendicular to track
  CHECKPOINT_GATES = CHECKPOINT_GATE_INDICES.map(idx => {
    const a     = TRACK_WAYPOINTS[idx % n];
    const b     = TRACK_WAYPOINTS[(idx + 1) % n];
    const fx    = b.x - a.x, fy = b.y - a.y;
    const len   = Math.hypot(fx, fy) || 1;
    const perpX = -fy / len, perpY = fx / len;
    return {
      cx: a.x, cy: a.y,
      perpX, perpY,
      fwdX: fx/len, fwdY: fy/len,
      hw: ROAD_HALF + 80,
    };
  });
}

// ── Checkpoint detection ──
function updateCarCheckpoints(car) {
  if (!CHECKPOINT_GATES.length) return;
  const gate = CHECKPOINT_GATES[car.nextCheckpoint % CHECKPOINT_GATES.length];
  if (!gate) return;

  const dx = car.x - gate.cx, dy = car.y - gate.cy;
  const lateral = dx * gate.perpX + dy * gate.perpY;
  if (Math.abs(lateral) > gate.hw) return;

  const fwdDot = dx * gate.fwdX + dy * gate.fwdY;
  if (Math.abs(fwdDot) > 100) return;

  const velFwd = (car.vx||0) * gate.fwdX + (car.vy||0) * gate.fwdY;
  if (velFwd < -0.5) return;  // going backwards

  car.nextCheckpoint++;
  if (car.nextCheckpoint >= CHECKPOINT_GATES.length) {
    car.nextCheckpoint = 0;
    car.lap++;
  }
  car.progress = car.nextCheckpoint / CHECKPOINT_GATES.length;
}

// Race ranking metric
function raceMetric(car) {
  return car.lap + (car.nextCheckpoint / Math.max(1, CHECKPOINT_GATES.length));
}

// ── Find nearest point on track spline to (x,y) ──
// Returns { index, t, wx, wy, nx, ny, dist }
// nx,ny = inward normal (toward centre of track)
function nearestTrackPoint(x, y) {
  let best = { index: 0, t: 0, wx: 0, wy: 0, nx: 0, ny: 0, dist: Infinity };
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx*dx + dy*dy;
    let t = len2 > 0 ? ((x-a.x)*dx + (y-a.y)*dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const wx = a.x + t*dx, wy = a.y + t*dy;
    const dist = Math.hypot(x-wx, y-wy);
    if (dist < best.dist) {
      const fLen = Math.sqrt(len2) || 1;
      // perpendicular pointing toward car (inward normal depends on side)
      const nx = -(dy/fLen), ny = dx/fLen;
      best = { index: i, t, wx, wy, nx, ny, dist };
    }
  }
  return best;
}

// Convenience alias used by renderer
function nearestWaypoint(x, y) { return nearestTrackPoint(x, y); }

// ── HARD BOUNDARY: push car back onto road ──
// Call this every physics frame for the local car.
function enforceTrackBoundary(car) {
  const nearest = nearestTrackPoint(car.x, car.y);
  const offRoad = nearest.dist - ROAD_HALF;

  if (offRoad > 0) {
    // Car is off the road — push back toward track centre
    const dx = nearest.wx - car.x, dy = nearest.wy - car.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx/dist, ny = dy/dist;  // direction toward road

    // Hard clamp: never allow more than ROAD_HALF + small margin
    const maxDist = ROAD_HALF + 20;
    if (nearest.dist > maxDist) {
      car.x = nearest.wx - nx * maxDist;
      car.y = nearest.wy - ny * maxDist;
    }

    // Push force proportional to how far off road
    const pushStrength = Math.min(offRoad * 0.8, 12);
    car.vx += nx * pushStrength;
    car.vy += ny * pushStrength;

    // Speed penalty — grass/wall friction
    const speedPenalty = Math.max(0.5, 1 - offRoad / ROAD_HALF * 0.6);
    car.vx *= speedPenalty;
    car.vy *= speedPenalty;
  }
}

function positionAtProgress(prog) {
  let dist = prog * _totalLength;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    if (dist <= _segLengths[i] + 0.001) {
      const t = Math.min(1, dist / Math.max(0.001, _segLengths[i]));
      const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i+1)%n];
      return { x: a.x+t*(b.x-a.x), y: a.y+t*(b.y-a.y), angle: Math.atan2(b.y-a.y, b.x-a.x) };
    }
    dist -= _segLengths[i];
  }
  return { ...TRACK_WAYPOINTS[0], angle: -Math.PI/2 };
}

// Start grid — staggered behind start line, spaced across wide road
const START_OFFSETS = [
  { prog: 0.006, lane:  0 },
  { prog: 0.010, lane:  1 },
  { prog: 0.010, lane: -1 },
  { prog: 0.014, lane:  2 },
  { prog: 0.014, lane: -2 },
  { prog: 0.018, lane:  0 },
];

function getStartPosition(index) {
  const sp  = START_OFFSETS[index % START_OFFSETS.length];
  const pos = positionAtProgress(sp.prog);
  const perp = pos.angle + Math.PI / 2;
  return {
    x:    pos.x + Math.cos(perp) * sp.lane * 100,
    y:    pos.y + Math.sin(perp) * sp.lane * 100,
    angle: pos.angle,
  };
}
