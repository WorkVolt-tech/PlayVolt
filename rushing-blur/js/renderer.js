// ══════════════════════════════════════════════════
// RUSHING BLUR — RENDERER v9 (Three.js)
// Same public API: initRenderer(), renderFrame(state), resizeCanvas()
// Reads state.localCar, state.cars, state.pickups, state.mines,
// state.projectiles, state.particles — all 2D world coords (x,y,angle)
// Maps them into a 3D scene: world x→x, world y→z, up=Y
// ══════════════════════════════════════════════════

// Three.js loaded globally via script tag in index.html
// All CARS, TRACK_WAYPOINTS, ROAD_HALF, WORLD_BOUNDS etc. are global

let _renderer, _scene, _camera, _miniCanvas, _miniCtx;
let _W = 0, _H = 0;
let _initialized = false;

// World scale: game world is ~4000 units wide, Three.js scene in same units
// No scaling needed — just swap y↔z (game y is depth, Three z is depth)
const W2T = (x, y) => ({ x: x, z: y }); // world → three (y becomes z)

// Camera config
const CAM3 = {
  behindDist: 300,   // units behind car
  height:     180,   // units above road
  lookAhead:  200,   // look-at point ahead of car
  lerpPos:    0.10,
  lerpLook:   0.12,
  shake:      0,
};

// Persistent Three.js objects
let _carMeshes     = {};   // keyed by car.id
let _pickupMeshes  = {};   // keyed by pickup.id
let _mineMeshes    = {};   // keyed by mine.id
let _projMeshes    = {};   // keyed by proj.id
let _camPos        = null;
let _camLook       = null;
let _trackBuilt    = false;

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
function initRenderer() {
  _miniCanvas = document.getElementById('minimap-canvas');
  _miniCtx    = _miniCanvas.getContext('2d');

  // Create Three.js renderer into the existing #screen-game div
  // Replace the 2D canvas with Three's canvas
  const old = document.getElementById('game-canvas');
  const container = old.parentElement;
  old.remove();

  _renderer = new THREE.WebGLRenderer({ antialias: true });
  _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  _renderer.shadowMap.enabled = true;
  _renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  _renderer.domElement.id = 'game-canvas';
  _renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  container.insertBefore(_renderer.domElement, container.firstChild);

  _W = window.innerWidth;
  _H = window.innerHeight;
  _renderer.setSize(_W, _H);

  // Scene
  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(0x05011c);
  _scene.fog = new THREE.FogExp2(0x05011c, 0.0008);

  // Camera
  _camera = new THREE.PerspectiveCamera(60, _W / _H, 1, 8000);
  _camPos  = new THREE.Vector3(2000, 500, 4200);
  _camLook = new THREE.Vector3(2000, 0, 3600);
  _camera.position.copy(_camPos);
  _camera.lookAt(_camLook);

  // Lights
  _scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(1000, 2000, 1000);
  sun.castShadow = true;
  sun.shadow.mapSize.width  = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 8000;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -3000;
  sun.shadow.camera.right = sun.shadow.camera.top  =  3000;
  _scene.add(sun);
  _scene.add(new THREE.HemisphereLight(0x220a44, 0x0a0520, 0.5));

  // Ground plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0x0e0820, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -2;
  ground.receiveShadow = true;
  _scene.add(ground);

  _buildTrack();
  _buildTrackLights();

  window.addEventListener('resize', resizeCanvas);
  _initialized = true;
}

function resizeCanvas() {
  _W = window.innerWidth;
  _H = window.innerHeight;
  if (_renderer) _renderer.setSize(_W, _H);
  if (_camera)   { _camera.aspect = _W / _H; _camera.updateProjectionMatrix(); }
}

