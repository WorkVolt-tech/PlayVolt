// Read-only room state for the shared TV/laptop display. Uses the room's display link
// (no seat, no player token). The server sends only public data: no secret until the
// match ends and no guess before its reveal.
import { useCallback, useEffect, useRef, useState } from 'react';
import { callGame } from '../game/api.js';
import { getSupabase } from '../game/auth.js';
import { readTvLink } from './tvLink.js';

const POLL_MS = 2000;
const LIVE_POLL_MS = 6000;

export function useDisplay() {
  const [link] = useState(readTvLink);
  const [game, setGame] = useState(null);
  const [error, setError] = useState(link ? '' : 'This TV link is incomplete. Open “Show on TV” on a phone in the room and use that link.');
  const [clock, setClock] = useState(Date.now());
  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const againRef = useRef(false);
  const liveRef = useRef(false);
  const lastRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!link) return;
    if (busyRef.current) { againRef.current = true; return; }
    busyRef.current = true;
    lastRef.current = Date.now();
    try {
      const next = await callGame('display', { code: link.code, token: link.token });
      offsetRef.current = new Date(next.serverTime || Date.now()).getTime() - Date.now();
      setGame(next);
      setError('');
    } catch (e) {
      if (/not found|expired/i.test(e.message || '')) setError('This room has ended. Start a new room on a phone and open its TV link.');
      else if (/display link/i.test(e.message || '')) setError('This TV link is not valid for the room. Use “Show on TV” again.');
      // Network hiccups: keep showing the last board and retry on the next tick.
    } finally {
      busyRef.current = false;
      if (againRef.current) { againRef.current = false; void refresh(); }
    }
  }, [link]);

  useEffect(() => {
    if (!link) return undefined;
    void refresh();
    const poll = setInterval(() => {
      if (liveRef.current && Date.now() - lastRef.current < LIVE_POLL_MS) return;
      void refresh();
    }, POLL_MS);
    const tick = setInterval(() => setClock(Date.now()), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [link, refresh]);

  // Instant updates on the same content-free room signal the phones use.
  useEffect(() => {
    if (!link) return undefined;
    let cancelled = false, client = null, channel = null;
    getSupabase().then((sb) => {
      if (cancelled) return;
      client = sb;
      channel = sb.channel(`pin-and-spin:${link.code}`)
        .on('broadcast', { event: 'changed' }, () => void refresh())
        .subscribe((status) => { liveRef.current = status === 'SUBSCRIBED'; });
    }).catch(() => {});
    return () => { cancelled = true; liveRef.current = false; if (client && channel) void client.removeChannel(channel); };
  }, [link, refresh]);

  // Refresh right when a timer runs out so the reveal shows immediately.
  const deadline = game?.status === 'playing' ? game?.deadline : null;
  useEffect(() => {
    if (!deadline) return undefined;
    const wait = new Date(deadline).getTime() - (Date.now() + offsetRef.current) + 400;
    if (wait > 2147483647) return undefined;
    const t = setTimeout(() => void refresh(), Math.max(0, wait));
    return () => clearTimeout(t);
  }, [deadline, refresh]);

  return { link, game, error, clock, offset: offsetRef.current };
}
