// ══════════════════════════════════════════════════
// RUSHING BLUR — NETWORK LAYER
// Supabase Realtime for position broadcast (15fps)
// Supabase DB for room state, player list, leaderboard
// ══════════════════════════════════════════════════

const Network = (() => {
  let _channel      = null;  // Realtime broadcast channel
  let _roomId       = null;
  let _roomCode     = null;
  let _localId      = null;  // player_id string
  let _dbRowId      = null;  // UUID of our row in rushing_players
  let _tickTimer    = null;
  let _serverOffset = 0;     // local_perf_now + offset = server_ms (approximation)

  // ── Callbacks set by game.js ──
  const cb = {
    onPlayerJoined:   () => {},
    onPlayerLeft:     () => {},
    onPlayerSnapshot: () => {},
    onRoomStateChange:() => {},
    onPickupConsumed: () => {},
    onWeaponFired:    () => {},
  };

  // ── Server time approximation ──
  function serverNow() { return performance.now() + _serverOffset; }

  // ════════════════════════════════════
  // ROOM MANAGEMENT
  // ════════════════════════════════════

  async function createRoom(hostPlayerId, playerName, carId, laps) {
    const sb   = getSB();
    const code = makeRoomCode();

    // Insert room
    const { data: room, error: re } = await sb
      .from('rushing_rooms')
      .insert({ code, host_id: hostPlayerId, laps, state: 'lobby' })
      .select().single();
    if (re) throw re;

    // Insert local player row
    const carDef = CARS.find(c => c.id === carId);
    const { data: pRow, error: pe } = await sb
      .from('rushing_players')
      .insert({
        room_id: room.id, player_id: hostPlayerId,
        name: playerName, car_id: carId,
        color: carDef?.color || '#aaffcc', is_host: true,
      })
      .select().single();
    if (pe) throw pe;

    _roomId   = room.id;
    _roomCode = code;
    _localId  = hostPlayerId;
    _dbRowId  = pRow.id;

    _subscribeChannel(room.id);
    return { roomId: room.id, code };
  }

  async function joinRoom(code, playerId, playerName, carId) {
    const sb = getSB();
    const { data: room, error: re } = await sb
      .from('rushing_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();
    if (re || !room) throw new Error('Room not found');
    if (room.state !== 'lobby') throw new Error('Race already started');

    // Count existing players
    const { data: existing } = await sb
      .from('rushing_players')
      .select('id')
      .eq('room_id', room.id);
    if ((existing?.length || 0) >= CONFIG.MAX_PLAYERS) throw new Error('Room is full');

    const carDef = CARS.find(c => c.id === carId);
    const { data: pRow, error: pe } = await sb
      .from('rushing_players')
      .insert({
        room_id: room.id, player_id: playerId,
        name: playerName, car_id: carId,
        color: carDef?.color || '#aaffcc', is_host: false,
      })
      .select().single();
    if (pe) throw pe;

    _roomId   = room.id;
    _roomCode = code.toUpperCase();
    _localId  = playerId;
    _dbRowId  = pRow.id;

    _subscribeChannel(room.id);
    return { roomId: room.id, laps: room.laps };
  }

  async function leaveRoom() {
    _stopTick();
    if (_channel) { getSB().removeChannel(_channel); _channel = null; }
    if (_dbRowId) {
      await getSB().from('rushing_players').delete().eq('id', _dbRowId).catch(() => {});
      _dbRowId = null;
    }
    _roomId = _roomCode = _localId = null;
  }

  async function startRace(laps) {
    if (!_roomId) return;
    await getSB().from('rushing_rooms').update({
      state: 'countdown',
      laps,
      started_at: new Date().toISOString(),
    }).eq('id', _roomId);
  }

  // ════════════════════════════════════
  // REALTIME CHANNEL
  // ════════════════════════════════════

  function _subscribeChannel(roomId) {
    const sb = getSB();
    if (_channel) sb.removeChannel(_channel);

    _channel = sb.channel(`rushing:${roomId}`, {
      config: { broadcast: { self: false } },
    });

    // ── Position snapshots from other players ──
    _channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
      if (payload.id === _localId) return;
      cb.onPlayerSnapshot(payload.id, payload, serverNow());
    });

    // ── Weapon fire events ──
    _channel.on('broadcast', { event: 'weapon' }, ({ payload }) => {
      if (payload.id === _localId) return;
      cb.onWeaponFired(payload);
    });

    // ── Pickup consumed ──
    _channel.on('broadcast', { event: 'pickup' }, ({ payload }) => {
      cb.onPickupConsumed(payload.pickupId, payload.weapon, payload.id);
    });

    // ── DB changes: room state ──
    _channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'rushing_rooms', filter: `id=eq.${roomId}`,
    }, ({ new: room }) => {
      cb.onRoomStateChange(room);
    });

    // ── DB changes: players joining / leaving ──
    _channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'rushing_players', filter: `room_id=eq.${roomId}`,
    }, ({ new: player }) => {
      if (player.player_id !== _localId) cb.onPlayerJoined(player);
    });

    _channel.on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'rushing_players', filter: `room_id=eq.${roomId}`,
    }, ({ old: player }) => {
      cb.onPlayerLeft(player.player_id);
    });

    _channel.subscribe((status) => {
      console.log('[Network] channel status:', status);
    });
  }

  // ════════════════════════════════════
  // POSITION BROADCAST (15fps tick)
  // ════════════════════════════════════

  function startBroadcasting(getSnapshotFn) {
    _stopTick();
    _tickTimer = setInterval(() => {
      if (!_channel || !_localId) return;
      const snap = getSnapshotFn();
      if (!snap) return;
      _channel.send({ type: 'broadcast', event: 'pos', payload: { id: _localId, t: serverNow(), ...snap } });

      // Also keep DB row fresh (lap + finish_time) — but only every ~2 seconds to avoid hammering
      Network._dbTickCount = (Network._dbTickCount || 0) + 1;
      if (Network._dbTickCount % 30 === 0) {
        getSB().from('rushing_players').update({
          lap:          snap.lap,
          progress:     snap.progress,
          health:       snap.health,
          weapon:       snap.weapon || null,
          last_seen:    new Date().toISOString(),
        }).eq('id', _dbRowId).catch(() => {});
      }
    }, CONFIG.NETWORK_TICK_MS);
  }

  function _stopTick() {
    if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
  }

  // ── Broadcast weapon fire (for visual replication on other clients) ──
  function broadcastWeapon(type, x, y, angle, vx, vy) {
    if (!_channel) return;
    _channel.send({ type: 'broadcast', event: 'weapon', payload: { id: _localId, type, x, y, angle, vx, vy } });
  }

  // ── Broadcast pickup consumed ──
  function broadcastPickup(pickupId) {
    if (!_channel) return;
    _channel.send({ type: 'broadcast', event: 'pickup', payload: { id: _localId, pickupId } });
  }

  // ── Broadcast finish time ──
  async function submitFinish(finishTime, position) {
    if (!_dbRowId) return;
    await getSB().from('rushing_players').update({ finish_time: finishTime, position }).eq('id', _dbRowId);
  }

  // ════════════════════════════════════
  // LEADERBOARD
  // ════════════════════════════════════

  async function saveToLeaderboard(playerName, carId, raceTime, position, laps) {
    await getSB().from('rushing_leaderboard').insert({
      player_name: playerName, car_id: carId,
      race_time: raceTime, position, laps, room_code: _roomCode,
    });
  }

  async function fetchLeaderboard(limit = 20) {
    const { data } = await getSB()
      .from('rushing_leaderboard')
      .select('*')
      .eq('position', 1)           // only 1st place finishes
      .order('race_time', { ascending: true })
      .limit(limit);
    return data || [];
  }

  // ── Fetch all players currently in a room ──
  async function fetchRoomPlayers(roomId) {
    const { data } = await getSB()
      .from('rushing_players')
      .select('*')
      .eq('room_id', roomId || _roomId)
      .order('joined_at', { ascending: true });
    return data || [];
  }

  async function fetchRoom(roomId) {
    const { data } = await getSB()
      .from('rushing_rooms')
      .select('*')
      .eq('id', roomId || _roomId)
      .single();
    return data;
  }

  // ── Update laps setting (host only) ──
  async function updateRoomLaps(laps) {
    if (!_roomId) return;
    await getSB().from('rushing_rooms').update({ laps }).eq('id', _roomId);
  }

  return {
    // Room
    createRoom, joinRoom, leaveRoom, startRace, updateRoomLaps,
    // Realtime
    startBroadcasting, broadcastWeapon, broadcastPickup, submitFinish,
    // Data
    fetchRoomPlayers, fetchRoom, fetchLeaderboard, saveToLeaderboard,
    // Callbacks (set by game.js)
    on(event, fn) { cb[event] = fn; },
    // Identifiers
    get roomId()   { return _roomId; },
    get roomCode() { return _roomCode; },
    get localId()  { return _localId; },
    serverNow,
  };
})();
