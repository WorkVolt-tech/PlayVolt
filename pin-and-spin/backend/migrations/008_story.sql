-- Pin & Spin migration 008: Story mode (signed-in players).
-- 24 levels in 3 worlds. Two kinds of level:
--   game   a normal solo game with a twist (fewer colors, no repeats, fewer tries, a timer)
--   logic  a deduction puzzle: clue guesses with their Pins/Spins are shown, and exactly one
--          code fits them all; the player gets 1-3 tries to name it
-- Winning earns 1-3 stars (fewer tries = more stars) and unlocks the next level.
-- Story games reuse pin_and_spin_solo_games and the solo_guess action. Safe to run more than once.
alter table public.pin_and_spin_solo_games add column if not exists story_level integer;
alter table public.pin_and_spin_solo_games add column if not exists clues jsonb not null default '[]'::jsonb;
alter table public.pin_and_spin_solo_games drop constraint if exists pin_and_spin_solo_games_kind_check;
alter table public.pin_and_spin_solo_games add constraint pin_and_spin_solo_games_kind_check
  check (kind in ('daily', 'practice', 'clock', 'story'));

create table if not exists public.pin_and_spin_story_levels (
  level integer primary key,
  world integer not null,
  title text not null,
  kind text not null check (kind in ('game', 'logic')),
  colors integer not null check (colors between 4 and 6),
  repeats boolean not null,
  tries integer not null,
  seconds integer,
  star2 integer not null,
  star3 integer not null,
  intro text not null
);
comment on table public.pin_and_spin_story_levels is 'Story mode level list (rules only; codes are made when a level starts)';
insert into public.pin_and_spin_story_levels(level, world, title, kind, colors, repeats, tries, seconds, star2, star3, intro) values
  (1, 1, 'First Hop', 'game', 4, false, 10, null, 7, 5, 'Four colors, none repeated. Find the code — take your time!'),
  (2, 1, 'Carrot Count', 'game', 4, false, 8, null, 6, 4, 'Same colors, fewer tries.'),
  (3, 1, 'Bunny Logic', 'logic', 4, false, 3, null, 2, 1, 'No guessing first: read the clues and work out the code.'),
  (4, 1, 'Five Flavors', 'game', 5, false, 8, null, 6, 4, 'A fifth color joins the patch.'),
  (5, 1, 'Double Trouble', 'game', 5, true, 8, null, 6, 5, 'Colors can now repeat in the code!'),
  (6, 1, 'Sharp Ears', 'logic', 5, false, 2, null, 2, 1, 'Five colors. Read the clues carefully.'),
  (7, 1, 'Full Rainbow', 'game', 6, false, 8, null, 6, 4, 'All six colors, no repeats.'),
  (8, 1, 'Patch Boss', 'game', 6, true, 8, null, 6, 4, 'The real deal: six colors, repeats allowed.'),
  (9, 2, 'Tick Tock', 'game', 6, true, 8, 180, 6, 4, 'The clock is ticking: 3 minutes.'),
  (10, 2, 'Gear Puzzle', 'logic', 6, false, 2, null, 2, 1, 'Six colors, no repeats. Deduce it.'),
  (11, 2, 'Tight Spring', 'game', 6, true, 7, null, 5, 4, 'Only 7 tries.'),
  (12, 2, 'Two Minute Warning', 'game', 6, true, 8, 120, 6, 4, '2 minutes on the clock.'),
  (13, 2, 'Cog Riddle', 'logic', 6, true, 2, null, 2, 1, 'Clues with repeated colors. Tricky!'),
  (14, 2, 'Six Shooter', 'game', 6, true, 6, null, 5, 4, '6 tries. Every guess counts.'),
  (15, 2, 'Rush Hour', 'game', 6, true, 7, 90, 5, 4, '90 seconds, 7 tries.'),
  (16, 2, 'Burrow Boss', 'game', 6, true, 6, 120, 5, 4, '6 tries and 2 minutes. Good luck!'),
  (17, 3, 'Moonlight', 'logic', 6, true, 1, null, 1, 1, 'One shot. Read every clue.'),
  (18, 3, 'Crater Code', 'game', 6, true, 5, null, 5, 4, 'Just 5 tries.'),
  (19, 3, 'Lunar Sprint', 'game', 6, true, 6, 60, 5, 4, 'One minute!'),
  (20, 3, 'Star Map', 'logic', 6, true, 1, null, 1, 1, 'One shot, no second chances.'),
  (21, 3, 'Zero Gravity', 'game', 6, true, 5, 120, 5, 4, '5 tries, 2 minutes.'),
  (22, 3, 'Dark Side', 'logic', 6, true, 1, null, 1, 1, 'The hardest clues yet.'),
  (23, 3, 'Meteor Shower', 'game', 6, true, 5, 90, 5, 4, '5 tries in 90 seconds.'),
  (24, 3, 'Moon Boss', 'game', 6, true, 5, 60, 5, 4, 'The final vault: 5 tries, 1 minute.')
