-- Pin & Spin migration 009: more leaderboards and achievements (signed-in players).
--   Leaderboards: 'multi' (multiplayer wins, as in 006), 'daily' (daily puzzles solved),
--   'clock' (best Beat the Clock score) and 'story' (story stars; all time only).
--   Achievements: badges awarded automatically by triggers when matches, solo games or story
--   levels finish. The award function only ever adds badges. Safe to run more than once.

-- Replaces the two-argument leaderboard from 006 (callers using named p_period/p_account
-- keep working: p_board defaults to 'multi').
drop function if exists public.pin_and_spin_leaderboard(text, uuid);
create or replace function public.pin_and_spin_leaderboard(p_period text default 'week', p_account uuid default null, p_board text default 'multi')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare since timestamptz := case when p_period = 'all' or p_board = 'story' then '-infinity'::timestamptz else now() - interval '7 days' end;
  result jsonb;
begin
  if p_period not in ('week', 'all') then raise exception 'Choose a leaderboard period'; end if;
  if p_board not in ('multi', 'daily', 'clock', 'story') then raise exception 'Choose a leaderboard'; end if;
  -- score ranks first, then tie (lower is better). a / b are the numbers shown.
  with totals as (
    select r.user_id, count(*) filter (where r.won)::numeric as score, count(*)::numeric as tie,
      count(*) filter (where r.won)::numeric as a, count(*)::numeric as b
      from public.pin_and_spin_results r where p_board = 'multi' and r.finished_at >= since group by r.user_id
    union all
    select g.user_id, count(*) filter (where g.status = 'won'),
      coalesce(avg(jsonb_array_length(g.guesses)) filter (where g.status = 'won'), 99),
      count(*) filter (where g.status = 'won'), round(coalesce(avg(jsonb_array_length(g.guesses)) filter (where g.status = 'won'), 0), 1)
      from public.pin_and_spin_solo_games g where p_board = 'daily' and g.kind = 'daily' and g.status <> 'playing'
        and g.day >= (since at time zone 'utc')::date group by g.user_id having count(*) filter (where g.status = 'won') > 0
    union all
    select g.user_id, max(g.solved), -count(*), max(g.solved), count(*)
      from public.pin_and_spin_solo_games g where p_board = 'clock' and g.kind = 'clock' and g.status = 'done'
        and g.started_at >= since group by g.user_id having max(g.solved) > 0
    union all
    select p.user_id, sum(p.stars), -count(*), sum(p.stars), count(*)
      from public.pin_and_spin_story_progress p where p_board = 'story' group by p.user_id
  ), ranked as (
    select t.*, rank() over (order by t.score desc, t.tie asc)::integer as place,
      coalesce(nullif(left(btrim(pr.nickname), 20), ''), 'Player') as name
    from totals t left join public.profiles pr on pr.id = t.user_id
  )
  select jsonb_build_object(
    'period', p_period, 'board', p_board,
    'players', coalesce((select jsonb_agg(jsonb_build_object('rank', place, 'name', name, 'a', a, 'b', b,
        'wins', a, 'games', b, 'me', user_id = p_account) order by place, name)
      from (select * from ranked order by place, name limit 50) top), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', place, 'name', name, 'a', a, 'b', b, 'wins', a, 'games', b) from ranked where user_id = p_account)
  ) into result;
  return result;
end;
$$;

create table if not exists public.pin_and_spin_achievements (
  user_id uuid not null,
  code text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);
comment on table public.pin_and_spin_achievements is 'Badges earned by signed-in players';
alter table public.pin_and_spin_achievements enable row level security;

-- Checks every badge for one player and adds the ones now earned. Never removes any.
create or replace function public.pin_and_spin_award(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare earned text[] := '{}'; wins integer; best_streak integer := 0; run integer := 0; prev date; d record;
begin
  if p_user is null then return; end if;
  -- Multiplayer
  select count(*) filter (where won) into wins from public.pin_and_spin_results where user_id = p_user;
  if wins >= 1 then earned := array_append(earned, 'first_win'); end if;
  if wins >= 10 then earned := array_append(earned, 'wins_10'); end if;
  if wins >= 50 then earned := array_append(earned, 'wins_50'); end if;
  if exists (select 1 from public.pin_and_spin_results where user_id = p_user and won and players >= 6) then earned := array_append(earned, 'big_room'); end if;
  if (select count(distinct mode) from public.pin_and_spin_results where user_id = p_user and won) >= 4 then earned := array_append(earned, 'all_modes'); end if;
  -- Daily puzzle
  if exists (select 1 from public.pin_and_spin_solo_games where user_id = p_user and kind = 'daily' and status = 'won') then earned := array_append(earned, 'daily_first'); end if;
  for d in select day, status from public.pin_and_spin_solo_games where user_id = p_user and kind = 'daily' and status <> 'playing' order by day loop
    run := case when d.status = 'won' then case when prev = d.day - 1 then run + 1 else 1 end else 0 end;
    best_streak := greatest(best_streak, run); prev := d.day;
  end loop;
  if best_streak >= 3 then earned := array_append(earned, 'streak_3'); end if;
  if best_streak >= 7 then earned := array_append(earned, 'streak_7'); end if;
  if best_streak >= 30 then earned := array_append(earned, 'streak_30'); end if;
  -- Solo
  if exists (select 1 from public.pin_and_spin_solo_games where user_id = p_user and kind in ('daily', 'practice', 'story')
      and status = 'won' and jsonb_array_length(guesses) = 1 and jsonb_array_length(clues) = 0) then earned := array_append(earned, 'first_try'); end if;
  if exists (select 1 from public.pin_and_spin_solo_games where user_id = p_user and kind in ('daily', 'practice')
      and status = 'won' and jsonb_array_length(guesses) <= 3) then earned := array_append(earned, 'mind_reader'); end if;
  if exists (select 1 from public.pin_and_spin_solo_games where user_id = p_user and kind = 'practice' and level = 'hard' and status = 'won') then earned := array_append(earned, 'hard_win'); end if;
  if exists (select 1 from public.pin_and_spin_solo_games where user_id = p_user and kind = 'clock' and solved >= 5) then earned := array_append(earned, 'clock_5'); end if;
  if exists (select 1 from public.pin_and_spin_solo_games where user_id = p_user and kind = 'clock' and solved >= 10) then earned := array_append(earned, 'clock_10'); end if;
  -- Story
  if exists (select 1 from (select l.world, count(p.level) = count(*) done from public.pin_and_spin_story_levels l
      left join public.pin_and_spin_story_progress p on p.level = l.level and p.user_id = p_user group by l.world) w where world = 1 and done) then earned := array_append(earned, 'world_1'); end if;
  if exists (select 1 from (select l.world, count(p.level) = count(*) done from public.pin_and_spin_story_levels l
      left join public.pin_and_spin_story_progress p on p.level = l.level and p.user_id = p_user group by l.world) w where world = 2 and done) then earned := array_append(earned, 'world_2'); end if;
  if exists (select 1 from (select l.world, count(p.level) = count(*) done from public.pin_and_spin_story_levels l
      left join public.pin_and_spin_story_progress p on p.level = l.level and p.user_id = p_user group by l.world) w where world = 3 and done) then earned := array_append(earned, 'world_3'); end if;
  if not exists (select 1 from public.pin_and_spin_story_levels l where l.kind = 'logic' and not exists (
      select 1 from public.pin_and_spin_story_progress p where p.user_id = p_user and p.level = l.level)) then earned := array_append(earned, 'logic_master'); end if;
  if not exists (select 1 from public.pin_and_spin_story_levels l where not exists (
      select 1 from public.pin_and_spin_story_progress p where p.user_id = p_user and p.level = l.level and p.stars = 3)) then earned := array_append(earned, 'perfectionist'); end if;
  insert into public.pin_and_spin_achievements(user_id, code) select p_user, c from unnest(earned) c on conflict do nothing;
exception when others then
  null; -- Badges must never block a game.
end;
$$;

create or replace function public.pin_and_spin_award_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.pin_and_spin_award(new.user_id);
  return null;
end;
$$;
drop trigger if exists pin_and_spin_results_award on public.pin_and_spin_results;
create trigger pin_and_spin_results_award after insert on public.pin_and_spin_results
  for each row execute function public.pin_and_spin_award_trigger();
drop trigger if exists pin_and_spin_solo_award on public.pin_and_spin_solo_games;
create trigger pin_and_spin_solo_award after update on public.pin_and_spin_solo_games
  for each row when (old.status = 'playing' and new.status <> 'playing') execute function public.pin_and_spin_award_trigger();
drop trigger if exists pin_and_spin_story_progress_award on public.pin_and_spin_story_progress;
create trigger pin_and_spin_story_progress_award after insert or update on public.pin_and_spin_story_progress
  for each row execute function public.pin_and_spin_award_trigger();

-- The player's badges (codes and dates). Also re-checks, so badges for past play appear.
create or replace function public.pin_and_spin_achievements_for(p_account uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to see your achievements'; end if;
  perform public.pin_and_spin_award(p_account);
  return jsonb_build_object('earned', coalesce((select jsonb_object_agg(code, earned_at) from public.pin_and_spin_achievements
    where user_id = p_account), '{}'::jsonb));
end;
$$;

revoke all on public.pin_and_spin_achievements from public, anon, authenticated;
revoke all on function public.pin_and_spin_leaderboard(text, uuid, text), public.pin_and_spin_award(uuid),
  public.pin_and_spin_award_trigger(), public.pin_and_spin_achievements_for(uuid) from public, anon, authenticated;
grant all on public.pin_and_spin_achievements to service_role;
grant execute on function public.pin_and_spin_leaderboard(text, uuid, text), public.pin_and_spin_award(uuid),
  public.pin_and_spin_achievements_for(uuid) to service_role;
