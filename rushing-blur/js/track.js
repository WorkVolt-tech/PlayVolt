// ══════════════════════════════════════════════════
// RUSHING BLUR — TRACK SYSTEM
// ══════════════════════════════════════════════════

const TRACK_WAYPOINTS = [
  { x: 900, y: 400 }, { x: 1050, y: 400 }, { x: 1150, y: 420 }, { x: 1200, y: 480 },
  { x: 1210, y: 560 }, { x: 1180, y: 640 }, { x: 1100, y: 700 },
  { x: 980,  y: 720 }, { x: 820,  y: 720 }, { x: 680,  y: 710 },
  { x: 560,  y: 680 }, { x: 500,  y: 620 }, { x: 490,  y: 540 },
  { x: 530,  y: 470 }, { x: 600,  y: 440 },
  { x: 680,  y: 430 }, { x: 740,  y: 390 }, { x: 740,  y: 320 },
  { x: 700,  y: 260 }, { x: 620,  y: 230 },
  { x: 540,  y: 240 }, { x: 460,  y: 270 }, { x: 400,  y: 340 },
  { x: 390,  y: 420 }, { x: 420,  y: 490 },
  { x: 350,  y: 560 }, { x: 300,  y: 640 }, { x: 280,  y: 720 },
  { x: 290,  y: 800 }, { x: 340,  y: 860 }, { x: 420,  y: 890 },
  { x: 540,  y: 890 }, { x: 680,  y: 880 }, { x: 820,  y: 870 },
  { x: 940,  y: 860 }, { x: 1050, y: 840 }, { x: 1130, y: 800 }, { x: 1180, y: 750 },
  { x: 1200, y: 820 }, { x: 1210, y: 900 }, { x: 1190, y: 980 },
  { x: 1130, y: 1030 }, { x: 1040, y: 1050 },
  { x: 950,  y: 1040 }, { x: 870,  y: 1010 }, { x: 820,  y: 940 },
  { x: 810,  y: 860 },
  { x: 820,  y: 500 }, { x: 860,  y: 420 }, { x: 900,  y: 400 },
];

const ROAD_WIDTH   = 80;
const TRACK_LAPS   = 3; // default, overridden by room settings
const WORLD_BOUNDS = { x: 200, y: 180, w: 1100, h: 950 };

const PICKUP_SPOTS = [
  { x: 1000, y: 400 }, { x: 750, y: 720 }, { x: 520, y: 545 },
  { x: 660, y: 310 },  { x: 350, y: 720 }, { x: 700, y: 880 },
  { x: 1100, y: 1040 },{ x: 840, y: 870 },
];

// Precomputed segment lengths
let _segLengths = [], _totalLength = 0;

function initTrack() {
  _segLengths = [];
  _totalLength = 0;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    _segLengths.push(d);
    _totalLength += d;
  }
}

function trackProgress(wpIndex, t) {
  let dist = 0;
  for (let i = 0; i < wpIndex; i++) dist += _segLengths[i];
  dist += t * _segLengths[wpIndex];
  return dist / _totalLength;
}

function nearestWaypoint(x, y) {
  let best = { index: 0, t: 0, dist: Infinity, progress: 0 };
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(x - px, y - py);
    if (d < best.dist) best = { index: i, t, dist: d, progress: trackProgress(i, t) };
  }
  return best;
}

function positionAtProgress(prog) {
  let dist = prog * _totalLength;
  const n = TRACK_WAYPOINTS.length;
  for (let i = 0; i < n; i++) {
    if (dist <= _segLengths[i]) {
      const t = dist / _segLengths[i];
      const a = TRACK_WAYPOINTS[i], b = TRACK_WAYPOINTS[(i + 1) % n];
      return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    dist -= _segLengths[i];
  }
  return { ...TRACK_WAYPOINTS[0], angle: 0 };
}

// Grid start positions
const START_OFFSETS = [
  { progress: 0.98, lane:  0 }, { progress: 0.97, lane:  1 },
  { progress: 0.96, lane: -1 }, { progress: 0.95, lane:  2 },
  { progress: 0.94, lane: -2 }, { progress: 0.93, lane:  0 },
];

function getStartPosition(index) {
  const sp  = START_OFFSETS[index % START_OFFSETS.length];
  const pos = positionAtProgress(sp.progress);
  const perp = pos.angle + Math.PI / 2;
  return {
    x: pos.x + Math.cos(perp) * sp.lane * 28,
    y: pos.y + Math.sin(perp) * sp.lane * 28,
    angle: pos.angle,
    progress: sp.progress,
  };
}

// Update a car's lap counter from its track progress
function updateCarProgress(car) {
  const nearest = nearestWaypoint(car.x, car.y);
  const newProg = nearest.progress;
  const prev    = car.lastProgress;

  if (prev > 0.85 && newProg < 0.15) {
    car.lap++;
  }

  car.lastProgress = newProg;
  car.progress     = newProg;
}
