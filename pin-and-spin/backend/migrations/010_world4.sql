-- Pin & Spin migration 010: Story World 4 "Crystal Caves" with 5-ball codes and up to 8 colors
-- (two new colors: 6 = orange, 7 = pink). Levels and solo games get a `slots` setting (4 or 5);
-- the code maker and logic-puzzle builder work for any number of balls and colors.
-- Multiplayer and the other solo modes are unchanged (4 balls, 6 colors). Safe to run more than once.
alter table public.pin_and_spin_story_levels add column if not exists slots integer not null default 4;
alter table public.pin_and_spin_story_levels drop constraint if exists pin_and_spin_story_levels_colors_check;
alter table public.pin_and_spin_story_levels add constraint pin_and_spin_story_levels_colors_check check (colors between 4 and 8);
alter table public.pin_and_spin_story_levels drop constraint if exists pin_and_spin_story_levels_slots_check;
alter table public.pin_and_spin_story_levels add constraint pin_and_spin_story_levels_slots_check check (slots between 4 and 5);
alter table public.pin_and_spin_solo_games add column if not exists slots integer not null default 4;

insert into public.pin_and_spin_story_levels(level, world, title, kind, colors, repeats, slots, tries, seconds, star2, star3, intro) values
  (25, 4, 'Crystal Five', 'game', 6, false, 5, 10, null, 7, 5, 'Five balls! Six colors, none repeated.'),
  (26, 4, 'Eight Gems', 'game', 8, false, 4, 10, null, 7, 5, 'Two new colors join: orange and pink. No repeats.'),
  (27, 4, 'Prism Logic', 'logic', 7, false, 4, 3, null, 2, 1, 'Seven colors. Only one code fits the clues.'),
  (28, 4, 'Echo Chamber', 'game', 6, true, 5, 10, null, 8, 6, 'Five balls, and colors can repeat.'),
  (29, 4, 'Gem Storm', 'game', 8, true, 4, 10, null, 8, 6, 'All eight colors, repeats allowed.'),
  (30, 4, 'Mirror Logic', 'logic', 6, false, 5, 2, null, 2, 1, 'Five balls of logic. Read carefully.'),
  (31, 4, 'Crystal Rush', 'game', 7, true, 5, 10, 180, 8, 6, 'Five balls, seven colors, 3 minutes.'),
  (32, 4, 'Cave Boss', 'game', 8, true, 5, 12, 240, 9, 7, 'The ultimate vault: five balls, eight colors, 4 minutes.')
on conflict (level) do update set world = excluded.world, title = excluded.title, kind = excluded.kind, colors = excluded.colors,
  repeats = excluded.repeats, slots = excluded.slots, tries = excluded.tries, seconds = excluded.seconds, star2 = excluded.star2,
  star3 = excluded.star3, intro = excluded.intro;

-- A random code of `p_slots` balls using the first `p_colors` colors.
create or replace function public.pin_and_spin_code_n(p_colors integer, p_repeats boolean, p_slots integer)
returns integer[] language plpgsql volatile set search_path = '' as $$
declare code integer[] := '{}'; c integer;
begin
  while coalesce(array_length(code, 1), 0) < p_slots loop
    c := (('x' || substr(md5(gen_random_uuid()::text), 1, 6))::bit(24)::integer) % p_colors;
    if p_repeats or not (c = any(code)) then code := code || c; end if;
  end loop;
  return code;
end;
$$;

-- Code number x (0 .. colors^slots - 1) as balls, first ball = lowest digit.
create or replace function public.pin_and_spin_decode(p_x integer, p_colors integer, p_slots integer)
returns integer[] language sql immutable set search_path = '' as $$
  select array_agg((p_x / (p_colors ^ i)::integer) % p_colors order by i) from generate_series(0, p_slots - 1) i;
$$;

-- Logic-puzzle clues for any number of balls: random guesses are added until exactly one
-- code (the secret) fits every clue. Candidates are code numbers, narrowed clue by clue.
create or replace function public.pin_and_spin_story_clues(p_secret integer[], p_colors integer, p_repeats boolean)
returns jsonb language plpgsql volatile set search_path = '' as $fn$
declare clues jsonb; codes integer[]; guess integer[]; s integer[]; attempt integer; n integer := array_length(p_secret, 1);
begin
  for attempt in 1..8 loop
    clues := '[]'::jsonb;
    select array_agg(x) into codes from generate_series(0, (p_colors ^ n)::integer - 1) x
      where p_repeats or (select count(distinct v) from unnest(public.pin_and_spin_decode(x, p_colors, n)) v) = n;
    while array_length(codes, 1) > 1 and jsonb_array_length(clues) < 10 loop
      guess := public.pin_and_spin_code_n(p_colors, p_repeats, n);
      if guess = p_secret then continue; end if;
      s := public.pin_and_spin_score(p_secret, guess);
      -- Skip guesses that tell the player nothing new.
      if (select count(*) from unnest(codes) x where public.pin_and_spin_score(public.pin_and_spin_decode(x, p_colors, n), guess) = s)
        = array_length(codes, 1) then continue; end if;
      codes := array(select x from unnest(codes) x where public.pin_and_spin_score(public.pin_and_spin_decode(x, p_colors, n), guess) = s);
      clues := clues || jsonb_build_array(jsonb_build_object('colors', to_jsonb(guess), 'pins', s[1], 'spins', s[2]));
    end loop;
    if array_length(codes, 1) = 1 then return clues; end if;
  end loop;
  raise exception 'Could not build this puzzle. Try again';
