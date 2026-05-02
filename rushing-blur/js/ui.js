// ══════════════════════════════════════════════════
// RUSHING BLUR — UI LAYER
// Handles all screens, lobbies, car select, results
// ══════════════════════════════════════════════════

const UI = (() => {

  let _selectedCarId = null;
  let _localPlayerId = null;
  let _playerName    = '';
  let _isHost        = false;
  let _roomLaps      = CONFIG.DEFAULT_LAPS;
  let _roomId        = null;
  let _lobbyPollInterval = null;

  // ════════════════════════════════════
  // INIT
  // ════════════════════════════════════

  function init() {
    _localPlayerId = getOrCreatePlayerId();

    // Intro
    document.getElementById('btn-play').addEventListener('click', () => showScreen('lobby-setup'));
    document.getElementById('btn-leaderboard').addEventListener('click', () => { showScreen('leaderboard'); _loadLeaderboard(); });

    // Lobby setup
    document.getElementById('btn-back-from-setup').addEventListener('click', () => showScreen('intro'));
    document.getElementById('btn-create-room').addEventListener('click', _onCreateRoom);
    document.getElementById('btn-join-room').addEventListener('click', _onJoinRoom);
    document.getElementById('input-room-code').addEventListener('keydown', e => { if (e.key === 'Enter') _onJoinRoom(); });

    // Prefill saved name
    const saved = getSavedName();
    if (saved) document.getElementById('input-name').value = saved;

    // Car select
    document.getElementById('btn-back-from-cars').addEventListener('click', () => showScreen('lobby-setup'));
    document.getElementById('btn-confirm-car').addEventListener('click', _onConfirmCar);

    // Race lobby
    document.getElementById('btn-start-race').addEventListener('click', _onStartRace);
    document.getElementById('btn-leave-lobby').addEventListener('click', _onLeave);

    // Lap options (host only)
    document.querySelectorAll('#laps-options .opt').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('#laps-options .opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        _roomLaps = parseInt(opt.dataset.laps);
        if (_isHost) Network.updateRoomLaps(_roomLaps);
      });
    });

    // Results
    document.getElementById('btn-play-again').addEventListener('click', _onPlayAgain);
    document.getElementById('btn-back-menu').addEventListener('click', () => { stopGameLoop(); Network.leaveRoom(); showScreen('intro'); });

    // Leaderboard
    document.getElementById('btn-back-from-lb').addEventListener('click', () => showScreen('intro'));

    // Room state changes
    Network.on('onRoomStateChange', _onRoomStateChanged);
    Network.on('onPlayerJoined',    _refreshLobbyPlayers);
    Network.on('onPlayerLeft',      _refreshLobbyPlayers);
  }

  // ════════════════════════════════════
  // SCREEN MANAGEMENT
  // ════════════════════════════════════

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
  }

  // ════════════════════════════════════
  // LOBBY SETUP
  // ════════════════════════════════════

  function _getValidName() {
    const name = document.getElementById('input-name').value.trim();
    if (!name) { _showSetupMsg('Enter your name first', 'error'); return null; }
    return name;
  }

  async function _onCreateRoom() {
    const name = _getValidName();
    if (!name) return;
    saveName(name);
    _playerName = name;
    _isHost = true;

    _setSetupLoading(true);
    try {
      // Go to car select first, then create room after car picked
      showScreen('car-select');
      _buildCarSelect();
    } catch (e) {
      _showSetupMsg(e.message, 'error');
    } finally {
      _setSetupLoading(false);
    }
  }

  async function _onJoinRoom() {
    const name = _getValidName();
    if (!name) return;
    const code = document.getElementById('input-room-code').value.trim().toUpperCase();
    if (code.length !== 6) { _showSetupMsg('Enter a 6-character room code', 'error'); return; }

    saveName(name);
    _playerName = name;
    _isHost = false;

    _setSetupLoading(true);
    try {
      // Car select, then join room
      showScreen('car-select');
      _buildCarSelect(code); // pass code along
    } catch (e) {
      _showSetupMsg(e.message, 'error');
    } finally {
      _setSetupLoading(false);
    }
  }

  function _showSetupMsg(msg, type = 'info') {
    const el = document.getElementById('setup-msg');
    el.textContent = msg;
    el.className   = 'setup-msg ' + type;
    el.classList.remove('hidden');
  }

  function _setSetupLoading(on) {
    document.getElementById('btn-create-room').disabled = on;
    document.getElementById('btn-join-room').disabled   = on;
  }

  // ════════════════════════════════════
  // CAR SELECT
  // ════════════════════════════════════

  function _buildCarSelect(joinCode = null) {
    // Store joinCode for after car selection
    _buildCarSelect._joinCode = joinCode;

    const grid = document.getElementById('car-grid');
    grid.innerHTML = '';

    CARS.forEach(car => {
      const card = document.createElement('div');
      card.className  = 'car-card';
      card.dataset.id = car.id;

      // Preview canvas
      const wrap = document.createElement('div');
      wrap.className = 'car-canvas-wrap';
      const cv   = document.createElement('canvas');
      cv.width = 140; cv.height = 80;
      const pctx = cv.getContext('2d');
      pctx.fillStyle = '#12121a';
      pctx.fillRect(0, 0, 140, 80);
      pctx.fillStyle = '#2a2a2a';
      pctx.fillRect(0, 28, 140, 30);
      pctx.strokeStyle = 'rgba(212,255,0,0.15)';
      pctx.lineWidth = 1;
      pctx.setLineDash([12, 10]);
      pctx.beginPath(); pctx.moveTo(0, 43); pctx.lineTo(140, 43); pctx.stroke();
      pctx.setLineDash([]);
      drawCarShape(pctx, car, 70, 43, 0, 1.1);
      wrap.appendChild(cv);

      const nameEl = document.createElement('div');
      nameEl.className   = 'car-card-name';
      nameEl.textContent = car.name;

      const typeEl = document.createElement('div');
      typeEl.className   = 'car-card-type';
      typeEl.textContent = car.type;

      // Mini stat bars
      const miniStats = document.createElement('div');
      miniStats.className = 'car-card-mini-stats';
      [['speed','#d4ff00'],['handling','#00aaff'],['armour','#ff4400']].forEach(([k, col]) => {
        const bar = document.createElement('div'); bar.className = 'mini-bar';
        const fill = document.createElement('div'); fill.className = 'mini-bar-fill';
        fill.style.cssText = `width:${car.stats[k]*10}%;background:${col}`;
        bar.appendChild(fill); miniStats.appendChild(bar);
      });

      card.append(wrap, nameEl, typeEl, miniStats);
      card.addEventListener('click', () => _selectCar(car.id));
      grid.appendChild(card);
    });

    _selectCar(CARS[0].id);
  }

  function _selectCar(carId) {
    _selectedCarId = carId;
    const car = CARS.find(c => c.id === carId);
    if (!car) return;

    document.querySelectorAll('.car-card').forEach(c => c.classList.toggle('selected', c.dataset.id === carId));
    document.getElementById('detail-name').textContent = car.name;
    document.getElementById('detail-type').textContent = car.type;
    document.getElementById('detail-desc').textContent = car.desc;

    const statsEl = document.getElementById('detail-stats');
    statsEl.innerHTML = '';
    [
      { key: 'speed',        label: 'Speed',        color: '#d4ff00' },
      { key: 'handling',     label: 'Handling',     color: '#00aaff' },
      { key: 'armour',       label: 'Armour',       color: '#00ff88' },
      { key: 'boost',        label: 'Boost',        color: '#ff00aa' },
      { key: 'acceleration', label: 'Acceleration', color: '#ff8800' },
    ].forEach(({ key, label, color }) => {
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <div class="stat-label-row">
          <span class="stat-name">${label}</span>
          <span class="stat-val">${car.stats[key]}/10</span>
        </div>
        <div class="stat-bar-bg">
          <div class="stat-bar-fill" style="width:0%;background:${color}"></div>
        </div>`;
      statsEl.appendChild(row);
      requestAnimationFrame(() => { row.querySelector('.stat-bar-fill').style.width = (car.stats[key] * 10) + '%'; });
    });
  }

  async function _onConfirmCar() {
    if (!_selectedCarId) return;
    const btn = document.getElementById('btn-confirm-car');
    btn.disabled = true;
    btn.textContent = 'Connecting…';

    try {
      const joinCode = _buildCarSelect._joinCode;

      if (_isHost) {
        const { code } = await Network.createRoom(_localPlayerId, _playerName, _selectedCarId, _roomLaps);
        _roomId = Network.roomId;
        await _enterLobby(code, true);
      } else {
        const { laps } = await Network.joinRoom(joinCode, _localPlayerId, _playerName, _selectedCarId);
        _roomId = Network.roomId;
        _roomLaps = laps;
        await _enterLobby(joinCode, false);
      }
    } catch (e) {
      showToast('Error: ' + e.message);
      showScreen('lobby-setup');
    } finally {
      btn.disabled = false;
      btn.textContent = 'CONFIRM & ENTER LOBBY';
    }
  }

  // ════════════════════════════════════
  // RACE LOBBY
  // ════════════════════════════════════

  async function _enterLobby(code, isHost) {
    _isHost = isHost;
    document.getElementById('lobby-code').textContent = code;
    document.getElementById('lobby-settings-host').style.display = isHost ? 'block' : 'none';
    document.getElementById('btn-start-race').classList.toggle('hidden', !isHost);
    document.getElementById('lobby-hint').textContent = isHost
      ? 'Share the code above — start when everyone is in.'
      : 'Waiting for host to start the race…';

    showScreen('race-lobby');
    await _refreshLobbyPlayers();

    // Poll lobby every 3s as fallback for DB changes
    _lobbyPollInterval = setInterval(_refreshLobbyPlayers, 3000);
  }

  async function _refreshLobbyPlayers() {
    if (!Network.roomId) return;
    const players = await Network.fetchRoomPlayers(Network.roomId);
    const grid    = document.getElementById('lobby-players-grid');
    grid.innerHTML = '';

    players.forEach((p, i) => {
      const carDef = CARS.find(c => c.id === p.car_id) || CARS[4];
      const isMe   = p.player_id === _localPlayerId;
      const slot   = document.createElement('div');
      slot.className = 'lobby-player-slot' + (isMe ? ' is-me' : '');

      // Mini car preview
      const cv  = document.createElement('canvas');
      cv.width  = 60; cv.height = 36;
      const pct = cv.getContext('2d');
      pct.fillStyle = '#1c1c2e'; pct.fillRect(0, 0, 60, 36);
      drawCarShape(pct, carDef, 30, 18, 0, 0.8);

      slot.innerHTML = `
        <div class="lps-rank">#${i+1}</div>
        <div class="lps-car"></div>
        <div class="lps-info">
          <div class="lps-name" style="color:${carDef.color}">${p.name}${isMe ? ' (you)' : ''}</div>
          <div class="lps-car-name">${carDef.name} · ${carDef.type}</div>
          ${p.is_host ? '<div class="lps-host">HOST</div>' : ''}
        </div>`;
      slot.querySelector('.lps-car').appendChild(cv);
      grid.appendChild(slot);
    });

    // Update player count hint
    if (_isHost) {
      const count = players.length;
      document.getElementById('lobby-hint').textContent =
        `${count} racer${count !== 1 ? 's' : ''} in lobby — start when ready.`;
    }
  }

  async function _onStartRace() {
    if (!_isHost) return;
    clearInterval(_lobbyPollInterval);
    document.getElementById('btn-start-race').disabled = true;

    // Set room to countdown in DB — all clients will receive the update
    await Network.startRace(_roomLaps);
  }

  function _onRoomStateChanged(room) {
    if (room.state === 'countdown' || room.state === 'racing') {
      clearInterval(_lobbyPollInterval);
      _launchGame(room);
    }
  }

  async function _launchGame(room) {
    showScreen('game');
    const players = await Network.fetchRoomPlayers(room.id);
    initGame(
      { playerId: _localPlayerId, name: _playerName, carId: _selectedCarId, isHost: _isHost },
      room,
      players,
    );
    startGameLoop();
  }

  async function _onLeave() {
    clearInterval(_lobbyPollInterval);
    stopGameLoop();
    await Network.leaveRoom();
    showScreen('intro');
  }

  // ════════════════════════════════════
  // RESULTS SCREEN
  // ════════════════════════════════════

  function showResults(state) {
    stopGameLoop();
    showScreen('results');

    const all = Object.values(state.cars)
      .filter(c => c)
      .map(car => ({
        name:     car.name,
        carId:    car.carId,
        carDef:   car.carDef || CARS.find(c2 => c2.id === car.carId) || CARS[4],
        time:     car.finishTime || state.raceElapsed,
        finished: car.finished,
        isLocal:  car.isLocal,
      }))
      .sort((a, b) => a.time - b.time);

    const podium = document.getElementById('podium');
    podium.innerHTML = '';
    const top3      = all.slice(0, 3);
    const podOrder  = [top3[1], top3[0], top3[2]].filter(Boolean);
    const podClass  = ['p2','p1','p3'];
    const podLabel  = ['2ND','1ST','3RD'];

    podOrder.forEach((entry, i) => {
      const div = document.createElement('div');
      div.className = `podium-entry ${podClass[i]}${entry.isLocal ? ' is-local' : ''}`;
      div.innerHTML = `
        <div class="podium-pos">${podLabel[i]}</div>
        <div class="podium-name" style="color:${entry.carDef.color}">${entry.name}</div>
        <div class="podium-car">${entry.carDef.name}</div>
        <div class="podium-time">${formatTime(entry.time)}</div>`;
      podium.appendChild(div);
    });

    const statsEl = document.getElementById('results-stats');
    const bestLap = state.bestLap < Infinity ? formatTime(state.bestLap) : '—';
    statsEl.innerHTML = `Best lap: <span>${bestLap}</span> &nbsp;·&nbsp; Race time: <span>${formatTime(state.raceElapsed)}</span> &nbsp;·&nbsp; Laps: <span>${state.totalLaps}</span>`;
  }

  async function _onPlayAgain() {
    // Rejoin same room flow — send back to car select
    showScreen('car-select');
    _buildCarSelect();
  }

  // ════════════════════════════════════
  // LEADERBOARD
  // ════════════════════════════════════

  async function _loadLeaderboard() {
    const el = document.getElementById('lb-list');
    el.innerHTML = '<div class="lb-loading">Loading…</div>';

    try {
      const rows = await Network.fetchLeaderboard(20);
      if (!rows.length) {
        el.innerHTML = '<div class="lb-empty">No times yet — be the first to race!</div>';
        return;
      }
      el.innerHTML = rows.map((row, i) => {
        const carDef = CARS.find(c => c.id === row.car_id) || CARS[4];
        const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        return `<div class="lb-row">
          <span class="lb-rank ${rankClass}">${i + 1}</span>
          <div class="lb-info">
            <div class="lb-name">${row.player_name}</div>
            <div class="lb-car" style="color:${carDef.color}">${carDef.name} · ${row.laps} laps</div>
          </div>
          <span class="lb-time">${formatTime(row.race_time)}</span>
        </div>`;
      }).join('');
    } catch (e) {
      el.innerHTML = '<div class="lb-empty">Could not load leaderboard.</div>';
    }
  }

  return { init, showScreen, showResults };
})();

// ── Boot ──
window.addEventListener('DOMContentLoaded', () => UI.init());