// ════════════════════════════════════════════
// TRACK MESH
// Uses TRACK_WAYPOINTS and ROAD_HALF from track.js
// game coords: x=x, y=depth → Three: x=x, z=y
// ════════════════════════════════════════════
function _buildTrack() {
  if (_trackBuilt) return;
  _trackBuilt = true;

  const n    = TRACK_WAYPOINTS.length;
  const verts = [], uvs = [], idx = [];
  const kVerts = [], kColors = [], kIdx = [];

  // Road texture via canvas
  const texCv = document.createElement('canvas');
  texCv.width = 256; texCv.height = 512;
  const tc = texCv.getContext('2d');
  tc.fillStyle = '#1e1e2e'; tc.fillRect(0, 0, 256, 512);
  // Centre dashes
  tc.fillStyle = 'rgba(212,255,0,0.75)';
  for (let y = 0; y < 512; y += 80) tc.fillRect(116, y, 24, 44);
  // Edge lines
  tc.fillStyle = 'rgba(255,255,255,0.2)';
  tc.fillRect(2, 0, 5, 512); tc.fillRect(249, 0, 5, 512);
  const roadTex = new THREE.CanvasTexture(texCv);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;

  for (let i = 0; i <= n; i++) {
    const wp  = TRACK_WAYPOINTS[i % n];
    const wpN = TRACK_WAYPOINTS[(i + 1) % n];
    const fx  = wpN.x - wp.x, fy = wpN.y - wp.y;
    const fl  = Math.hypot(fx, fy) || 1;
    const nx  = -fy / fl, ny = fx / fl; // road normal in game coords

    // In Three.js: game x→x, game y→z
    const lx = wp.x + nx * ROAD_HALF, lz = wp.y + ny * ROAD_HALF;
    const rx = wp.x - nx * ROAD_HALF, rz = wp.y - ny * ROAD_HALF;

    verts.push(lx, 0, lz,  rx, 0, rz);
    uvs.push(0, (i / n) * 60,  1, (i / n) * 60);

    if (i < n) {
      const b = i * 2;
      idx.push(b, b+1, b+2,  b+1, b+3, b+2);
    }

    // Kerb strips
    const KW   = ROAD_HALF * 0.07;
    const band = Math.floor(i / 3) % 2;
    const r = band ? 0.85 : 1, g = band ? 0.08 : 1, bl = band ? 0.08 : 1;
    const lkx = wp.x + nx * (ROAD_HALF + KW), lkz = wp.y + ny * (ROAD_HALF + KW);
    const rkx = wp.x - nx * (ROAD_HALF + KW), rkz = wp.y - ny * (ROAD_HALF + KW);

    kVerts.push(lx, 1, lz,  lkx, 1, lkz,  rx, 1, rz,  rkx, 1, rkz);
    kColors.push(r,g,bl, r,g,bl, r,g,bl, r,g,bl);
    if (i < n) {
      const b = i * 4;
      kIdx.push(b, b+1, b+4,  b+1, b+5, b+4);       // left kerb
      kIdx.push(b+2, b+3, b+6,  b+3, b+7, b+6);     // right kerb
    }
  }

  // Road mesh
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: roadTex, roughness: 0.85, metalness: 0.05,
  }));
  road.receiveShadow = true;
  _scene.add(road);

  // Kerb mesh
  const kGeo = new THREE.BufferGeometry();
  kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kVerts, 3));
  kGeo.setAttribute('color',    new THREE.Float32BufferAttribute(kColors, 3));
  kGeo.setIndex(kIdx);
  kGeo.computeVertexNormals();
  _scene.add(new THREE.Mesh(kGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })));

  // Start/finish line
  const sfWp  = TRACK_WAYPOINTS[0], sfWpN = TRACK_WAYPOINTS[1];
  const sfFx  = sfWpN.x - sfWp.x, sfFy = sfWpN.y - sfWp.y;
  const sfLen = Math.hypot(sfFx, sfFy) || 1;
  const sfCv  = document.createElement('canvas');
  sfCv.width = 256; sfCv.height = 64;
  const sfc = sfCv.getContext('2d');
  for (let c = 0; c < 8; c++) for (let r2 = 0; r2 < 2; r2++) {
    sfc.fillStyle = (c + r2) % 2 === 0 ? '#fff' : '#111';
    sfc.fillRect(c*32, r2*32, 32, 32);
  }
  const sfMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, 120),
    new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(sfCv), side: THREE.DoubleSide })
  );
  sfMesh.rotation.x = -Math.PI / 2;
  sfMesh.position.set(sfWp.x, 2, sfWp.y);
  sfMesh.rotation.z = -Math.atan2(sfFx, sfFy);
  _scene.add(sfMesh);
}

// ════════════════════════════════════════════
// TRACK LIGHTS — glowing poles along sides
// ════════════════════════════════════════════
function _buildTrackLights() {
  const n      = TRACK_WAYPOINTS.length;
  const COLORS = [0xd4ff00, 0xff4400, 0x00aaff, 0xff00aa];
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x333344 });

  for (let i = 0; i < n; i += 3) {
    const wp  = TRACK_WAYPOINTS[i];
    const wpN = TRACK_WAYPOINTS[(i + 1) % n];
    const fx  = wpN.x - wp.x, fy = wpN.y - wp.y;
    const fl  = Math.hypot(fx, fy) || 1;
    const nx  = -fy / fl, ny = fx / fl;
    const col = COLORS[Math.floor(i / 3) % COLORS.length];
    const glowMat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 });

    for (const side of [-1, 1]) {
      const px = wp.x + nx * (ROAD_HALF + 60) * side;
      const pz = wp.y + ny * (ROAD_HALF + 60) * side;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 120, 5), poleMat);
      pole.position.set(px, 60, pz);
      _scene.add(pole);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(14, 6, 6), glowMat);
      glow.position.set(px, 130, pz);
      _scene.add(glow);
    }
  }
}

