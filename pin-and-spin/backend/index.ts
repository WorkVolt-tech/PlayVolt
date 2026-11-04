// Guest authentication is handled by unguessable player/display capabilities in the
// transactional RPC. Never trust a player ID, timer, score, or host flag from a client.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, apikey, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
};
const actions = new Set(['create', 'join', 'state', 'ready', 'start', 'guess', 'leave', 'replay', 'display']);
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 4096) return reply({ error: 'Request too large' }, 413);
    const body = JSON.parse(raw);
    if (!actions.has(body.action) || typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) {
      return reply({ error: 'Invalid player session' }, 400);
    }
    if (body.action !== 'create' && (typeof body.code !== 'string' || !/^[A-F0-9]{6}$/i.test(body.code))) {
      return reply({ error: 'Enter the six-character room code' }, 400);
    }
    const data = body.data ?? {};
    if (typeof data !== 'object' || Array.isArray(data)) return reply({ error: 'Invalid request' }, 400);
    if (body.action === 'guess' && (!Array.isArray(data.colors) || data.colors.length !== 4 ||
      !data.colors.every((c: unknown) => Number.isInteger(c) && Number(c) >= 0 && Number(c) <= 5) ||
      !Number.isInteger(data.attempt) || !Number.isInteger(data.puzzle))) {
      return reply({ error: 'Choose four colors' }, 400);
    }
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address + key));
    const originHash = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    const response = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/pin_and_spin_api`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_action: body.action, p_code: body.code ?? '', p_token: body.token, p_data: data, p_origin_hash: originHash }),
    });
    const result = await response.json();
    if (!response.ok) {
      // Only deliberate game-rule errors are public; suppress database implementation details.
      return reply({ error: result.code === 'P0001' ? result.message : 'Unable to update the game. Please try again.' }, 400);
    }
    return reply(result);
  } catch {
    return reply({ error: 'Unable to connect. Please try again.' }, 400);
  }
});
