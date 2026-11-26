-- Trophy-gated cosmetics for Duel, Code Rally and Rally Relay.
create index if not exists pin_and_spin_duels_winner_idx on public.pin_and_spin_duels(winner) where status='finished';

create or replace function public.pin_and_spin_award(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare earned text[] := '{}'; wins integer; duel_wins integer; rally_wins integer; relay_wins integer; best_streak integer := 0; run integer := 0; prev date; d record;
begin
  if p_user is null then return; end if;
  -- Multiplayer
  select count(*) filter (where won) into wins from public.pin_and_spin_results where user_id = p_user;
  if wins >= 1 then earned := array_append(earned, 'first_win'); end if;
  if wins >= 10 then earned := array_append(earned, 'wins_10'); end if;
  if wins >= 50 then earned := array_append(earned, 'wins_50'); end if;
  if exists (select 1 from public.pin_and_spin_results where user_id = p_user and won and players >= 6) then earned := array_append(earned, 'big_room'); end if;
  if (select count(distinct mode) from public.pin_and_spin_results where user_id = p_user and won) >= 4 then earned := array_append(earned, 'all_modes'); end if;
  -- Count completed mode results, including matches played before these trophies existed.
  select count(*) into duel_wins from public.pin_and_spin_duels where status='finished' and winner=p_user;
  select count(*) filter (where mode='rally'),count(*) filter (where mode='relay')
    into rally_wins,relay_wins from public.pin_and_spin_results where user_id=p_user and won and mode in ('rally','relay');
  rally_wins := rally_wins + (select count(*) from public.pin_and_spin_solo_games
    where user_id=p_user and kind='rally' and status='won' and solved=4);
  if duel_wins >= 1 then earned := array_append(earned, 'duel_first'); end if;
  if duel_wins >= 5 then earned := array_append(earned, 'duel_five'); end if;
  if rally_wins >= 1 then earned := array_append(earned, 'rally_first'); end if;
  if rally_wins >= 5 then earned := array_append(earned, 'rally_five'); end if;
  if relay_wins >= 1 then earned := array_append(earned, 'relay_first'); end if;
  if relay_wins >= 5 then earned := array_append(earned, 'relay_five'); end if;
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
  if exists (select 1 from (select l.world, count(p.level) = count(*) done from public.pin_and_spin_story_levels l
      left join public.pin_and_spin_story_progress p on p.level = l.level and p.user_id = p_user group by l.world) w where world = 4 and done) then earned := array_append(earned, 'world_4'); end if;
  if exists (select 1 from (select l.world, count(p.level) = count(*) done from public.pin_and_spin_story_levels l
      left join public.pin_and_spin_story_progress p on p.level = l.level and p.user_id = p_user group by l.world) w where world = 5 and done) then earned := array_append(earned, 'world_5'); end if;
  if not exists (select 1 from public.pin_and_spin_story_levels l where l.kind = 'logic' and not exists (
      select 1 from public.pin_and_spin_story_progress p where p.user_id = p_user and p.level = l.level)) then earned := array_append(earned, 'logic_master'); end if;
  if not exists (select 1 from public.pin_and_spin_story_levels l where not exists (
      select 1 from public.pin_and_spin_story_progress p where p.user_id = p_user and p.level = l.level and p.stars = 3)) then earned := array_append(earned, 'perfectionist'); end if;
  insert into public.pin_and_spin_achievements(user_id, code) select p_user, c from unnest(earned) c on conflict do nothing;
exception when others then
  null; -- Badges must never block a game.
end;
$$;

revoke all on function public.pin_and_spin_award(uuid) from public, anon, authenticated;
grant execute on function public.pin_and_spin_award(uuid) to service_role;

create or replace function public.pin_and_spin_valid_cosmetics(p_value jsonb, p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v jsonb := coalesce(p_value,'{}'::jsonb); k text; value text; requirement text; result jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(v) <> 'object' then raise exception 'Choose a valid style'; end if;
  for k, value in select key, val from jsonb_each_text(jsonb_build_object(
    'avatar',coalesce(v->>'avatar','initial'), 'board',coalesce(v->>'board','nebula'),
    'piece',coalesce(v->>'piece','round'), 'pin',coalesce(v->>'pin','round'),
    'accent',coalesce(v->>'accent','violet'))) as c(key,val)
  loop
    requirement := null;
    if k='avatar' then
      if value not in ('initial','bunny','bear','fox','wolf','cat','robot','champion','royal','carrot','crystal','onyx-knight','nitro-pilot','circuit-falcon','dragon') then raise exception 'Unknown avatar'; end if;
      requirement := case value when 'fox' then 'first_win' when 'wolf' then 'first_try' when 'cat' then 'hard_win' when 'robot' then 'world_2'
        when 'champion' then 'wins_10' when 'royal' then 'wins_50'
        when 'carrot' then 'world_1' when 'crystal' then 'world_4' when 'dragon' then 'world_5' when 'onyx-knight' then 'duel_five' when 'nitro-pilot' then 'rally_five' when 'circuit-falcon' then 'relay_five' end;
    elsif k='board' then
      if value not in ('nebula','arcade','waves','gold','prism','obsidian-arena','overdrive','night-circuit','crystal') then raise exception 'Unknown board style'; end if;
      requirement := case value when 'arcade' then 'first_win' when 'waves' then 'world_2'
        when 'gold' then 'wins_10' when 'prism' then 'all_modes' when 'crystal' then 'world_4' when 'obsidian-arena' then 'duel_first' when 'overdrive' then 'rally_first' when 'night-circuit' then 'relay_first' end;
    elsif k='piece' then
      if value not in ('round','square','star','gem','hex','shield','turbo-arrow','wing','crown') then raise exception 'Unknown piece shape'; end if;
      requirement := case value when 'square' then 'first_win' when 'star' then 'world_1'
        when 'gem' then 'world_3' when 'hex' then 'hard_win' when 'crown' then 'wins_50' when 'shield' then 'duel_five' when 'turbo-arrow' then 'rally_five' when 'wing' then 'relay_five' end;
    elsif k='pin' then
      if value not in ('round','square','crosshair','bolt','chevron','star') then raise exception 'Unknown result pin shape'; end if;
      requirement := case value when 'square' then 'world_2' when 'star' then 'perfectionist' when 'crosshair' then 'duel_first' when 'bolt' then 'rally_first' when 'chevron' then 'relay_first' end;
    else
      if value not in ('violet','teal','amber','rose','blue','lime','coral','ice','gold','orchid') then raise exception 'Unknown board color'; end if;
      requirement := case value when 'teal' then 'first_win' when 'amber' then 'world_1'
        when 'rose' then 'daily_first' when 'blue' then 'hard_win' when 'lime' then 'world_2'
        when 'coral' then 'big_room' when 'ice' then 'world_3' when 'gold' then 'wins_10'
        when 'orchid' then 'world_4' end;
    end if;
    if requirement is not null and (p_user is null or not exists(
      select 1 from public.pin_and_spin_achievements where user_id=p_user and code=requirement)) then
      raise exception 'Unlock this style by earning its trophy first';
    end if;
    result := jsonb_set(result,array[k],to_jsonb(value));
  end loop;
  return result;
end;
$$;


revoke all on function public.pin_and_spin_valid_cosmetics(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pin_and_spin_valid_cosmetics(jsonb,uuid) to service_role;

create or replace function public.pin_and_spin_duel_award() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.pin_and_spin_award(new.winner);
  return null;
end;
$$;
revoke all on function public.pin_and_spin_duel_award() from public,anon,authenticated;
drop trigger if exists pin_and_spin_duel_award on public.pin_and_spin_duels;
create trigger pin_and_spin_duel_award after update on public.pin_and_spin_duels
  for each row when (old.status <> 'finished' and new.status = 'finished' and new.winner is not null)
  execute function public.pin_and_spin_duel_award();