on conflict (level) do update set world = excluded.world, title = excluded.title, kind = excluded.kind, colors = excluded.colors,
  repeats = excluded.repeats, tries = excluded.tries, seconds = excluded.seconds, star2 = excluded.star2, star3 = excluded.star3,
  intro = excluded.intro;

create table if not exists public.pin_and_spin_story_progress (
  user_id uuid not null,
  level integer not null references public.pin_and_spin_story_levels on delete cascade,
  stars integer not null check (stars between 1 and 3),
  best_tries integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, level)
);
comment on table public.pin_and_spin_story_progress is 'Best stars per story level per signed-in player';
alter table public.pin_and_spin_story_levels enable row level security;
alter table public.pin_and_spin_story_progress enable row level security;

-- Clue guesses for a logic level: random guesses are added until exactly one code (the
-- secret) fits every clue. Candidates are kept as text like '0123' and narrowed per clue.
create or replace function public.pin_and_spin_story_clues(p_secret integer[], p_colors integer, p_repeats boolean)
returns jsonb language plpgsql volatile set search_path = '' as $fn$
declare clues jsonb; codes text[]; guess integer[]; s integer[]; attempt integer;
begin
  for attempt in 1..8 loop
    clues := '[]'::jsonb;
    select array_agg(a::text || b::text || c::text || d::text) into codes
      from generate_series(0, p_colors - 1) a, generate_series(0, p_colors - 1) b, generate_series(0, p_colors - 1) c, generate_series(0, p_colors - 1) d
      where p_repeats or (a <> b and a <> c and a <> d and b <> c and b <> d and c <> d);
    while array_length(codes, 1) > 1 and jsonb_array_length(clues) < 9 loop
      guess := public.pin_and_spin_solo_code(p_colors, p_repeats);
      if guess = p_secret then continue; end if;
      s := public.pin_and_spin_score(p_secret, guess);
      -- Skip guesses that tell the player nothing new.
      if (select count(*) from unnest(codes) x where public.pin_and_spin_score(
          array[substr(x,1,1)::int, substr(x,2,1)::int, substr(x,3,1)::int, substr(x,4,1)::int], guess) = s) = array_length(codes, 1) then
        continue;
      end if;
      codes := array(select x from unnest(codes) x where public.pin_and_spin_score(
        array[substr(x,1,1)::int, substr(x,2,1)::int, substr(x,3,1)::int, substr(x,4,1)::int], guess) = s);
      clues := clues || jsonb_build_array(jsonb_build_object('colors', to_jsonb(guess), 'pins', s[1], 'spins', s[2]));
    end loop;
    if array_length(codes, 1) = 1 then return clues; end if;
  end loop;
  raise exception 'Could not build this puzzle. Try again';
end;
$fn$;

-- The solo view now also carries the story level and its clues.
create or replace function public.pin_and_spin_solo_view(g public.pin_and_spin_solo_games)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'level', g.level, 'day', g.day,
    'number', case when g.day is not null then g.day - date '2026-11-01' + 1 end,
    'colors', g.colors, 'maxTries', g.max_tries, 'guesses', g.guesses, 'status', g.status,
    'solved', g.solved, 'lastSecret', g.last_secret, 'totalGuesses', g.total_guesses,
    'deadline', g.deadline, 'serverTime', clock_timestamp(),
    'storyLevel', g.story_level, 'clues', g.clues,
    'answer', case when g.status <> 'playing' then to_jsonb(g.secret) end);
$$;

