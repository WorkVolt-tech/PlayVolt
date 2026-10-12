-- Fresh Neon schema. Apply only to an empty public schema, after Data API provisioning.
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES neon_auth."user"(id) ON DELETE CASCADE,
 nickname text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.domino_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','round_end','finished','abandoned')),
 game_mode text NOT NULL DEFAULT 'chien' CHECK (game_mode IN ('chien','asosye','duo','solo','1v1','1v2','1v3')),
 ai_difficulty text, current_turn integer DEFAULT 0, round integer NOT NULL DEFAULT 1,
 scores jsonb DEFAULT '[0,0,0,0]', streak jsonb DEFAULT '{"seat":null,"team":null,"count":0}',
 match_winner text, pending_point boolean DEFAULT false, blocked boolean DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.domino_players (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES public.domino_rooms(id) ON DELETE CASCADE,
 seat integer NOT NULL, nickname text NOT NULL, hand jsonb NOT NULL DEFAULT '[]',
 is_connected boolean NOT NULL DEFAULT true, is_ai boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(room_id,seat)
);
CREATE TABLE public.board (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL UNIQUE REFERENCES public.domino_rooms(id) ON DELETE CASCADE,
 tiles jsonb NOT NULL DEFAULT '[]',left_end integer,right_end integer,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.game_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL REFERENCES public.domino_rooms(id) ON DELETE CASCADE,
 player_seat integer,action text NOT NULL,tile jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nickname text NOT NULL,status text NOT NULL DEFAULT 'waiting',
 room_id uuid REFERENCES public.domino_rooms(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);


alter table public.profiles add column if not exists total_games    integer not null default 0;

alter table public.profiles add column if not exists total_vyej     integer not null default 0;

alter table public.profiles add column if not exists total_dekabess integer not null default 0;

alter table public.profiles add column if not exists updated_at     timestamptz default now();

alter table public.profiles
  add column if not exists round_streak integer not null default 0;

create index if not exists game_events_room_created_idx
  on public.game_events (room_id, created_at desc);

create index if not exists domino_players_room_seat_idx
  on public.domino_players (room_id, seat);

create index if not exists board_room_idx
  on public.board (room_id);

create table if not exists public.story_progress (
  user_id uuid primary key references neon_auth."user"(id) on delete cascade,


  current_chapter        integer not null default 1,
  completed_chapters     integer[] not null default '{}',


  completed_challenges   jsonb not null default '{}'::jsonb,


  unlocked_bots          text[] not null default '{}',


  expert_circuit_unlocked boolean not null default false,
  championship_unlocked   boolean not null default false,
  story_completed         boolean not null default false,


  stars                  jsonb not null default '{}'::jsonb,
  best_scores            jsonb not null default '{}'::jsonb,
  chapter_attempts       jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.story_progress enable row level security;

create policy story_progress_select_own on public.story_progress
  for select using (auth.uid() = user_id);

create policy story_progress_insert_own on public.story_progress
  for insert with check (auth.uid() = user_id);

create policy story_progress_update_own on public.story_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.tournaments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  format      text not null default 'duo' check (format in ('duo','solo')),
  status      text not null default 'registration'
              check (status in ('registration','running','finished','cancelled')),
  created_by  uuid references neon_auth."user"(id) on delete set null,
  starts_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.tournament_sides (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,
  seed          integer,
  is_bot        boolean not null default false,
  eliminated    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table if not exists public.tournament_members (
  id         uuid primary key default gen_random_uuid(),
  side_id    uuid not null references public.tournament_sides(id) on delete cascade,
  user_id    uuid references neon_auth."user"(id) on delete cascade,
  nickname   text not null,
  bot_name   text,
  checked_in boolean not null default false,
  unique (side_id, user_id)
);

create table if not exists public.tournament_matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round         integer not null,
  slot          integer not null,
  side_a        uuid references public.tournament_sides(id) on delete set null,
  side_b        uuid references public.tournament_sides(id) on delete set null,

  side_c        uuid references public.tournament_sides(id) on delete set null,
  side_d        uuid references public.tournament_sides(id) on delete set null,

  wins          jsonb not null default '{}'::jsonb,
  streaks       jsonb not null default '{}'::jsonb,
  last_winner   uuid,

  status        text not null default 'pending'
                check (status in ('pending','waiting','playing','done','forfeit')),
  winner_side   uuid references public.tournament_sides(id) on delete set null,
  room_id       uuid,
  no_show_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (tournament_id, round, slot)
);

create index if not exists tournament_sides_tid_idx   on public.tournament_sides (tournament_id);

create index if not exists tournament_matches_tid_idx on public.tournament_matches (tournament_id, round);

create index if not exists tournament_members_side_idx on public.tournament_members (side_id);

alter table public.tournaments        enable row level security;

alter table public.tournament_sides   enable row level security;

alter table public.tournament_members enable row level security;

alter table public.tournament_matches enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tournaments','tournament_sides','tournament_members','tournament_matches'] loop
    execute format('drop policy if exists %I_read on public.%I', t, t);
    execute format('create policy %I_read on public.%I for select using (true)', t, t);
  end loop;
end $$;

alter table public.tournament_sides
  add column if not exists code text;

create unique index if not exists tournament_sides_code_idx
  on public.tournament_sides (code) where code is not null;

alter table public.domino_rooms
  add column if not exists tournament_match_id uuid,
  add column if not exists side_by_seat jsonb;

alter table public.domino_players
  add column if not exists user_id uuid references neon_auth."user"(id) on delete set null;

alter table public.queue
  add column if not exists user_id uuid references neon_auth."user"(id) on delete set null;

create index if not exists domino_players_user_idx
  on public.domino_players (user_id) where user_id is not null;

alter table public.domino_rooms
  add column if not exists stats_recorded boolean not null default false;

alter table public.domino_rooms
  add column if not exists updated_at timestamptz not null default now();

create index if not exists domino_rooms_updated_idx
  on public.domino_rooms (updated_at) where status = 'playing';

alter table public.domino_rooms
  add column if not exists practice boolean not null default false;

alter table public.tournaments
  add column if not exists ended_at timestamptz;

update public.tournaments
   set ended_at = now()
 where status in ('finished','cancelled') and ended_at is null;

alter table public.tournament_matches
  add column if not exists deks jsonb not null default '{}'::jsonb;

do $$
declare t text;
begin
  foreach t in array array['tournaments','tournament_sides','tournament_members','tournament_matches'] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('alter table public.%I replica identity default', t);
    end if;
  end loop;
end $$;

do $$
declare
  fk   record;
  cols text;
  refc text;
begin
  for fk in
    select con.conname,
           con.conrelid::regclass  as child,
           con.confrelid::regclass as parent,
           con.conkey, con.confkey, con.conrelid, con.confrelid
      from pg_constraint con
     where con.contype = 'f'
       and con.confrelid = 'public.domino_rooms'::regclass
       and con.confdeltype <> 'c'            -- not already ON DELETE CASCADE
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into cols
      from unnest(fk.conkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = fk.conrelid and a.attnum = k.attnum;

    select string_agg(quote_ident(a.attname), ', ' order by k.ord)
      into refc
      from unnest(fk.confkey) with ordinality k(attnum, ord)
      join pg_attribute a on a.attrelid = fk.confrelid and a.attnum = k.attnum;

    execute format('alter table %s drop constraint %I', fk.child, fk.conname);
    execute format('alter table %s add constraint %I foreign key (%s) references %s (%s) on delete cascade',
                   fk.child, fk.conname, cols, fk.parent, refc);
    raise notice 'fixed %: rows in % now go with their room', fk.conname, fk.child;
  end loop;
end $$;

alter table public.domino_rooms
  add column if not exists ended_by text;

alter table public.domino_players
  add column if not exists stand_in boolean not null default false;

alter table public.domino_players
  add column if not exists left_at timestamptz;

alter table public.profiles
  add column if not exists total_tournaments_won integer not null default 0;

alter table public.domino_rooms   add column if not exists table_skin text;

alter table public.domino_rooms   add column if not exists tile_skin  text;

alter table public.domino_players add column if not exists tile_skin  text;

alter table public.profiles add column if not exists total_clean_rounds integer not null default 0;

alter table public.profiles add column if not exists total_comebacks    integer not null default 0;

alter table public.profiles add column if not exists total_five_double_rounds integer not null default 0;

alter table public.profiles add column if not exists total_five_double_wins   integer not null default 0;

alter table public.profiles       add column if not exists avatar text;

alter table public.domino_players add column if not exists avatar text;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'trophy_games') then
    alter table public.profiles add column trophy_games integer not null default 0;
    alter table public.profiles add column trophy_vyej integer not null default 0;
    alter table public.profiles add column trophy_dekabess integer not null default 0;
    alter table public.profiles add column trophy_tournaments_won integer not null default 0;
    update public.profiles set
      trophy_games = coalesce(total_games, 0),
      trophy_vyej = coalesce(total_vyej, 0),
      trophy_dekabess = coalesce(total_dekabess, 0),
      trophy_tournaments_won = coalesce(total_tournaments_won, 0);
  end if;
end $$;

alter table public.domino_rooms add column if not exists seat_count integer not null default 4;

alter table public.domino_rooms add column if not exists deal_variant text not null default 'all';

alter table public.domino_rooms add column if not exists pile jsonb not null default '[]'::jsonb;

alter table public.domino_rooms add column if not exists opening_tile jsonb;

alter table public.domino_rooms add column if not exists deal_no integer not null default 0;

alter table public.domino_rooms add column if not exists deal_decided text;

create table if not exists public.wa_tab_la (
  id bigserial primary key,
  player_id text,
  player_nickname text,
  mode text,
  week_start date,
  wins integer not null default 0
);

alter table public.wa_tab_la add column if not exists player_id text;

alter table public.wa_tab_la add column if not exists player_nickname text;

alter table public.wa_tab_la add column if not exists mode text;

alter table public.wa_tab_la add column if not exists user_id uuid;

create unique index if not exists wa_tab_la_player_week_mode on public.wa_tab_la (player_id, week_start, mode);

create table if not exists public.table_unlocks (
  user_id uuid not null references neon_auth."user"(id) on delete cascade,
  skin text not null,
  source text not null default 'wa_tab_la',
  week_start date,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, skin)
);

alter table public.table_unlocks enable row level security;

create policy "read own table unlocks" on public.table_unlocks for select using (user_id = auth.uid());

create table if not exists public.wa_tab_la_settled (
  week_start date not null,
  mode text not null,
  prize text,
  settled_at timestamptz not null default now(),
  primary key (week_start, mode)
);

alter table public.wa_tab_la_settled enable row level security;

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references neon_auth."user"(id) on delete cascade,
  addressee uuid not null references neon_auth."user"(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester <> addressee)
);

create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

create policy "see own friendships" on public.friendships for select using (auth.uid() in (requester, addressee));

create table if not exists public.blocks (
  blocker uuid not null references neon_auth."user"(id) on delete cascade,
  blocked uuid not null references neon_auth."user"(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);

alter table public.blocks enable row level security;

create policy "see own blocks" on public.blocks for select using (auth.uid() = blocker);

alter table public.profiles add column if not exists friend_code text;

update public.profiles set friend_code = upper(substr(md5(id::text || 'dekabess-friends'), 1, 8)) where friend_code is null;

create unique index if not exists profiles_friend_code on public.profiles (friend_code);

alter table public.profiles add column if not exists last_seen timestamptz;

alter table public.profiles add column if not exists activity text;

create table if not exists public.friend_challenges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references neon_auth."user"(id) on delete cascade,
  to_user uuid not null references neon_auth."user"(id) on delete cascade,
  room_id uuid references public.domino_rooms(id) on delete cascade,
  room_code text not null,
  mode text not null default 'chien',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists friend_challenges_to on public.friend_challenges (to_user, created_at desc);

alter table public.friend_challenges enable row level security;

create policy "see own challenges" on public.friend_challenges for select using (auth.uid() in (from_user, to_user));
