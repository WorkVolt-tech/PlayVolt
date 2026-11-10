-- Pin & Spin migration 016: Story World 5 "Hourglass Desert" (levels 33-42).
-- Every level is against the clock, and the clocks get shorter: timed games with up to five
-- balls and eight colors, and timed logic puzzles (read the clues and name the code before the
-- time runs out). No new rules: levels already support a timer (`seconds`), and when it runs
-- out the level is lost, as in World 2-4. Finishing the world earns the 'world_5' badge
-- (pin_and_spin_award is migration 009's version plus that check). Badges already earned are
-- never removed. Safe to run more than once.
insert into public.pin_and_spin_story_levels(level, world, title, kind, colors, repeats, slots, tries, seconds, star2, star3, intro) values
  (33, 5, 'First Grains', 'game', 6, true, 4, 8, 90, 6, 4, 'Every vault in the desert has a clock. 90 seconds to start.'),
  (34, 5, 'Quick Read', 'logic', 6, true, 4, 2, 60, 2, 1, 'Read the clues and name the code before the minute is up.'),
  (35, 5, 'Mirage', 'game', 7, true, 4, 8, 75, 6, 4, 'Seven colors, 75 seconds.'),
  (36, 5, 'Sandstorm', 'game', 6, false, 5, 9, 90, 7, 5, 'Five balls, no repeats, 90 seconds.'),
  (37, 5, 'Dune Logic', 'logic', 7, false, 5, 2, 90, 2, 1, 'Five-ball clues against the clock.'),
  (38, 5, 'Sand Glass', 'game', 8, true, 4, 8, 60, 6, 5, 'All eight colors in one minute.'),
  (39, 5, 'Heatwave', 'game', 7, true, 5, 9, 120, 7, 6, 'Five balls, repeats allowed, 2 minutes.'),
  (40, 5, 'Blitz Logic', 'logic', 8, true, 4, 1, 60, 1, 1, 'One shot, eight colors, one minute.'),
  (41, 5, 'Last Oasis', 'game', 8, true, 5, 10, 150, 8, 6, 'Five balls, eight colors, two and a half minutes.'),
  (42, 5, 'Desert Boss', 'game', 8, true, 5, 9, 120, 8, 7, 'The final hourglass: 9 tries, 2 minutes.')
on conflict (level) do update set world = excluded.world, title = excluded.title, kind = excluded.kind, colors = excluded.colors,
  repeats = excluded.repeats, slots = excluded.slots, tries = excluded.tries, seconds = excluded.seconds, star2 = excluded.star2,
  star3 = excluded.star3, intro = excluded.intro;

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
