-- Pin & Spin migration 006: leaderboard of multiplayer wins (signed-in players only).
-- When a match finishes, one result row is stored per signed-in participant. Participants are
-- the players still in the room at the end plus anyone who left after playing a guess (so
-- leaving a losing game still counts as a loss). Matches with fewer than 2 players are not
-- recorded. Guests are never stored. Safe to run more than once.
create table if not exists public.pin_and_spin_results (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.pin_and_spin_rooms on delete cascade,
  puzzle integer not null,
  mode text not null,
  user_id uuid not null,
  won boolean not null,
  players integer not null,
  finished_at timestamptz not null default now(),
  unique (room_id, puzzle, user_id)
);
create index if not exists pin_and_spin_results_user_idx on public.pin_and_spin_results(user_id, finished_at);
create index if not exists pin_and_spin_results_time_idx on public.pin_and_spin_results(finished_at);
comment on table public.pin_and_spin_results is 'One row per signed-in player per finished multiplayer match (leaderboard)';
alter table public.pin_and_spin_results enable row level security;

create or replace function public.pin_and_spin_record_results()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  -- Everyone who took part: still in the room, or left after playing at least one guess.
  select count(*) into n from public.pin_and_spin_players p where p.room_id = new.id and (p.active or exists(
    select 1 from public.pin_and_spin_guesses g where g.room_id = new.id and g.puzzle = new.puzzle and g.player_id = p.id and g.colors is not null));
  if n < 2 then return null; end if;
  insert into public.pin_and_spin_results(room_id, puzzle, mode, user_id, won, players)
    select new.id, new.puzzle, new.mode, p.user_id, p.id = any(new.winners), n
    from public.pin_and_spin_players p
    where p.room_id = new.id and p.user_id is not null and (p.active or exists(
      select 1 from public.pin_and_spin_guesses g where g.room_id = new.id and g.puzzle = new.puzzle and g.player_id = p.id and g.colors is not null))
    on conflict (room_id, puzzle, user_id) do nothing;
  return null;
exception when others then
  return null; -- The leaderboard must never block a game from finishing.
end;
$$;
revoke all on function public.pin_and_spin_record_results() from public, anon, authenticated;

drop trigger if exists pin_and_spin_rooms_results on public.pin_and_spin_rooms;
create trigger pin_and_spin_rooms_results after update on public.pin_and_spin_rooms
  for each row when (old.status = 'playing' and new.status = 'finished')
  execute function public.pin_and_spin_record_results();

-- Public leaderboard: top 50 by wins (fewer games breaks ties), plus the caller's own row.
-- p_period: 'week' = last 7 days, 'all' = all time. Only nicknames and counts are returned.
create or replace function public.pin_and_spin_leaderboard(p_period text default 'week', p_account uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare since timestamptz := case when p_period = 'all' then '-infinity'::timestamptz else now() - interval '7 days' end;
  result jsonb;
begin
  if p_period not in ('week', 'all') then raise exception 'Choose a leaderboard period'; end if;
  with totals as (
    select r.user_id, count(*) filter (where r.won)::integer as wins, count(*)::integer as games
    from public.pin_and_spin_results r where r.finished_at >= since group by r.user_id
  ), ranked as (
    select t.*, rank() over (order by t.wins desc, t.games asc)::integer as place,
      coalesce(nullif(left(btrim(pr.nickname), 20), ''), 'Player') as name
    from totals t left join public.profiles pr on pr.id = t.user_id
  )
  select jsonb_build_object(
    'period', p_period,
    'players', coalesce((select jsonb_agg(jsonb_build_object('rank', place, 'name', name, 'wins', wins, 'games', games,
        'me', user_id = p_account) order by place, name) from (select * from ranked order by place, name limit 50) top), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', place, 'name', name, 'wins', wins, 'games', games) from ranked where user_id = p_account)
  ) into result;
  return result;
end;
$$;

-- Matches that are already finished right now (their latest puzzle) count too.
insert into public.pin_and_spin_results(room_id, puzzle, mode, user_id, won, players, finished_at)
  select r.id, r.puzzle, r.mode, p.user_id, p.id = any(r.winners), c.n, now()
  from public.pin_and_spin_rooms r
  cross join lateral (select count(*)::integer n from public.pin_and_spin_players q where q.room_id = r.id and (q.active or exists(
    select 1 from public.pin_and_spin_guesses g where g.room_id = r.id and g.puzzle = r.puzzle and g.player_id = q.id and g.colors is not null))) c
  join public.pin_and_spin_players p on p.room_id = r.id and p.user_id is not null and (p.active or exists(
    select 1 from public.pin_and_spin_guesses g where g.room_id = r.id and g.puzzle = r.puzzle and g.player_id = p.id and g.colors is not null))
  where r.status = 'finished' and c.n >= 2
  on conflict (room_id, puzzle, user_id) do nothing;

revoke all on public.pin_and_spin_results from public, anon, authenticated;
revoke all on function public.pin_and_spin_leaderboard(text, uuid) from public, anon, authenticated;
grant all on public.pin_and_spin_results to service_role;
grant execute on function public.pin_and_spin_leaderboard(text, uuid) to service_role;
