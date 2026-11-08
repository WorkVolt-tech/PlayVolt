// Guest authentication is handled by unguessable player/display capabilities in the
// transactional RPC. Never trust a player ID, timer, score, or host flag from a client.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
const actions = new Set(['create', 'join', 'state', 'ready', 'start', 'guess', 'leave', 'replay', 'display', 'kick']);
// TV pairing (migration 005): a TV shows a 4-letter code; a player in the room types it.
const tvActions = new Set(['tv_start', 'tv_check', 'tv_pair']);
// Leaderboard (migration 006): public, needs no room or session.
// Solo modes (migration 007): signed-in account only, no room or guest session.
const soloActions = new Set(['solo_home', 'solo_start', 'solo_guess', 'solo_get']);
// Story mode (migration 008): signed-in account only; guesses use solo_guess.
const storyActions = new Set(['story_home', 'story_start']);
// Friend invites (migration 011): signed-in account only.
const socialActions: Record<string, string> = { invite_friend: 'invite', my_invites: 'invites', invite_respond: 'invite_respond' };
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: 'Request too large' }, 413);
    const body = JSON.parse(raw);
    const tv = tvActions.has(body.action);
    const board = body.action === 'leaderboard';
    // Achievements (migration 009): the signed-in player's badges.
    const badges = body.action === 'achievements';
    const social = Object.hasOwn(socialActions, body.action);
    // Admin peek (migration 012): the database itself checks the PlayVolt admins list.
    const peek = body.action === 'admin_peek';
    const story = storyActions.has(body.action);
    const solo = soloActions.has(body.action) || story;
    if (!board && !solo && !badges && !social && !peek && (!(actions.has(body.action) || tv) || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token))) {
      return reply({ error: 'Invalid player session' }, 400);
    }
    if (board && !['week', 'all'].includes(body.data?.period)) return reply({ error: 'Choose a leaderboard period' }, 400);
    if (board && !['multi', 'daily', 'clock', 'story', undefined].includes(body.data?.board)) return reply({ error: 'Choose a leaderboard' }, 400);
    if (!['create', 'tv_start', 'tv_check', 'leaderboard', 'achievements'].includes(body.action) && !solo && !social && !peek && (typeof body.code !== 'string' || !/^[A-F0-9]{6}$/i.test(body.code))) {
      return reply({ error: 'Enter the six-character room code' }, 400);
    }
    const data = body.data ?? {};
    if (typeof data !== 'object' || Array.isArray(data)) return reply({ error: 'Invalid request' }, 400);
    if (body.action === 'guess' && (!Array.isArray(data.colors) || data.colors.length !== 4 ||
      // 0-7: games with 4+ players use 8 colors (migration 014); the room itself checks its own count.
      !data.colors.every((c: unknown) => Number.isInteger(c) && Number(c) >= 0 && Number(c) <= 7) ||
      !Number.isInteger(data.attempt) || !Number.isInteger(data.puzzle))) {
      return reply({ error: 'Choose four colors' }, 400);
    }
    if (body.action === 'kick' && (typeof data.playerId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.playerId))) {
      return reply({ error: 'Choose a player to remove' }, 400);
    }
    if ((body.action === 'tv_check' || body.action === 'tv_pair') &&
      (typeof data.pairCode !== 'string' || !/^[A-Z0-9]{4}$/i.test(data.pairCode))) {
      return reply({ error: 'Enter the 4-letter code shown on the TV' }, 400);
    }
    // Solo/story guesses: 4 or 5 balls, colors 0-7 (the game itself checks its own limits).
    if (body.action === 'solo_guess' && (typeof data.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.id) ||
      !Array.isArray(data.colors) || data.colors.length < 4 || data.colors.length > 5 ||
      !data.colors.every((c: unknown) => Number.isInteger(c) && Number(c) >= 0 && Number(c) <= 7) || !Number.isInteger(data.attempt))) {
      return reply({ error: 'Choose a color for every ball' }, 400);
    }
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Validate with Supabase Auth; never accept an account ID from the request body.
    let accountId: string | null = null;
    const authorization = req.headers.get('authorization');
    if (authorization) {
      if (!/^Bearer \S+$/i.test(authorization)) return reply({ error: 'ACCOUNT_REQUIRED: Please sign in again.' }, 401);
      const auth = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
        headers: { apikey: key, Authorization: authorization },
      });
      const user = await auth.json();
      if (!auth.ok || !user.id) return reply({ error: 'ACCOUNT_REQUIRED: Your sign-in expired. Please sign in again.' }, 401);
      accountId = user.id;
    }
    if (peek && !accountId) return reply({ error: 'Not available' }, 401);
    if (social && !accountId) return reply({ error: 'ACCOUNT_REQUIRED: Sign in to invite friends.' }, 401);
    if (badges && !accountId) return reply({ error: 'ACCOUNT_REQUIRED: Sign in to see your achievements.' }, 401);
    if (solo && !accountId) return reply({ error: `ACCOUNT_REQUIRED: Sign in to play ${story ? 'story mode' : 'solo'}.` }, 401);
    const verifiedData = { ...data, _account_id: accountId };
    const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address + key));
    const originHash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    const rpc = peek ? 'pin_and_spin_admin_peek' : social ? 'pin_and_spin_social' : badges ? 'pin_and_spin_achievements_for' : board ? 'pin_and_spin_leaderboard' : story ? 'pin_and_spin_story' : solo ? 'pin_and_spin_solo' : tv ? 'pin_and_spin_tv' : 'pin_and_spin_api';
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/${rpc}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(peek
        ? { p_account: accountId, p_data: { code: typeof data.code === 'string' ? data.code : '', id: typeof data.id === 'string' ? data.id : '' } }
        : social
        ? { p_action: socialActions[body.action], p_account: accountId, p_data: data }
        : badges
        ? { p_account: accountId }
        : board
        ? { p_period: data.period, p_account: accountId, p_board: data.board ?? 'multi' }
        : solo
        ? { p_action: body.action, p_account: accountId, p_data: data }
        : tv
        ? { p_action: body.action, p_pair: data.pairCode ?? '', p_token: body.token, p_room: body.code ?? '', p_origin_hash: originHash }
        : { p_action: body.action, p_code: body.code ?? '', p_token: body.token, p_data: verifiedData, p_origin_hash: originHash }),
    });
    const result = await response.json();
    if (!response.ok) {
      // Only deliberate game-rule errors are public; suppress database implementation details.
      return reply({ error: result.code === 'P0001' ? result.message : 'Unable to update the game. Please try again.' }, 400);
    }
    if (tv && typeof result?.error === 'string') return reply({ error: result.error }, 400);
    return reply(result);
  } catch {
    return reply({ error: 'Unable to connect. Please try again.' }, 400);
  }
});
