/* ╔══════════════════════════════════════════════════════════════╗
   ║           PLAYVOLT — auth.js                                ║
   ║  Drop this next to index.html. It's a shared helper        ║
   ║  that individual game pages can use to verify the          ║
   ║  current user's session and age tier.                      ║
   ║                                                            ║
   ║  USAGE in a game page:                                     ║
   ║    <script src="../auth.js"></script>                      ║
   ║    PlayVolt.requireAuth({ minTier: 'adult' })              ║
   ║      .then(user => { startGame(user); })                   ║
   ║      .catch(() => { /* redirected to login */ });          ║
   ╚══════════════════════════════════════════════════════════════╝ */

const PlayVolt = (() => {
  'use strict';

  const HUB_URL      = '../index.html';   // adjust if your hub lives elsewhere
  const SUPABASE_URL = 'YOUR_SUPABASE_URL';
  const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';

  let _sb = null;

  function _getSB() {
    if (_sb) return _sb;
    if (!window.supabase) throw new Error('Supabase JS not loaded.');
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return _sb;
  }

  /* ─────────────────────────────────────
     getSession()
     Returns { session, user, profile }
     or null if not logged in.
  ───────────────────────────────────── */
  async function getSession() {
    const sb = _getSB();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;

    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    return { session, user: session.user, profile };
  }

  /* ─────────────────────────────────────
     requireAuth({ minTier })
     minTier: 'adult' | 'minor' | 'any'
     Redirects to hub if not authed or
     wrong tier. Resolves with user profile
     if authorised.
  ───────────────────────────────────── */
  async function requireAuth({ minTier = 'any' } = {}) {
    const ctx = await getSession();

    if (!ctx) {
      // Not logged in — send to hub login
      window.location.href = HUB_URL;
      return Promise.reject('not_authenticated');
    }

    const { profile } = ctx;
    const isAdult = profile?.age_tier === 'adult';

    if (minTier === 'adult' && !isAdult) {
      alert('🔒 This game requires an adult account (18+).');
      window.location.href = HUB_URL;
      return Promise.reject('insufficient_tier');
    }

    return { user: ctx.user, profile };
  }

  /* ─────────────────────────────────────
     logout()
  ───────────────────────────────────── */
  async function logout() {
    await _getSB().auth.signOut();
    window.location.href = HUB_URL;
  }

  return { getSession, requireAuth, logout };
})();

/* ══════════════════════════════════════════════════════════════════
   SUPABASE SQL SETUP SCRIPT
   Run this in your Supabase SQL editor once.
   ──────────────────────────────────────────────────────────────────

-- ── TABLE: profiles ──────────────────────────────────────────────
-- Stores per-user data. age_tier is set at registration from DOB
-- and is NEVER updatable by the user (policy enforced below).

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  first_name  TEXT,
  last_name   TEXT,
  dob         DATE NOT NULL,
  age_tier    TEXT NOT NULL CHECK (age_tier IN ('adult','minor')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS: users can read their own profile. Nobody can update age_tier.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: own read"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles: own insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their profile BUT not age_tier or dob.
CREATE POLICY "profiles: own update (no dob/tier)"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- prevent changing age-gating fields
    AND age_tier = (SELECT age_tier FROM public.profiles WHERE id = auth.uid())
    AND dob      = (SELECT dob      FROM public.profiles WHERE id = auth.uid())
  );


-- ── TABLE: user_access ────────────────────────────────────────────
-- Tracks what each user can access / has purchased.
-- purchases: JSONB array of product IDs, e.g. ["extra_questions_pack_1"]

CREATE TABLE IF NOT EXISTS public.user_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL CHECK (tier IN ('adult','minor')),
  purchases   JSONB DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_access: own read"
  ON public.user_access FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_access: own insert"
  ON public.user_access FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Purchases are added via a server-side Edge Function only
-- (PayPal webhook → Supabase Edge Function → UPDATE user_access)
-- so the client never writes purchases directly.


-- ── TABLE: products ───────────────────────────────────────────────
-- The store catalogue. Managed by admins only.

CREATE TABLE IF NOT EXISTS public.products (
  id            TEXT PRIMARY KEY,              -- e.g. "extra_questions_pack_1"
  name          TEXT NOT NULL,
  description   TEXT,
  price_usd     NUMERIC(10,2) NOT NULL,
  game_id       TEXT,                          -- which game this belongs to
  min_tier      TEXT DEFAULT 'any'             -- 'adult','minor','any'
               CHECK (min_tier IN ('adult','minor','any')),
  is_active     BOOLEAN DEFAULT TRUE,
  paypal_item_id TEXT,                         -- PayPal product/SKU ID
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products: public read"
  ON public.products FOR SELECT
  USING (is_active = TRUE);

-- Only service role can insert/update products (no client writes)


-- ── TABLE: purchases ─────────────────────────────────────────────
-- Immutable log of every confirmed PayPal purchase.
-- Populated ONLY by the Supabase Edge Function (PayPal webhook).

CREATE TABLE IF NOT EXISTS public.purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  product_id      TEXT NOT NULL REFERENCES public.products(id),
  paypal_order_id TEXT UNIQUE,
  amount_usd      NUMERIC(10,2),
  status          TEXT DEFAULT 'completed',
  purchased_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases: own read"
  ON public.purchases FOR SELECT
  USING (auth.uid() = user_id);
-- No client INSERT — only service role (Edge Function) writes here.


-- ── EDGE FUNCTION SKETCH: paypal-webhook ─────────────────────────
-- Deploy this as a Supabase Edge Function.
-- PayPal sends POST to: https://<project>.supabase.co/functions/v1/paypal-webhook
--
-- The function:
--  1. Verifies the PayPal webhook signature
--  2. Checks event type = 'PAYMENT.CAPTURE.COMPLETED'
--  3. Reads custom_id = user_id from the order
--  4. Reads item SKU = product_id
--  5. Inserts into purchases table (service role key)
--  6. Appends product_id to user_access.purchases for that user
--
-- See: https://developer.paypal.com/api/rest/webhooks/
-- PayPal Orders API lets you set custom_id on the order to store the user_id.

══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   HOW TO ADD PLAYVOLT AUTH TO A GAME PAGE
   ──────────────────────────────────────────────────────────────────

   In your game's index.html <head>:

   <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
   <script src="../auth.js"></script>

   Then early in your game's <script>:

   // For the ADULT game (whos-the-worst-adult):
   PlayVolt.requireAuth({ minTier: 'adult' })
     .then(({ user, profile }) => {
       console.log('Authenticated adult:', profile.username);
       initGame();  // your existing game init
     });

   // For the KIDS game (whos-the-worst):
   PlayVolt.requireAuth({ minTier: 'any' })
     .then(({ user, profile }) => {
       console.log('Authenticated player:', profile.username);
       initGame();
     });

   The helper will redirect non-authenticated users back to PlayVolt
   hub automatically. No extra code needed.

══════════════════════════════════════════════════════════════════ */