// ════════════════════════════════════════════
// CAR MESH FACTORY
// ════════════════════════════════════════════
function _makeCarMesh(carDef) {
  const g = new THREE.Group();
  const col1 = parseInt(carDef.color.replace('#',''), 16);
  const col2 = parseInt(carDef.color2.replace('#',''), 16);
  const bMat = new THREE.MeshStandardMaterial({ color: col2, metalness: 0.6, roughness: 0.3 });
  const sMat = new THREE.MeshStandardMaterial({ color: col1, metalness: 0.4, roughness: 0.3 });
  const dMat = new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.3, roughness: 0.5 });
  const wMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(carDef.bodyW, 22, carDef.bodyH * 1.8), bMat);
  body.position.y = 18; body.castShadow = true; g.add(body);
  // Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(carDef.bodyW * 0.35, 23, carDef.bodyH * 1.82), sMat);
  stripe.position.y = 18; g.add(stripe);
  // Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(carDef.bodyW * 0.7, 18, carDef.bodyH * 0.9), dMat);
  cabin.position.set(0, 38, -carDef.bodyH * 0.05); g.add(cabin);
  // Spoiler
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(carDef.bodyW * 0.85, 4, 20), sMat);
  spoiler.position.set(0, 46, -carDef.bodyH * 0.82); g.add(spoiler);
  // Wheels
  const wGeo = new THREE.CylinderGeometry(14, 14, 10, 10);
  const wPos = [
    [-carDef.bodyW*0.52, 12,  carDef.bodyH*0.55],
    [ carDef.bodyW*0.52, 12,  carDef.bodyH*0.55],
    [-carDef.bodyW*0.52, 12, -carDef.bodyH*0.55],
    [ carDef.bodyW*0.52, 12, -carDef.bodyH*0.55],
  ];
  wPos.forEach(([x,y,z]) => {
    const w = new THREE.Mesh(wGeo, wMat);
    w.rotation.z = Math.PI / 2; w.position.set(x,y,z); w.castShadow = true; g.add(w);
  });
  // Headlights
  const hlMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 3 });
  [[-carDef.bodyW*0.3, 22, carDef.bodyH*0.91],[carDef.bodyW*0.3, 22, carDef.bodyH*0.91]].forEach(([x,y,z]) => {
    g.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(6, 6, 6), hlMat), { position: new THREE.Vector3(x,y,z) }));
  });
  // Tail lights
  const tlMat = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 3 });
  [[-carDef.bodyW*0.3, 22, -carDef.bodyH*0.91],[carDef.bodyW*0.3, 22, -carDef.bodyH*0.91]].forEach(([x,y,z]) => {
    g.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(6, 6, 6), tlMat), { position: new THREE.Vector3(x,y,z) }));
  });

  return g;
}

// ════════════════════════════════════════════
// MAIN RENDER — called every frame by game.js
// ════════════════════════════════════════════
function renderFrame(state) {
  if (!_initialized || !_renderer) return;
  const car = state.localCar;
  if (!car) return;

  // Screen shake
  if (state.screenShake > 0) {
    CAM3.shake = Math.max(CAM3.shake, state.screenShake * 3);
    state.screenShake = Math.max(0, state.screenShake - 0.8);
  }
  if (CAM3.shake > 0) CAM3.shake = Math.max(0, CAM3.shake - 1.5);

  _syncCars(state);
  _syncPickups(state);
  _syncMines(state);
  _syncProjectiles(state);
  _updateCamera(car);

  _renderer.render(_scene, _camera);

  // 2D overlays
  _drawMinimap(state);
  _updateDamageFlash(state);
  _updateLivePositions(state);
}