-- Same as migration 007, except timed story levels also end when time runs out.
create or replace function public.pin_and_spin_solo(p_action text, p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  g public.pin_and_spin_solo_games; v_kind text := p_data->>'kind'; v_level text := coalesce(p_data->>'level', 'normal');
  v_day date; v_secret integer[]; v_colors integer[]; v_score integer[]; v_tries integer; v_attempt integer;
  v_streak integer := 0; v_best integer := 0; v_run integer := 0; v_prev date; d record; result jsonb;
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to play solo'; end if;
  if p_action not in ('solo_home', 'solo_start', 'solo_guess', 'solo_get') then raise exception 'Unknown action'; end if;

  -- Timed games end by themselves: beat the clock is done, a timed story level is lost.
  update public.pin_and_spin_solo_games set status = case when kind = 'clock' then 'done' else 'lost' end,
    finished_at = deadline, last_secret = case when kind = 'clock' then secret else last_secret end
    where user_id = p_account and kind in ('clock', 'story') and status = 'playing' and deadline <= clock_timestamp();

  if p_action = 'solo_get' then
    select * into g from public.pin_and_spin_solo_games where id = nullif(p_data->>'id', '')::uuid and user_id = p_account;
    if not found then raise exception 'That game is no longer available'; end if;
    return public.pin_and_spin_solo_view(g);
  end if;

  if p_action = 'solo_home' then
    v_day := coalesce(nullif(p_data->>'day', '')::date, current_date);
    for d in select day, status from public.pin_and_spin_solo_games
      where user_id = p_account and kind = 'daily' and status <> 'playing' order by day loop
      if d.status = 'won' then
        v_run := case when v_prev = d.day - 1 then v_run + 1 else 1 end;
        v_best := greatest(v_best, v_run);
      else v_run := 0; end if;
      v_prev := d.day;
    end loop;
    -- The streak is still alive if the last win was today or yesterday.
    v_streak := case when v_prev >= v_day - 1 then v_run else 0 end;
    select jsonb_build_object(
      'today', (select public.pin_and_spin_solo_view(s) from public.pin_and_spin_solo_games s where s.user_id = p_account and s.day = v_day),
      'number', v_day - date '2026-11-01' + 1,
      'daily', jsonb_build_object(
        'played', (select count(*) from public.pin_and_spin_solo_games where user_id = p_account and kind = 'daily' and status <> 'playing'),
        'won', (select count(*) from public.pin_and_spin_solo_games where user_id = p_account and kind = 'daily' and status = 'won'),
        'streak', v_streak, 'best', v_best,
        'tries', (select coalesce(jsonb_agg(n order by t), '[]'::jsonb) from (select t, (select count(*) from public.pin_and_spin_solo_games
          where user_id = p_account and kind = 'daily' and status = 'won' and jsonb_array_length(guesses) = t) n from generate_series(1, 6) t) x)),
      'practice', (select coalesce(jsonb_object_agg(level, jsonb_build_object('played', played, 'won', won)), '{}'::jsonb) from (
        select level, count(*) filter (where status <> 'playing') played, count(*) filter (where status = 'won') won
        from public.pin_and_spin_solo_games where user_id = p_account and kind = 'practice' group by level) x),
      'clock', jsonb_build_object(
        'best', (select coalesce(max(solved), 0) from public.pin_and_spin_solo_games where user_id = p_account and kind = 'clock'),
        'played', (select count(*) from public.pin_and_spin_solo_games where user_id = p_account and kind = 'clock' and status <> 'playing')),
      'active', (select coalesce(jsonb_object_agg(kind || ':' || level, id), '{}'::jsonb) from public.pin_and_spin_solo_games
        where user_id = p_account and kind in ('practice', 'clock') and status = 'playing')
    ) into result;
    return result;
  end if;

  if p_action = 'solo_start' then
    if v_kind not in ('daily', 'practice', 'clock') then raise exception 'Choose a solo game'; end if;
    if v_level not in ('easy', 'normal', 'hard') then raise exception 'Choose a difficulty'; end if;
    if v_kind = 'daily' then
      v_day := nullif(p_data->>'day', '')::date;
      -- The player's own calendar day, within a day of the server's (time zones).
      if v_day is null or v_day < current_date - 1 or v_day > current_date + 1 then raise exception 'Check the date on your device'; end if;
      insert into public.pin_and_spin_daily(day, secret) values (v_day, public.pin_and_spin_solo_code(6, true)) on conflict (day) do nothing;
      select secret into v_secret from public.pin_and_spin_daily where day = v_day;
      insert into public.pin_and_spin_solo_games(user_id, kind, level, day, secret, colors, max_tries)
        values (p_account, 'daily', 'normal', v_day, v_secret, 6, 6) on conflict (user_id, day) do nothing;
      select * into g from public.pin_and_spin_solo_games where user_id = p_account and day = v_day;
      return public.pin_and_spin_solo_view(g);
    end if;
    if v_kind = 'clock' then v_level := 'normal'; end if;
    -- Continue an unfinished game of this kind unless a fresh one is asked for.
    select * into g from public.pin_and_spin_solo_games where user_id = p_account and kind = v_kind and level = v_level and status = 'playing'
      order by started_at desc limit 1;
    if found and coalesce((p_data->>'fresh')::boolean, false) is false then return public.pin_and_spin_solo_view(g); end if;
    update public.pin_and_spin_solo_games set status = case when kind = 'clock' then 'done' else 'lost' end, finished_at = clock_timestamp()
      where user_id = p_account and kind = v_kind and level = v_level and status = 'playing';
    if (select count(*) from public.pin_and_spin_solo_games where user_id = p_account and started_at > now() - interval '1 hour') >= 120 then
      raise exception 'Take a short break and try again in a few minutes';
    end if;
    insert into public.pin_and_spin_solo_games(user_id, kind, level, secret, colors, max_tries, deadline)
      values (p_account, v_kind, v_level,
        public.pin_and_spin_solo_code(case when v_level = 'easy' then 4 else 6 end, v_level <> 'easy'),
        case when v_level = 'easy' then 4 else 6 end,
        case when v_level = 'hard' then 6 else 8 end,
        case when v_kind = 'clock' then clock_timestamp() + interval '3 minutes' end)
      returning * into g;
    return public.pin_and_spin_solo_view(g);
  end if;

  -- solo_guess
  select * into g from public.pin_and_spin_solo_games where id = nullif(p_data->>'id', '')::uuid and user_id = p_account for update;
  if not found then raise exception 'That game is no longer available'; end if;
  v_attempt := (p_data->>'attempt')::integer;
  v_tries := jsonb_array_length(g.guesses);
  -- Finished, or a repeated request: just return the current state.
  if g.status <> 'playing' or v_attempt is distinct from v_tries + 1 then return public.pin_and_spin_solo_view(g); end if;
  if jsonb_typeof(p_data->'colors') <> 'array' or jsonb_array_length(p_data->'colors') <> 4 then raise exception 'Choose four colors'; end if;
  select array_agg(value::integer) into v_colors from jsonb_array_elements_text(p_data->'colors');
  if exists (select 1 from unnest(v_colors) c where c is null or c < 0 or c >= g.colors) then raise exception 'Invalid color'; end if;
  v_score := public.pin_and_spin_score(g.secret, v_colors);
  g.guesses := g.guesses || jsonb_build_array(jsonb_build_object('attempt', v_tries + 1, 'colors', to_jsonb(v_colors),
    'pins', v_score[1], 'spins', v_score[2], 'revealed', true));
  g.total_guesses := g.total_guesses + 1;
  if g.kind = 'clock' then
    if v_score[1] = 4 or v_tries + 1 >= g.max_tries then
      -- Cracked (+1) or out of tries: show the old code and move on to a new one.
      g.solved := g.solved + case when v_score[1] = 4 then 1 else 0 end;
      g.last_secret := g.secret;
      g.secret := public.pin_and_spin_solo_code(6, true);
      g.guesses := '[]'::jsonb;
    end if;
  elsif v_score[1] = 4 then g.status := 'won'; g.finished_at := clock_timestamp();
  elsif v_tries + 1 >= g.max_tries then g.status := 'lost'; g.finished_at := clock_timestamp();
  end if;
  update public.pin_and_spin_solo_games set guesses = g.guesses, total_guesses = g.total_guesses, solved = g.solved,
    last_secret = g.last_secret, secret = g.secret, status = g.status, finished_at = g.finished_at where id = g.id;
  result := public.pin_and_spin_solo_view(g);
  -- Clock: say what happened to the last code (the phone shows it, then the new code).
  if g.kind = 'clock' and jsonb_array_length(g.guesses) = 0 then
    result := result || jsonb_build_object('lastResult', case when v_score[1] = 4 then 'solved' else 'skipped' end);
  end if;
  return result;
end;
$$;

-- Stars when a story level is won (best result kept).
create or replace function public.pin_and_spin_story_award()
returns trigger language plpgsql security definer set search_path = '' as $$
declare lv public.pin_and_spin_story_levels; t integer := jsonb_array_length(new.guesses); s integer;
begin
  select * into lv from public.pin_and_spin_story_levels where level = new.story_level;
  if not found then return null; end if;
  s := case when t <= lv.star3 then 3 when t <= lv.star2 then 2 else 1 end;
  insert into public.pin_and_spin_story_progress(user_id, level, stars, best_tries) values (new.user_id, lv.level, s, t)
    on conflict (user_id, level) do update set stars = greatest(public.pin_and_spin_story_progress.stars, excluded.stars),
      best_tries = least(public.pin_and_spin_story_progress.best_tries, excluded.best_tries), updated_at = now();
  return null;
end;
$$;
drop trigger if exists pin_and_spin_story_award on public.pin_and_spin_solo_games;
create trigger pin_and_spin_story_award after update on public.pin_and_spin_solo_games
  for each row when (new.kind = 'story' and old.status = 'playing' and new.status = 'won')
  execute function public.pin_and_spin_story_award();

-- story_home: the level map with this player's stars; story_start: play a level.
create or replace function public.pin_and_spin_story(p_action text, p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare lv public.pin_and_spin_story_levels; g public.pin_and_spin_solo_games; v_level integer; v_secret integer[];
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to play story mode'; end if;
  if p_action not in ('story_home', 'story_start') then raise exception 'Unknown action'; end if;
  update public.pin_and_spin_solo_games set status = 'lost', finished_at = deadline
    where user_id = p_account and kind = 'story' and status = 'playing' and deadline <= clock_timestamp();

  if p_action = 'story_home' then
    return jsonb_build_object(
      'levels', (select jsonb_agg(jsonb_build_object('level', l.level, 'world', l.world, 'title', l.title, 'kind', l.kind,
          'colors', l.colors, 'repeats', l.repeats, 'tries', l.tries, 'seconds', l.seconds, 'star2', l.star2, 'star3', l.star3,
          'intro', l.intro, 'stars', coalesce(p.stars, 0), 'bestTries', p.best_tries,
          'unlocked', l.level = 1 or exists (select 1 from public.pin_and_spin_story_progress q where q.user_id = p_account and q.level = l.level - 1))
        order by l.level)
        from public.pin_and_spin_story_levels l left join public.pin_and_spin_story_progress p on p.user_id = p_account and p.level = l.level),
      'stars', (select coalesce(sum(stars), 0) from public.pin_and_spin_story_progress where user_id = p_account),
      'active', (select jsonb_build_object('id', id, 'level', story_level) from public.pin_and_spin_solo_games
        where user_id = p_account and kind = 'story' and status = 'playing' order by started_at desc limit 1));
  end if;

  v_level := (p_data->>'level')::integer;
  select * into lv from public.pin_and_spin_story_levels where level = v_level;
  if not found then raise exception 'Choose a level'; end if;
  if v_level > 1 and not exists (select 1 from public.pin_and_spin_story_progress where user_id = p_account and level = v_level - 1) then
    raise exception 'Finish the level before this one first';
  end if;
  -- Continue the same level if it is unfinished, unless a fresh try is asked for.
  select * into g from public.pin_and_spin_solo_games where user_id = p_account and kind = 'story' and story_level = v_level and status = 'playing'
    order by started_at desc limit 1;
  if found and coalesce((p_data->>'fresh')::boolean, false) is false then return public.pin_and_spin_solo_view(g); end if;
  update public.pin_and_spin_solo_games set status = 'lost', finished_at = clock_timestamp()
    where user_id = p_account and kind = 'story' and status = 'playing';
  if (select count(*) from public.pin_and_spin_solo_games where user_id = p_account and started_at > now() - interval '1 hour') >= 120 then
    raise exception 'Take a short break and try again in a few minutes';
  end if;
  v_secret := public.pin_and_spin_solo_code(lv.colors, lv.repeats);
  insert into public.pin_and_spin_solo_games(user_id, kind, level, story_level, secret, colors, max_tries, deadline, clues)
    values (p_account, 'story', 'normal', lv.level, v_secret, lv.colors, lv.tries,
      case when lv.seconds is not null then clock_timestamp() + make_interval(secs => lv.seconds) end,
      case when lv.kind = 'logic' then public.pin_and_spin_story_clues(v_secret, lv.colors, lv.repeats) else '[]'::jsonb end)
    returning * into g;
  return public.pin_and_spin_solo_view(g);
end;
$$;

revoke all on public.pin_and_spin_story_levels, public.pin_and_spin_story_progress from public, anon, authenticated;
revoke all on function public.pin_and_spin_story_clues(integer[], integer, boolean), public.pin_and_spin_story_award(),
  public.pin_and_spin_story(text, uuid, jsonb), public.pin_and_spin_solo_view(public.pin_and_spin_solo_games),
  public.pin_and_spin_solo(text, uuid, jsonb) from public, anon, authenticated;
grant all on public.pin_and_spin_story_levels, public.pin_and_spin_story_progress to service_role;
grant execute on function public.pin_and_spin_story_clues(integer[], integer, boolean), public.pin_and_spin_story(text, uuid, jsonb),
  public.pin_and_spin_solo_view(public.pin_and_spin_solo_games), public.pin_and_spin_solo(text, uuid, jsonb) to service_role;