end;
$fn$;

-- The solo view also carries the number of balls.
create or replace function public.pin_and_spin_solo_view(g public.pin_and_spin_solo_games)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'level', g.level, 'day', g.day,
    'number', case when g.day is not null then g.day - date '2026-11-01' + 1 end,
    'colors', g.colors, 'maxTries', g.max_tries, 'guesses', g.guesses, 'status', g.status,
    'solved', g.solved, 'lastSecret', g.last_secret, 'totalGuesses', g.total_guesses,
    'deadline', g.deadline, 'serverTime', clock_timestamp(),
    'storyLevel', g.story_level, 'clues', g.clues, 'slots', g.slots,
    'answer', case when g.status <> 'playing' then to_jsonb(g.secret) end);
$$;

-- Same as migration 008, except guesses must match the game's number of balls, and a
-- code is cracked when every ball is a Pin (4 or 5).
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
  if jsonb_typeof(p_data->'colors') <> 'array' or jsonb_array_length(p_data->'colors') <> g.slots then
    raise exception 'Choose % colors', g.slots;
  end if;
  select array_agg(value::integer) into v_colors from jsonb_array_elements_text(p_data->'colors');
  if exists (select 1 from unnest(v_colors) c where c is null or c < 0 or c >= g.colors) then raise exception 'Invalid color'; end if;
  v_score := public.pin_and_spin_score(g.secret, v_colors);
  g.guesses := g.guesses || jsonb_build_array(jsonb_build_object('attempt', v_tries + 1, 'colors', to_jsonb(v_colors),
    'pins', v_score[1], 'spins', v_score[2], 'revealed', true));
  g.total_guesses := g.total_guesses + 1;
  if g.kind = 'clock' then
    if v_score[1] = g.slots or v_tries + 1 >= g.max_tries then
      -- Cracked (+1) or out of tries: show the old code and move on to a new one.
      g.solved := g.solved + case when v_score[1] = g.slots then 1 else 0 end;
      g.last_secret := g.secret;
      g.secret := public.pin_and_spin_code_n(6, true, g.slots);
      g.guesses := '[]'::jsonb;
    end if;
  elsif v_score[1] = g.slots then g.status := 'won'; g.finished_at := clock_timestamp();
  elsif v_tries + 1 >= g.max_tries then g.status := 'lost'; g.finished_at := clock_timestamp();
  end if;
  update public.pin_and_spin_solo_games set guesses = g.guesses, total_guesses = g.total_guesses, solved = g.solved,
    last_secret = g.last_secret, secret = g.secret, status = g.status, finished_at = g.finished_at where id = g.id;
  result := public.pin_and_spin_solo_view(g);
  -- Clock: say what happened to the last code (the phone shows it, then the new code).
  if g.kind = 'clock' and jsonb_array_length(g.guesses) = 0 then
    result := result || jsonb_build_object('lastResult', case when v_score[1] = g.slots then 'solved' else 'skipped' end);
  end if;
  return result;
end;
$$;

-- Same as migration 008, except levels can have 5 balls and up to 8 colors.
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
          'intro', l.intro, 'slots', l.slots, 'stars', coalesce(p.stars, 0), 'bestTries', p.best_tries,
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
  v_secret := public.pin_and_spin_code_n(lv.colors, lv.repeats, lv.slots);
  insert into public.pin_and_spin_solo_games(user_id, kind, level, story_level, secret, colors, max_tries, deadline, clues, slots)
    values (p_account, 'story', 'normal', lv.level, v_secret, lv.colors, lv.tries,
      case when lv.seconds is not null then clock_timestamp() + make_interval(secs => lv.seconds) end,
      case when lv.kind = 'logic' then public.pin_and_spin_story_clues(v_secret, lv.colors, lv.repeats) else '[]'::jsonb end, lv.slots)
    returning * into g;
  return public.pin_and_spin_solo_view(g);
end;
$$;

revoke all on function public.pin_and_spin_code_n(integer, boolean, integer), public.pin_and_spin_decode(integer, integer, integer),
  public.pin_and_spin_story_clues(integer[], integer, boolean), public.pin_and_spin_solo_view(public.pin_and_spin_solo_games),
  public.pin_and_spin_solo(text, uuid, jsonb), public.pin_and_spin_story(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pin_and_spin_code_n(integer, boolean, integer), public.pin_and_spin_decode(integer, integer, integer),
  public.pin_and_spin_story_clues(integer[], integer, boolean), public.pin_and_spin_solo_view(public.pin_and_spin_solo_games),
  public.pin_and_spin_solo(text, uuid, jsonb), public.pin_and_spin_story(text, uuid, jsonb) to service_role;
