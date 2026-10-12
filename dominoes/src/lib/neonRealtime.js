// Shared polling connection: one bounded request per tab, not per subscription.
// Snapshots use RLS. Spectators receive masked hands from watch_room.
export function createRealtime(rpc, { interval = 900, retryMax = 10000 } = {}) {
  const channels = new Set()
  const client = crypto.randomUUID()
  let timer = null, busy = false, failures = 0, stopped = false
  const report = (callback, ...args) => { try { callback?.(...args) } catch (e) { console.error('[live update]', e) } }
  function wake() {
    if (stopped || busy) return
    clearTimeout(timer)
    timer = setTimeout(poll, 0)
  }
  async function poll() {
    if (busy || stopped) return
    busy = true
    const active = [...channels].filter(c => !c.closed)
    const subscriptions = [], presence = [], jobs = []
    for (const c of active) {
      if (c.handlers.some(h => h.kind === 'presence')) subscriptions.push({ kind: 'presence', channel: c.name })
      if (c.tracked) presence.push({ channel: c.name, key: c.key, meta: c.tracked })
      for (const h of c.handlers.filter(h => h.kind === 'postgres_changes')) {
        const filter = h.filter.filter?.match(/^(id|room_id|tournament_id|from_user|to_user)=eq\.(.+)$/)
        if (h.filter.filter && !filter) { report(c.callback, 'CHANNEL_ERROR'); continue }
        const id = String(jobs.length)
        jobs.push({ c, h, id })
        subscriptions.push({ kind: 'table', id, table: h.filter.table, ...(filter ? { column: filter[1], value: filter[2] } : {}), watch: c.name.startsWith('watch-data-') })
      }
    }
    try {
      const { data, error } = await rpc('live_sync', { p_client: client, p_subscriptions: subscriptions, p_presence: presence })
      if (error) throw error
      failures = 0
      for (const { c, h, id } of jobs) {
        if (c.closed) continue
        const rows = data.snapshots[id] || []
        const next = new Map(rows.map(row => [String(row.id), row]))
        const emit = (eventType, row, old) => {
          if (h.filter.event === '*' || h.filter.event === eventType) report(h.callback, { eventType, new: row, old, schema: 'public', table: h.filter.table })
        }
        if (h.rows) {
          for (const [key, row] of next) {
            const old = h.rows.get(key)
            if (!old) emit('INSERT', row, {})
            else if (JSON.stringify(row) !== JSON.stringify(old)) emit('UPDATE', row, old)
          }
          for (const [key, old] of h.rows) if (!next.has(key)) emit('DELETE', {}, old)
        } else if (['domino_rooms', 'domino_players', 'board', 'queue'].includes(h.filter.table)) {
          // Close the gap between the page's first fetch and this subscription.
          // Event-only listeners must not replay old passes or placements.
          const initial = h.filter.table === 'queue' && !h.filter.filter ? rows.slice(0, 1) : rows
          for (const row of initial) emit('UPDATE', row, {})
          if (!rows.length && h.filter.table === 'queue') emit('UPDATE', {}, {})
        }
        h.rows = next
      }
      for (const c of active) {
        if (c.closed) continue
        const state = data.presence[c.name] || {}
        if (!c.subscribed || JSON.stringify(c.presence) !== JSON.stringify(state)) {
          c.presence = state
          c.handlers.filter(h => h.kind === 'presence').forEach(h => report(h.callback))
        }
        if (!c.subscribed) {
          c.subscribed = true
          report(c.callback, 'SUBSCRIBED')
        }
      }
    } catch (e) {
      failures++
      for (const c of active) { c.subscribed = false; report(c.callback, 'CHANNEL_ERROR', e) }
    } finally {
      busy = false
      if (!stopped && channels.size) timer = setTimeout(poll, failures ? Math.min(retryMax, 1000 * 2 ** (failures - 1)) : interval)
    }
  }
  function channel(name, options = {}) {
    const c = {
      name, key: options.config?.presence?.key || client, handlers: [], closed: false, tracked: null, presence: {}, subscribed: false,
      on(kind, filter, callback) { c.handlers.push({ kind, filter, callback, rows: null }); return c },
      subscribe(callback) { c.callback = callback; channels.add(c); wake(); return c },
      presenceState() { return c.presence },
      async track(meta) { c.tracked = meta; wake(); return 'ok' },
      async untrack() { c.tracked = null; wake(); return 'ok' },
      async unsubscribe() { c.closed = true; c.tracked = null; channels.delete(c); wake(); return 'ok' },
    }
    return c
  }
  return { channel, removeChannel: c => c.unsubscribe(), removeAllChannels: () => Promise.all([...channels].map(c => c.unsubscribe())),
    // Test harness teardown; application channels stop themselves on unmount.
    close() { stopped = true; clearTimeout(timer); channels.clear() },
  }
}