// ── Sync car meshes to game state ──
function _syncCars(state) {
  for (const car of Object.values(state.cars)) {
    if (!car || car.dead) {
      if (_carMeshes[car?.id]) { _carMeshes[car.id].visible = false; }
      continue;
    }

    if (!_carMeshes[car.id]) {
      const mesh = _makeCarMesh(car.carDef || CARS[4]);
      _scene.add(mesh);
      _carMeshes[car.id] = mesh;
    }

    const mesh = _carMeshes[car.id];
    mesh.visible = true;

    // Position: game x→Three x, game y→Three z
    mesh.position.set(car.x, 0, car.y);

    // Rotation: game angle is CCW from +x axis
    // Three.js: rotate around Y axis, but game angle convention needs -angle
    mesh.rotation.set(0, -car.angle + Math.PI / 2, 0);

    // Lean on drift for local car
    if (car.isLocal) {
      const fX = Math.cos(car.angle), fY = Math.sin(car.angle);
      const lX = -fY, lY = fX;
      const latVel = (car.vx||0)*lX + (car.vy||0)*lY;
      const lean = Math.max(-0.12, Math.min(0.12, latVel * -0.006));
      mesh.rotation.z = lean;
    }

    // Shield glow — toggle emissive on all children
    if (car.shieldTimer > 0) {
      mesh.traverse(c => { if (c.isMesh && c.material) c.material.emissiveIntensity = 1.5; });
    }

    // Name label for remote cars (using a sprite)
    if (!car.isLocal && !mesh._label) {
      mesh._label = _makeLabel(car.name, car.carDef?.color || '#ffffff');
      mesh._label.position.set(0, 80, 0);
      mesh.add(mesh._label);
    }
  }
}

// ── Floating text label sprite ──
function _makeLabel(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.font = 'bold 28px Nunito,sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = color; c.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(200, 50, 1);
  return sprite;
}

// ── Sync pickup meshes ──
const _puGeo = new THREE.BoxGeometry(40, 40, 40);
function _syncPickups(state) {
  const activeIds = new Set();
  for (const pu of (state.pickups || [])) {
    if (!pu.active) {
      if (_pickupMeshes[pu.id]) _pickupMeshes[pu.id].visible = false;
      continue;
    }
    activeIds.add(pu.id);
    if (!_pickupMeshes[pu.id]) {
      const wt  = WEAPON_TYPES[pu.weapon];
      const col = wt ? parseInt(wt.color.replace('#',''),16) : 0xffffff;
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(_puGeo, mat);
      _scene.add(mesh);
      _pickupMeshes[pu.id] = mesh;
    }
    const mesh = _pickupMeshes[pu.id];
    mesh.visible = true;
    mesh.position.set(pu.x, 50 + Math.sin(pu.pulse || 0) * 10, pu.y);
    mesh.rotation.y += 0.04;
  }
}

// ── Sync mine meshes ──
const _mineGeo = new THREE.SphereGeometry(18, 8, 8);
function _syncMines(state) {
  const seen = new Set();
  for (const m of (state.mines || [])) {
    seen.add(m.id);
    if (!_mineMeshes[m.id]) {
      const mat  = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.5 });
      const mesh = new THREE.Mesh(_mineGeo, mat);
      _scene.add(mesh);
      _mineMeshes[m.id] = mesh;
    }
    _mineMeshes[m.id].position.set(m.x, 18, m.y);
    _mineMeshes[m.id].material.emissiveIntensity = m.armed ? 2.5 : 0.5;
  }
  // Remove expired
  for (const id of Object.keys(_mineMeshes)) {
    if (!seen.has(id)) { _scene.remove(_mineMeshes[id]); delete _mineMeshes[id]; }
  }
}

// ── Sync projectile meshes ──
const _projGeo = new THREE.SphereGeometry(10, 6, 6);
function _syncProjectiles(state) {
  const seen = new Set();
  for (const pr of (state.projectiles || [])) {
    seen.add(pr.id);
    if (!_projMeshes[pr.id]) {
      const col = parseInt((pr.color||'#e8ff00').replace('#',''),16);
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 3 });
      const mesh = new THREE.Mesh(_projGeo, mat);
      _scene.add(mesh);
      _projMeshes[pr.id] = mesh;
    }
    _projMeshes[pr.id].position.set(pr.x, 30, pr.y);
  }
  for (const id of Object.keys(_projMeshes)) {
    if (!seen.has(id)) { _scene.remove(_projMeshes[id]); delete _projMeshes[id]; }
  }
}

