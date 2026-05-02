// ══════════════════════════════════════════════════
// RUSHING BLUR — TRACK SYSTEM v2
//
// Fixes:
// 1. ROAD_WIDTH = 220 — 3x wider, room for 4 cars side-by-side
// 2. Checkpoint GATE system — must pass gates in order.
//    Circling, going backwards, or 360-ing won't count laps.
// 3. Large sweeping circuit — long straights, wide hairpins
// ══════════════════════════════════════════════════

const ROAD_WIDTH = 220;
const ROAD_HALF  = ROAD_WIDTH / 2;
const WORLD_BOUNDS = { x: -200, y: -200, w: 3200, h: 2600 };

// Large sweeping circuit — designed for 4-wide racing
const TRACK_WAYPOINTS = [
  // START/FINISH straight (going right)
  { x: 700,  y: 1800 },
  { x: 1000, y: 1800 },
  { x: 1400, y: 1800 },
  { x: 1800, y: 1800 },
  { x: 2100, y: 1800 },

  // Sweeping right-hander south-east
  { x: 2400, y: 1800 },
  { x: 2600, y: 1750 },
  { x: 2750, y: 1600 },
  { x: 2800, y: 1400 },
  { x: 2780, y: 1200 },

  // Back straight going north
  { x: 2700, y: 1000 },
  { x: 2600, y: 800  },
  { x: 2500, y: 600  },

  // Sharp hairpin top-right
  { x: 2500, y: 400  },
  { x: 2400, y: 260  },
  { x: 2200, y: 180  },
  { x: 2000, y: 200  },
  { x: 1850, y: 320  },
  { x: 1800, y: 480  },

  // Top straight going west
  { x: 1700, y: 550  },
  { x: 1500, y: 560  },
  { x: 1300, y: 540  },
  { x: 1100, y: 500  },

  // Chicane
  { x: 950,  y: 460  },
  { x: 850,  y: 380  },
  { x: 750,  y: 320  },
  { x: 620,  y: 300  },
  { x: 500,  y: 360  },
  { x: 430,  y: 470  },
  { x: 420,  y: 600  },

  // Wide left-hander going south
  { x: 360,  y: 750  },
  { x: 280,  y: 900  },
  { x: 220,  y: 1100 },
  { x: 200,  y: 1300 },
  { x: 240,  y: 1500 },

  // Final sweeper back to start
  { x: 340,  y: 1650 },
  { x: 480,  y: 1760 },
  { x: 600,  y: 1800 },
  { x: 700,  y: 1800 },
];

// Checkpoint gates — one every ~4 waypoints around the circuit
// Car must pass gate[N] before gate[N+1] every lap
const CHECKPOINT_GATE_INDICES = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36];
let CHECKPOINT_GATES = []; // built in initTrack()

const PICKUP_SPOTS = [
  { x: 1400, y: 1800 },
  { x: 2650, y: 1500 },
  { x: 2650, y: 900  },
  { x: 2100, y: 300  },
  { x: 1300, y: 540  },
  { x: 650,  y: 330  },
  { x: 250,  y: 1100 },
  { x: 430,  y: 1700 },
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

  // Build gate objects
  CHECKPOINT_GATES = CHECKPOINT_GATE_INDICES.map(wpIdx => {
    const a    = TRACK_WAYPOINTS[wpIdx];
    const b    = TRACK_WAYPOINTS[(wpIdx + 1) % n];
    const fwdX = b.x - a.x, fwdY = b.y - a.y;
    const len  = Math.hypot(fwdX, fwdY) || 1;
    const perpX = -fwdY / len, perpY = fwdX / len;
    return {
      wpIdx,
      cx: a.x, cy: a.y,
      perpX, perpY,
      fwdX: fwdX / len, fwdY: fwdY / len,
      hw: ROAD_HALF + 60,    // gate is slightly wider than road
    };
  });
}

// ── Check if car has passed its next checkpoint gate ──
function updateCarCheckpoints(car) {
  if (!CHECKPOINT_GATES.length) return;
  const gate = CHECKPOINT_GATES[car.nextCheckpoint];
  if (!gate) return;

  // Vector from gate centre to car
  const dx = car.x - gate.cx;
  const dy = car.y - gate.cy;

  // Lateral offset (left-right of gate) — must be within gate width
  const lateral = dx * gate.perpX + dy * gate.perpY;
  if (Math.abs(lateral) > gate.hw) return;

  // Longitudinal offset — must be close to the gate line (±80px)
  const fwdDot = dx * gate.fwdX + dy * gate.fwdY;
  if (Math.abs(fwdDot) > 80) return;

  // Must be moving forward through the gate, not backward
  const velFwd = (car.vx || 0) * gate.fwdX + (car.vy || 0) * gate.fwdY;
  if (velFwd < -0.5) return;

  // ── Gate cleared ──
  const total = CHECKPOINT_GATES.length;
  car.nextCheckpoint++;
  if (car.nextCheckpoint >= total) {
    car.nextCheckpoint = 0;
    car.lap++;
  }
  car.progress = car.nextCheckpoint / total;
}

// Race position metric (lap + fractional checkpoint progress)
function raceMetric(car) {
  return car.lap + (car.nextCheckpoint / Math.max(1, CHECKPOINT_GATES.length));
}

// Nearest waypoint on the track spline (for AI steering)
function nearestWaypoint(x, y) {
  let best = { index: 0, t: 0, dist: Infinity };
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.dist) best = { index: i, t, dist: d };
  }
  return best;
}

function positionAtProgress(prog) {
  let dist = prog * _totalLength;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    if (dist <= _segLengths[i] + 0.001) {
      const t = Math.min(1, dist / Math.max(0.001, _segLengths[i]));
      const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
      return { x: a.x + t*(b.x-a.x), y: a.y + t*(b.y-a.y), angle: Math.atan2(b.y-a.y, b.x-a.x) };
    }
    dist -= _segLengths[i];
  }
  return { ...TRACK_WAYPOINTS[0], angle: 0 };
}

// Wide grid — 55px between lanes to use the full road width
const START_OFFSETS = [
  { prog: 0.003, lane:  0 },
  { prog: 0.006, lane:  1 },
  { prog: 0.006, lane: -1 },
  { prog: 0.009, lane:  2 },
  { prog: 0.009, lane: -2 },
  { prog: 0.012, lane:  0 },
];

function getStartPosition(index) {
  const sp  = START_OFFSETS[index % START_OFFSETS.length];
  const pos = positionAtProgress(sp.prog);
  const perp = pos.angle + Math.PI / 2;
  return {
    x: pos.x + Math.cos(perp) * sp.lane * 55,
    y: pos.y + Math.sin(perp) * sp.lane * 55,
    angle: pos.angle,
    progress: 0,
    nextCheckpoint: 0,
  };
}
