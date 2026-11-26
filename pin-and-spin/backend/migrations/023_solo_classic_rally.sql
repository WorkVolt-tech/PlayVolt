-- Solo Classic and Code Rally: eight guesses, independent of multiplayer limits.
-- Existing account-only solo access and private-table permissions remain unchanged.
alter table public.pin_and_spin_solo_games drop constraint if exists pin_and_spin_solo_games_kind_check;
alter table public.pin_and_spin_solo_games add constraint pin_and_spin_solo_games_kind_check
  check (kind in ('daily', 'practice', 'clock', 'story', 'classic', 'rally'));
alter table public.pin_and_spin_solo_games add column if not exists rally_stage integer not null default 1;
alter table public.pin_and_spin_solo_games add column if not exists rally_history jsonb not null default '[]'::jsonb;

create or replace function public.pin_and_spin_solo_view(g public.pin_and_spin_solo_games)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id, 'kind', g.kind, 'level', g.level, 'day', g.day,
    'number', case when g.day is not null then g.day - date '2026-11-01' + 1 end,
    'colors', g.colors, 'maxTries', g.max_tries, 'guesses', g.guesses, 'status', g.status,
    'solved', g.solved, 'lastSecret', g.last_secret, 'totalGuesses', g.total_guesses,
    'deadline', g.deadline, 'serverTime', clock_timestamp(),
    'stage', g.rally_stage, 'history', g.rally_history,
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
    where user_id = p_account and kind in ('clock', 'story', 'rally') and status = 'playing' and deadline <= clock_timestamp();

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
        where user_id = p_account and kind in ('practice', 'clock', 'classic', 'rally') and status = 'playing')
    ) into result;
    return result;
  end if;

  if p_action = 'solo_start' then
    if v_kind not in ('daily', 'practice', 'clock', 'classic', 'rally') then raise exception 'Choose a solo game'; end if;
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
    if v_kind in ('clock', 'classic', 'rally') then v_level := 'normal'; end if;
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
        public.pin_and_spin_solo_code(case when v_level = 'easy' then 4 else 6 end, v_level <> 'easy' and v_kind <> 'rally'),
        case when v_level = 'easy' then 4 else 6 end,
        case when v_level = 'hard' then 6 else 8 end,
        case when v_kind in ('clock', 'rally') then clock_timestamp() + interval '3 minutes' end)
      returning * into g;
    return public.pin_and_spin_solo_view(g);
  end if;

  -- solo_guess
  select * into g from public.pin_and_spin_solo_games where id = nullif(p_data->>'id', '')::uuid and user_id = p_account for update;
  if not found then raise exception 'That game is no longer available'; end if;
  if g.kind = 'rally' and (p_data->>'stage')::integer is distinct from g.rally_stage then return public.pin_and_spin_solo_view(g); end if;
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
  if g.kind = 'rally' then
    if v_score[1] = g.slots then
      g.solved := g.solved + 1;
      g.rally_history := g.rally_history || jsonb_build_array(jsonb_build_object('stage', g.rally_stage, 'guesses', g.guesses));
      if g.rally_stage = 4 then
        g.status := 'won'; g.finished_at := clock_timestamp();
      else
        g.rally_stage := g.rally_stage + 1;
        g.slots := case when g.rally_stage = 2 then 4 else g.rally_stage + 2 end;
        loop
          g.secret := public.pin_and_spin_code_n(6, true, g.slots);
          exit when g.rally_stage <> 2 or (select count(distinct c) from unnest(g.secret) c) < 4;
        end loop;
        g.guesses := '[]'::jsonb;
        g.deadline := clock_timestamp() + interval '3 minutes';
      end if;
    elsif v_tries + 1 >= g.max_tries then g.status := 'lost'; g.finished_at := clock_timestamp();
    end if;
  elsif g.kind = 'clock' then
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
    last_secret = g.last_secret, secret = g.secret, status = g.status, finished_at = g.finished_at,
    rally_stage = g.rally_stage, rally_history = g.rally_history, slots = g.slots, deadline = g.deadline where id = g.id;
  result := public.pin_and_spin_solo_view(g);
  -- Clock: say what happened to the last code (the phone shows it, then the new code).
  if g.kind = 'clock' and jsonb_array_length(g.guesses) = 0 then
    result := result || jsonb_build_object('lastResult', case when v_score[1] = g.slots then 'solved' else 'skipped' end);
  end if;
  return result;
end;
$$;

revoke all on function public.pin_and_spin_solo_view(public.pin_and_spin_solo_games), public.pin_and_spin_solo(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pin_and_spin_solo_view(public.pin_and_spin_solo_games), public.pin_and_spin_solo(text, uuid, jsonb) to service_role;