// ════════════════════════════════════════════
// CAMERA — chase cam behind local car
// ════════════════════════════════════════════
function _updateCamera(car) {
  // Camera sits behind car in the direction it's facing
  const angle = car.angle;
  const bx = car.x - Math.cos(angle) * CAM3.behindDist;
  const bz = car.y - Math.sin(angle) * CAM3.behindDist;

  // Shake offset
  const sx = CAM3.shake > 0 ? (Math.random()-0.5)*CAM3.shake : 0;
  const sz = CAM3.shake > 0 ? (Math.random()-0.5)*CAM3.shake*0.4 : 0;

  const idealPos  = new THREE.Vector3(bx + sx, CAM3.height, bz + sz);
  const lookPt    = new THREE.Vector3(
    car.x + Math.cos(angle) * CAM3.lookAhead,
    40,
    car.y + Math.sin(angle) * CAM3.lookAhead
  );

  _camPos.lerp(idealPos, CAM3.lerpPos);
  _camLook.lerp(lookPt,  CAM3.lerpLook);

  _camera.position.copy(_camPos);
  _camera.lookAt(_camLook);
}

// ════════════════════════════════════════════
// MINIMAP — 2D canvas, same as before
// ════════════════════════════════════════════
function _drawMinimap(state) {
  const mctx = _miniCtx;
  const MW = _miniCanvas.width, MH = _miniCanvas.height, pad = 8;
  mctx.clearRect(0, 0, MW, MH);
  mctx.fillStyle = 'rgba(4,2,12,0.88)';
  mctx.fillRect(0, 0, MW, MH);

  const bx = WORLD_BOUNDS.x, by = WORLD_BOUNDS.y;
  const bw = WORLD_BOUNDS.w, bh = WORLD_BOUNDS.h;
  const toMini = (wx, wy) => ({
    x: pad + ((wx - bx) / bw) * (MW - pad*2),
    y: pad + ((wy - by) / bh) * (MH - pad*2),
  });

  mctx.strokeStyle = '#3a2255'; mctx.lineWidth = 7;
  mctx.lineCap = 'round'; mctx.lineJoin = 'round';
  mctx.beginPath();
  const f0 = toMini(TRACK_WAYPOINTS[0].x, TRACK_WAYPOINTS[0].y);
  mctx.moveTo(f0.x, f0.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  mctx.strokeStyle = '#7755cc'; mctx.lineWidth = 2.5;
  mctx.beginPath(); mctx.moveTo(f0.x, f0.y);
  for (let i = 1; i <= TRACK_WAYPOINTS.length; i++) {
    const wp = TRACK_WAYPOINTS[i % TRACK_WAYPOINTS.length];
    const m  = toMini(wp.x, wp.y);
    mctx.lineTo(m.x, m.y);
  }
  mctx.closePath(); mctx.stroke();

  for (const c of Object.values(state.cars)) {
    if (!c) continue;
    const m = toMini(c.x, c.y);
    mctx.shadowColor = c.isLocal ? '#d4ff00' : (c.carDef?.color || '#fff');
    mctx.shadowBlur  = c.isLocal ? 8 : 4;
    mctx.fillStyle   = c.isLocal ? '#d4ff00' : (c.carDef?.color || '#fff');
    mctx.beginPath(); mctx.arc(m.x, m.y, c.isLocal ? 5 : 3.5, 0, Math.PI*2); mctx.fill();
    mctx.shadowBlur = 0;
  }

  const local = state.localCar;
  if (local) {
    const m = toMini(local.x, local.y);
    const a = local.angle, ts = 6;
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(m.x + Math.cos(a)*ts*2, m.y + Math.sin(a)*ts*2);
    mctx.lineTo(m.x + Math.cos(a+2.5)*ts, m.y + Math.sin(a+2.5)*ts);
    mctx.lineTo(m.x + Math.cos(a-2.5)*ts, m.y + Math.sin(a-2.5)*ts);
    mctx.closePath(); mctx.fill();
  }
}

// ════════════════════════════════════════════
// HUD HELPERS — identical to original
// ════════════════════════════════════════════
function _updateDamageFlash(state) {
  const el = document.getElementById('damage-flash');
  if (!el) return;
  if (state.damageFlash > 0) { state.damageFlash--; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function _updateLivePositions(state) {
  const el = document.getElementById('lp-list');
  if (!el) return;
  const sorted = Object.values(state.cars)
    .filter(c => c)
    .sort((a, b) => raceMetric(b) - raceMetric(a));
  el.innerHTML = sorted.map((c, i) => `
    <div class="lp-row${c.isLocal ? ' lp-me' : ''}">
      <span class="lp-rank">${i+1}</span>
      <span class="lp-name" style="color:${c.carDef?.color||'#fff'}">${c.name||'???'}</span>
      <span class="lp-lap">L${Math.min(c.lap+1, state.totalLaps)}</span>
    </div>`).join('');
}
