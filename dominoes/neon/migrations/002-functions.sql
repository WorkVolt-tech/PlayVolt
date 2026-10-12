create or replace function public.unique_nickname(p_base text, p_uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text := nullif(trim(p_base), '');
  candidate text;
  suffix    text := substr(replace(p_uid::text, '-', ''), 1, 4);
  i         int  := 0;
begin
  if base is null then base := 'Player'; end if;
  candidate := base;

  while exists (select 1 from public.profiles where nickname = candidate) loop
    i := i + 1;
    if i = 1 then
      candidate := base || '_' || suffix;
    else
      candidate := base || '_' || suffix || i::text;
    end if;
  end loop;

  return candidate;
end;
$$;

create or replace function public.increment_profile_stats(
  p_user_id  uuid,
  p_games    integer default 0,
  p_wins     integer default 0,
  p_vyej     integer default 0,
  p_dekabess integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set
    total_games    = coalesce(total_games,    0) + p_games,
    total_vyej     = coalesce(total_vyej,     0) + p_vyej,
    total_dekabess = coalesce(total_dekabess, 0) + p_dekabess,
    round_streak   = case when p_wins > 0
                          then coalesce(round_streak, 0) + 1
                          else 0
                     end,
    updated_at     = now()
  where id = p_user_id;
end;
$$;

create or replace function public.play_move(
  p_room_id     uuid,
  p_seat        integer,
  p_action      text,
  p_tile        jsonb,
  p_board       jsonb,
  p_hand        jsonb,
  p_advance     boolean,
  p_check_block boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turn integer;
  v_cnt  integer;
  v_pass integer;
  v_n integer;           -- players at this table (2, 3 or 4)
begin
  select coalesce(seat_count, 4) into v_n from public.domino_rooms where id = p_room_id;
  -- Lock the room row: two moves in the same room can't interleave.
  select current_turn into v_turn
  from public.domino_rooms
  where id = p_room_id
  for update;

  -- Only the player whose turn it is may move. A double tap (pass or
  -- place) arrives after the first one already advanced the turn, so it
  -- lands here and writes nothing — instead of advancing a second time
  -- and skipping the next player.
  if v_turn is not null and v_turn <> p_seat then
    return jsonb_build_object('blocked', false, 'stale', true);
  end if;

  -- With tiles left in the pile you draw — you can't knock.
  if p_action = 'pass' and exists (
       select 1 from public.domino_rooms
        where id = p_room_id and coalesce(jsonb_array_length(pile), 0) > 0) then
    raise exception 'Draw from the pile — you can only knock once it''s empty';
  end if;

  if p_board is not null then
    update public.board b
       set tiles     = r.tiles,
           left_end  = r.left_end,
           right_end = r.right_end
      from jsonb_populate_record(null::public.board, p_board) r
     where b.room_id = p_room_id;
  end if;

  if p_hand is not null then
    update public.domino_players dp
       set hand = r.hand
      from jsonb_populate_record(
             null::public.domino_players,
             jsonb_build_object('hand', p_hand)
           ) r
     where dp.room_id = p_room_id
       and dp.seat    = p_seat;
  end if;

  insert into public.game_events (room_id, player_seat, action, tile)
  select r.room_id, r.player_seat, r.action, r.tile
    from jsonb_populate_record(
           null::public.game_events,
           jsonb_build_object(
             'room_id',     p_room_id,
             'player_seat', p_seat,
             'action',      p_action,
             'tile',        p_tile
           )
         ) r;

  -- Same check the app ran: the last v_n events all passes = blocked
  -- (everyone at the table knocked in a row).
  if p_check_block then
    select count(*), count(*) filter (where action = 'pass')
      into v_cnt, v_pass
      from (
        select action
          from public.game_events
         where room_id = p_room_id
         order by created_at desc
         limit v_n
      ) s;

    if v_cnt = v_n and v_pass = v_n then
      return jsonb_build_object('blocked', true);
    end if;
  end if;

  -- Same advance the app did: current_turn + 1, falling back to
  -- the mover's seat if unset.
  if p_advance then
    update public.domino_rooms
       set current_turn = (coalesce(v_turn, p_seat) + 1) % v_n
     where id = p_room_id;
  end if;

  -- A tile was placed: if nobody at the table can play either end (and the
  -- pile, if any, is empty), the table is blocked right now — no need to
  -- wait for everyone to knock. The app ends the round on lowest pips.
  if p_action = 'place' then
    declare v_l int; v_r int; v_tiles int;
    begin
      select left_end, right_end, coalesce(jsonb_array_length(tiles), 0) into v_l, v_r, v_tiles
        from public.board where room_id = p_room_id;
      if v_tiles > 0 and v_l is not null
         and not exists (select 1 from public.domino_rooms
                          where id = p_room_id and coalesce(jsonb_array_length(pile), 0) > 0)
         and exists (select 1 from public.domino_players
                      where room_id = p_room_id and seat < v_n and coalesce(jsonb_array_length(hand), 0) > 0)
         and not exists (
           select 1 from public.domino_players p, jsonb_array_elements(coalesce(p.hand, '[]'::jsonb)) t
            where p.room_id = p_room_id and p.seat < v_n
              and ((t ->> 0)::int in (v_l, v_r) or (t ->> 1)::int in (v_l, v_r))) then
        return jsonb_build_object('blocked', true);
      end if;
    end;
  end if;

  return jsonb_build_object('blocked', false);
end;
$$;

create or replace function public.ensure_story_progress()
returns public.story_progress
language plpgsql
security definer
set search_path = public
as $$
declare row_out public.story_progress;
begin
  insert into public.story_progress (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select * into row_out from public.story_progress where user_id = auth.uid();
  return row_out;
end;
$$;

create or replace function public.record_challenge(
  p_chapter          integer,
  p_challenge        integer,
  p_stars            integer default 0,
  p_complete_chapter boolean default false,
  p_unlock_bot       text    default null
)
returns public.story_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  k         text := p_chapter::text;
  ck        text := p_challenge::text;
  done      jsonb;
  row_out   public.story_progress;
  prev_star integer;
begin
  perform public.ensure_story_progress();

  select completed_challenges -> k into done
    from public.story_progress where user_id = auth.uid();
  if done is null then done := '[]'::jsonb; end if;

  -- add this challenge if it isn't already listed
  if not (done @> to_jsonb(p_challenge)) then
    done := done || to_jsonb(p_challenge);
  end if;

  select coalesce((stars -> k ->> ck)::integer, 0) into prev_star
    from public.story_progress where user_id = auth.uid();

  update public.story_progress set
    completed_challenges = jsonb_set(completed_challenges, array[k], done, true),
    -- NOTE: jsonb_set only creates the LAST key in a path, so writing
    -- stars->chapter->challenge silently does nothing when the chapter key
    -- doesn't exist yet. Merge the nested object instead.
    stars = coalesce(stars, '{}'::jsonb) || jsonb_build_object(
              k,
              coalesce(stars -> k, '{}'::jsonb) || jsonb_build_object(
                ck, to_jsonb(greatest(prev_star, coalesce(p_stars, 0)))
              )
            ),
    chapter_attempts = jsonb_set(
              coalesce(chapter_attempts, '{}'::jsonb),
              array[k],
              to_jsonb(coalesce((chapter_attempts ->> k)::integer, 0) + 1),
              true),
    completed_chapters = case
      when p_complete_chapter and not (completed_chapters @> array[p_chapter])
        then completed_chapters || p_chapter
      else completed_chapters end,
    current_chapter = case
      when p_complete_chapter and p_chapter >= current_chapter
        then p_chapter + 1
      else current_chapter end,
    unlocked_bots = case
      when p_unlock_bot is not null and not (unlocked_bots @> array[p_unlock_bot])
        then unlocked_bots || p_unlock_bot
      else unlocked_bots end,
    updated_at = now()
  where user_id = auth.uid();

  select * into row_out from public.story_progress where user_id = auth.uid();
  return row_out;
end;
$$;

create or replace function public.forfeit_match(p_match_id uuid, p_present uuid)
returns public.tournament_matches
language plpgsql
security definer
set search_path = public
as $$
declare m public.tournament_matches; sid uuid; side_ids uuid[];
begin
  select * into m from public.tournament_matches where id = p_match_id for update;
  if m.status = 'done' then return m; end if;
  if m.no_show_at is null or now() < m.no_show_at then
    raise exception 'the wait is not over yet';
  end if;

  side_ids := array_remove(array[m.side_a, m.side_b, m.side_c, m.side_d], null);
  update public.tournament_matches
     set status = 'forfeit', winner_side = p_present
   where id = p_match_id;
  foreach sid in array side_ids loop
    if sid <> p_present then
      update public.tournament_sides set eliminated = true where id = sid;
    end if;
  end loop;
  select * into m from public.tournament_matches where id = p_match_id;
  return m;
end;
$$;

create or replace function public.create_tournament(p_name text, p_format text default 'duo')
returns public.tournaments
language plpgsql security definer set search_path = public
as $$
declare t public.tournaments;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_format not in ('duo','solo') then raise exception 'format must be duo or solo'; end if;
  insert into public.tournaments (name, format, created_by)
  values (p_name, p_format, auth.uid())
  returning * into t;
  return t;
end;
$$;

create or replace function public.create_side(p_tournament uuid, p_name text, p_nickname text)
returns public.tournament_sides
language plpgsql security definer set search_path = public
as $$
declare
  s     public.tournament_sides;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c     text;
  i     int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if exists (select 1 from public.tournaments where id = p_tournament and status <> 'registration')
    then raise exception 'registration is closed'; end if;
  if exists (
    select 1 from public.tournament_members m
      join public.tournament_sides sd on sd.id = m.side_id
     where sd.tournament_id = p_tournament and m.user_id = auth.uid())
    then raise exception 'you are already registered'; end if;

  loop
    c := '';
    for i in 1..6 loop c := c || substr(chars, 1 + floor(random()*length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.tournament_sides where code = c);
  end loop;

  insert into public.tournament_sides (tournament_id, name, code)
  values (p_tournament, p_name, c)
  returning * into s;

  insert into public.tournament_members (side_id, user_id, nickname, checked_in)
  values (s.id, auth.uid(), p_nickname, true);
  return s;
end;
$$;

create or replace function public.join_side(p_code text, p_nickname text)
returns public.tournament_sides
language plpgsql security definer set search_path = public
as $$
declare s public.tournament_sides; fmt text; n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  select * into s from public.tournament_sides where code = upper(p_code);
  if s.id is null then raise exception 'no team with that code'; end if;

  select format into fmt from public.tournaments where id = s.tournament_id;
  if fmt <> 'duo' then raise exception 'this is a solo tournament'; end if;
  if exists (select 1 from public.tournaments where id = s.tournament_id and status <> 'registration')
    then raise exception 'registration is closed'; end if;

  select count(*) into n from public.tournament_members where side_id = s.id;
  if n >= 2 then raise exception 'that team is already full'; end if;
  if exists (
    select 1 from public.tournament_members m
      join public.tournament_sides sd on sd.id = m.side_id
     where sd.tournament_id = s.tournament_id and m.user_id = auth.uid())
    then raise exception 'you are already registered'; end if;

  insert into public.tournament_members (side_id, user_id, nickname, checked_in)
  values (s.id, auth.uid(), p_nickname, true);
  return s;
end;
$$;

create or replace function public.fill_missing_partner(p_side uuid, p_bot text)
returns public.tournament_members
language plpgsql security definer set search_path = public
as $$
declare mem public.tournament_members; n int;
begin
  if not exists (select 1 from public.tournament_members
                  where side_id = p_side and user_id = auth.uid())
    then raise exception 'that is not your team'; end if;
  select count(*) into n from public.tournament_members where side_id = p_side;
  if n >= 2 then raise exception 'your team is already complete'; end if;

  -- experts are earned in Story Mode; ordinary bots are always allowed
  if p_bot in ('Ti-Jòj','Ti-Tid','Ti-Roro','Ti-Chasè','Ti-Frè','Ti-Chaj','Ti-Pyèj','Ti-Wa')
     and not exists (select 1 from public.story_progress sp
                      where sp.user_id = auth.uid() and p_bot = any(sp.unlocked_bots))
  then
    raise exception 'that expert is still locked — beat their Story Mode chapter first';
  end if;

  insert into public.tournament_members (side_id, user_id, nickname, bot_name, checked_in)
  values (p_side, null, p_bot, p_bot, true)
  returning * into mem;
  return mem;
end;
$$;

create or replace function public.start_tournament(p_tournament uuid)
returns setof public.tournament_matches
language plpgsql security definer set search_path = public
as $$
declare
  fmt      text;
  owner    uuid;
  ids      uuid[];
  n        int;
  target   int;
  per      int;
  i        int;
  bot_id   uuid;
begin
  select format, created_by into fmt, owner from public.tournaments where id = p_tournament;
  if owner is null then raise exception 'no such tournament'; end if;
  if owner <> auth.uid() then raise exception 'only the organiser can start it'; end if;

  select array_agg(id order by created_at) into ids
    from public.tournament_sides where tournament_id = p_tournament;
  n := coalesce(array_length(ids,1), 0);
  per := case when fmt = 'solo' then 4 else 2 end;
  if n < 1 then raise exception 'nobody has entered yet'; end if;

  -- Round up to a full bracket, filling the gaps with expert bot sides.
  -- One human team is enough to start: the rest of the bracket is bots.
  -- A solo cup needs four at a table, so one player gets three bots.
  target := per;
  while target < n loop target := target * 2; end loop;

  while n < target loop
    insert into public.tournament_sides (tournament_id, name, is_bot, code)
    values (p_tournament, 'Bot Pair ' || (n + 1), true, null)
    returning id into bot_id;
    ids := ids || bot_id;
    n := n + 1;
  end loop;

  -- give the filler bot sides real names, so the bracket shows who they are
  -- and matches between them can be simulated on their actual strengths
  begin
    perform public.name_bot_sides(p_tournament);
  exception when undefined_function then
    null;   -- tournament_sim.sql not installed yet; names stay generic
  end;

  update public.tournaments set status = 'running' where id = p_tournament;

  i := 1;
  while i <= n loop
    if per = 2 then
      insert into public.tournament_matches (tournament_id, round, slot, side_a, side_b, status, no_show_at)
      values (p_tournament, 1, (i + 1) / 2, ids[i], ids[i+1], 'waiting', now() + interval '5 minutes');
      i := i + 2;
    else
      insert into public.tournament_matches (tournament_id, round, slot, side_a, side_b, side_c, side_d, status, no_show_at)
      values (p_tournament, 1, (i + 3) / 4, ids[i], ids[i+1], ids[i+2], ids[i+3], 'waiting', now() + interval '5 minutes');
      i := i + 4;
    end if;
  end loop;

  return query select * from public.tournament_matches
    where tournament_id = p_tournament and round = 1 order by slot;
end;
$$;

create or replace function public.advance_bracket(p_tournament uuid)
returns setof public.tournament_matches
language plpgsql security definer set search_path = public
as $$
declare
  fmt     text;
  last_r  int;
  pending int;
  winners uuid[];
  per     int;
  i       int;
begin
  select format into fmt from public.tournaments where id = p_tournament;
  per := case when fmt = 'solo' then 4 else 2 end;

  select max(round) into last_r from public.tournament_matches where tournament_id = p_tournament;
  if last_r is null then raise exception 'the bracket has not started'; end if;

  select count(*) into pending from public.tournament_matches
    where tournament_id = p_tournament and round = last_r and status not in ('done','forfeit');
  if pending > 0 then raise exception 'round % still has % match(es) to finish', last_r, pending; end if;

  select array_agg(winner_side order by slot) into winners
    from public.tournament_matches
   where tournament_id = p_tournament and round = last_r and winner_side is not null;

  if coalesce(array_length(winners,1),0) <= 1 then
    update public.tournaments set status = 'finished' where id = p_tournament;
    return;
  end if;

  i := 1;
  while i <= array_length(winners,1) loop
    if per = 2 then
      insert into public.tournament_matches (tournament_id, round, slot, side_a, side_b, status, no_show_at)
      values (p_tournament, last_r + 1, (i + 1) / 2, winners[i], winners[i+1], 'waiting', now() + interval '5 minutes');
      i := i + 2;
    else
      insert into public.tournament_matches (tournament_id, round, slot, side_a, side_b, side_c, side_d, status, no_show_at)
      values (p_tournament, last_r + 1, (i + 3) / 4, winners[i], winners[i+1], winners[i+2], winners[i+3], 'waiting', now() + interval '5 minutes');
      i := i + 4;
    end if;
  end loop;

  return query select * from public.tournament_matches
    where tournament_id = p_tournament and round = last_r + 1 order by slot;
end;
$$;

create or replace function public.start_tournament_match(p_match uuid)
returns public.domino_rooms
language plpgsql security definer set search_path = public
as $$
declare
  m        public.tournament_matches;
  fmt      text;
  room     public.domino_rooms;
  v_code   text;
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i        int;
  seat     int;
  sides    uuid[];
  side     uuid;
  mem      record;
  seats_of int[];
  idx      int;
  tiles    int[][];
  deck     jsonb;
  hands    jsonb[] := '{}';
  map      jsonb := '{}'::jsonb;
  starting int := 0;
  botnames text[];
  botn     int := 1;
begin
  select * into m from public.tournament_matches where id = p_match for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.room_id is not null then
    select * into room from public.domino_rooms where id = m.room_id;
    if room.id is not null and room.status <> 'finished' then return room; end if;
  end if;

  select format into fmt from public.tournaments where id = m.tournament_id;

  -- An empty seat (a partner who never joined, and no stand-in chosen) gets a
  -- bot the ORGANISER has earned — never a locked expert.
  botnames := public.organiser_bot_pool(m.tournament_id);
  -- Sides with a PERSON in them are seated first, so seat 0 is always a
  -- human. Only seat 0's device runs the bots — with a bot in seat 0,
  -- nobody would, and the game would freeze on the first bot turn.
  select array_agg(x.sid order by x.has_human desc, x.ord)
    into sides
    from (
      select u.sid, u.ord,
             exists (select 1 from public.tournament_members tm
                      where tm.side_id = u.sid and tm.user_id is not null) as has_human
        from unnest(array[m.side_a, m.side_b, m.side_c, m.side_d]) with ordinality as u(sid, ord)
       where u.sid is not null
    ) x;

  loop
    v_code := '';
    for i in 1..6 loop v_code := v_code || substr(chars, 1 + floor(random()*length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.domino_rooms r where r.code = v_code);
  end loop;

  insert into public.domino_rooms (code, status, current_turn, game_mode, round, tournament_match_id)
  values (v_code, 'waiting', 0, case when fmt = 'duo' then 'asosye' else 'chien' end, 1, p_match)
  returning * into room;

  -- deal 28 tiles, 7 each
  deck := (
    select jsonb_agg(t order by random())
      from (select jsonb_build_array(a,b) t
              from generate_series(0,6) a, generate_series(0,6) b
             where b >= a) z
  );

  for idx in 1..array_length(sides,1) loop
    side := sides[idx];
    if fmt = 'duo' then
      seats_of := case when idx = 1 then array[0,2] else array[1,3] end;
    else
      seats_of := array[idx - 1];
    end if;

    i := 1;
    for mem in
      select * from public.tournament_members where side_id = side
       order by (user_id is null), id          -- humans before AI partners
    loop
      if i > array_length(seats_of,1) then exit; end if;
      seat := seats_of[i];
      insert into public.domino_players (room_id, seat, nickname, hand, is_connected, is_ai, user_id)
      values (room.id, seat,
              coalesce(mem.bot_name, mem.nickname),
              jsonb_build_array(),
              true,
              mem.bot_name is not null,
              mem.user_id);
      map := map || jsonb_build_object(seat::text, side::text);
      i := i + 1;
    end loop;

    -- any seat this side didn't fill gets a bot
    while i <= array_length(seats_of,1) loop
      seat := seats_of[i];
      insert into public.domino_players (room_id, seat, nickname, hand, is_connected, is_ai)
      values (room.id, seat, botnames[botn], jsonb_build_array(), true, true);
      botn := botn + 1; if botn > array_length(botnames, 1) then botn := 1; end if;
      map := map || jsonb_build_object(seat::text, side::text);
      i := i + 1;
    end loop;
  end loop;

  -- hands: seven tiles each, taken in order from the shuffled deck
  declare v_seat int;
  begin
    for v_seat in 0..3 loop
      update public.domino_players p
         set hand = (select jsonb_agg(e.value)
                       from jsonb_array_elements(deck) with ordinality e(value, ord)
                      where e.ord between v_seat*7 + 1 and v_seat*7 + 7)
       where p.room_id = room.id and p.seat = v_seat;
    end loop;
  end;

  -- Whoever holds the 6-6 opens.
  -- NOTE: hand @> '[[6,6]]' does NOT work here — jsonb containment matches
  -- any tile that contains a 6 (so [2,6] would count). Compare elements.
  select p.seat into starting
    from public.domino_players p
   where p.room_id = room.id
     and exists (select 1 from jsonb_array_elements(p.hand) t where t.value = '[6,6]'::jsonb)
   limit 1;

  insert into public.board (room_id, tiles, left_end, right_end)
  values (room.id, '[]'::jsonb, null, null)
  on conflict do nothing;

  update public.domino_rooms
     set status = 'playing',
         current_turn = coalesce(starting, 0),
         side_by_seat = map,
         streak = jsonb_build_object('seat', null, 'team', null, 'count', 0),
         scores = '[0,0,0,0]'::jsonb
   where id = room.id
  returning * into room;

  update public.tournament_matches
     set room_id = room.id, status = 'playing'
   where id = p_match;

  return room;
end;
$$;

create or replace function public.tournament_round_watch()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  winner uuid;
  m      public.tournament_matches;
  sid    uuid;
begin
  if new.tournament_match_id is null then return new; end if;
  if new.status not in ('round_end','finished') then return new; end if;
  if old.status = new.status then return new; end if;

  winner := (new.side_by_seat ->> new.current_turn::text)::uuid;
  if winner is null then return new; end if;

  m := public.report_round(new.tournament_match_id, winner, coalesce(new.pending_point, false));

  -- The table ended in a Vyèj: that team won, whatever else happened.
  if new.status = 'finished' and m.status <> 'done' then
    update public.tournament_matches
       set status = 'done', winner_side = winner
     where id = m.id;
    foreach sid in array array_remove(array[m.side_a, m.side_b, m.side_c, m.side_d], null) loop
      if sid <> winner then
        update public.tournament_sides set eliminated = true where id = sid;
      end if;
    end loop;
  end if;

  -- The bracket decided the match (the knockout) while the table only saw
  -- a round end: finish the room too, so nobody plays on.
  if new.status = 'round_end' and m.status = 'done' then
    update public.domino_rooms
       set status       = 'finished',
           ended_by     = 'knockout',
           match_winner = case
                            when new.game_mode = 'asosye'
                              then case when new.current_turn in (0, 2) then 'A' else 'B' end
                            else new.current_turn::text
                          end
     where id = new.id;
  end if;

  return new;
end;
$$;

create or replace function public.record_round_stats(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare r jsonb; n integer := 0; t boolean;
begin
  for r in select * from jsonb_array_elements(p_results) loop
    if (r ->> 'user_id') is null then continue; end if;
    t := coalesce((r ->> 'trophy')::boolean, false);
    update public.profiles set
      total_games    = coalesce(total_games, 0) + (case when (r ->> 'match_over')::boolean then 1 else 0 end),
      total_vyej     = coalesce(total_vyej, 0)  + (case when (r ->> 'vyej')::boolean then 1 else 0 end),
      total_dekabess = coalesce(total_dekabess, 0) + (case when (r ->> 'dekabess')::boolean then 1 else 0 end),
      trophy_games    = coalesce(trophy_games, 0)    + (case when t and (r ->> 'match_over')::boolean then 1 else 0 end),
      trophy_vyej     = coalesce(trophy_vyej, 0)     + (case when t and (r ->> 'vyej')::boolean then 1 else 0 end),
      trophy_dekabess = coalesce(trophy_dekabess, 0) + (case when t and (r ->> 'dekabess')::boolean then 1 else 0 end),
      round_streak   = case when (r ->> 'won')::boolean then coalesce(round_streak, 0) + 1 else 0 end,
      updated_at     = now()
    where id = (r ->> 'user_id')::uuid;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.touch_domino_room()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.touch_room_from_child()
returns trigger
language plpgsql
as $$
begin
  update public.domino_rooms set updated_at = now()
   where id = coalesce(new.room_id, old.room_id);
  return new;
end;
$$;

create or replace function public.cleanup_domino_data()
returns void
language plpgsql
as $$
begin
  delete from public.domino_rooms
   where status in ('finished', 'abandoned', 'round_end')
     and created_at < now() - interval '24 hours';

  delete from public.domino_rooms
   where status = 'waiting'
     and created_at < now() - interval '2 hours';

  delete from public.domino_rooms
   where status = 'playing'
     and updated_at < now() - interval '6 hours'
     and tournament_match_id is null;

  -- practice rooms are disposable
  delete from public.domino_rooms
   where practice and updated_at < now() - interval '1 hour';

  perform public.cleanup_tournaments();

  delete from public.game_events    where room_id not in (select id from public.domino_rooms);
  delete from public.board          where room_id not in (select id from public.domino_rooms);
  delete from public.domino_players where room_id not in (select id from public.domino_rooms);

  -- settle finished weeks (award their prize tables) BEFORE clearing them
  perform public.settle_wa_tab_la();
  delete from public.wa_tab_la
   where week_start < date_trunc('week', now())::date;
end;
$$;

create or replace function public.start_partner_practice(p_side uuid)
returns public.domino_rooms
language plpgsql security definer set search_path = public
as $$
declare
  room     public.domino_rooms;
  v_code   text;
  chars    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i        int;
  seat     int;
  mem      record;
  seats_of int[] := array[0, 2];      -- partners sit across from each other
  deck     jsonb;
  starting int;
  botnames text[] := array['Ti-Djo', 'Ti-Cam'];
begin
  if not exists (select 1 from public.tournament_members
                  where side_id = p_side and user_id = auth.uid())
    then raise exception 'that is not your team'; end if;

  loop
    v_code := '';
    for i in 1..6 loop v_code := v_code || substr(chars, 1 + floor(random()*length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.domino_rooms r where r.code = v_code);
  end loop;

  insert into public.domino_rooms (code, status, current_turn, game_mode, round, practice)
  values (v_code, 'waiting', 0, 'asosye', 1, true)
  returning * into room;

  deck := (
    select jsonb_agg(t order by random())
      from (select jsonb_build_array(a,b) t
              from generate_series(0,6) a, generate_series(0,6) b
             where b >= a) z
  );

  i := 1;
  for mem in
    select * from public.tournament_members
     where side_id = p_side and bot_name is null order by id
  loop
    exit when i > 2;
    insert into public.domino_players (room_id, seat, nickname, hand, is_connected, is_ai, user_id)
    values (room.id, seats_of[i], mem.nickname, jsonb_build_array(), true, false, mem.user_id);
    i := i + 1;
  end loop;

  -- opponents, and a bot for a partner who isn't here
  while i <= 2 loop
    insert into public.domino_players (room_id, seat, nickname, hand, is_connected, is_ai)
    values (room.id, seats_of[i], botnames[i], jsonb_build_array(), true, true);
    i := i + 1;
  end loop;

  insert into public.domino_players (room_id, seat, nickname, hand, is_connected, is_ai)
  values (room.id, 1, botnames[1], jsonb_build_array(), true, true),
         (room.id, 3, botnames[2], jsonb_build_array(), true, true);

  declare v_seat int;
  begin
    for v_seat in 0..3 loop
      update public.domino_players p
         set hand = (select jsonb_agg(e.value)
                       from jsonb_array_elements(deck) with ordinality e(value, ord)
                      where e.ord between v_seat*7 + 1 and v_seat*7 + 7)
       where p.room_id = room.id and p.seat = v_seat;
    end loop;
  end;

  select p.seat into starting
    from public.domino_players p
   where p.room_id = room.id
     and exists (select 1 from jsonb_array_elements(p.hand) t where t.value = '[6,6]'::jsonb)
   limit 1;

  insert into public.board (room_id, tiles, left_end, right_end)
  values (room.id, '[]'::jsonb, null, null)
  on conflict do nothing;

  update public.domino_rooms
     set status = 'playing',
         current_turn = coalesce(starting, 0),
         streak = jsonb_build_object('seat', null, 'team', null, 'count', 0),
         scores = '[0,0,0,0]'::jsonb
   where id = room.id
  returning * into room;

  return room;
end;
$$;

create or replace function public.cleanup_practice_rooms()
returns void
language sql
as $$
  delete from public.domino_rooms
   where practice and updated_at < now() - interval '1 hour';
$$;

create or replace function public.resolve_bot_matches(p_tournament uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  m       record;
  sides   uuid[];
  humans  int;
  ratings numeric[];
  total   numeric;
  pick    numeric;
  acc     numeric;
  winner  uuid;
  i       int;
  guard   int;
  n       int := 0;
  -- about 1 in 12 rounds is won by Dekabess
  dek     boolean;
begin
  for m in
    select * from public.tournament_matches
     where tournament_id = p_tournament
       and status not in ('done','forfeit')
     order by round, slot
  loop
    sides := array_remove(array[m.side_a, m.side_b, m.side_c, m.side_d], null);
    if array_length(sides,1) is null then continue; end if;

    select count(*) into humans
      from public.tournament_members mem
     where mem.side_id = any(sides) and mem.user_id is not null;
    if humans > 0 then continue; end if;

    ratings := array[]::numeric[];
    total := 0;
    for i in 1..array_length(sides,1) loop
      ratings := ratings || public.side_rating(sides[i]);
      total := total + ratings[i];
    end loop;

    guard := 0;
    loop
      exit when guard > 200;
      guard := guard + 1;
      pick := random() * total;
      acc := 0;
      winner := sides[1];
      for i in 1..array_length(sides,1) loop
        acc := acc + ratings[i];
        if pick <= acc then winner := sides[i]; exit; end if;
      end loop;
      dek := random() < 0.08;
      perform public.report_round(m.id, winner, dek);
      exit when (select status from public.tournament_matches where id = m.id) = 'done';
    end loop;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.tournament_champion(p_tournament uuid)
returns public.tournament_sides
language sql stable security definer set search_path = public
as $$
  select * from public.tournament_sides
   where tournament_id = p_tournament and not eliminated
   limit 1;
$$;

create or replace function public.bot_rating(p_name text)
returns numeric
language sql immutable
as $$
  select case
    -- experts
    when p_name ilike '%Ti-Roro%'   then 76.0
    when p_name ilike '%Ti-Pyèj%' or p_name ilike '%Ti-Pyej%' then 74.4
    when p_name ilike '%Ti-Chasè%' or p_name ilike '%Ti-Chase%' then 73.6
    when p_name ilike '%Ti-Wa%'    then 73.6
    when p_name ilike '%Ti-Chaj%'  then 73.2
    when p_name ilike '%Ti-Jòj%' or p_name ilike '%Ti-Joj%' then 72.7
    when p_name ilike '%Ti-Tid%'   then 72.4
    when p_name ilike '%Ti-Frè%' or p_name ilike '%Ti-Fre%' then 72.4
    -- ordinary bots
    when p_name ilike '%Ti-Doub%'   then 28.0
    when p_name ilike '%Ti-Mèt%' or p_name ilike '%Ti-Met%' then 26.4
    when p_name ilike '%Ti-Djo%'    then 26.1
    when p_name ilike '%Ti-Pridan%' then 26.0
    when p_name ilike '%Ti-Jean%'   then 25.0
    when p_name ilike '%Ti-Cam%'    then 25.0
    when p_name ilike '%Ti-Sak%'    then 21.3
    when p_name ilike '%Ti-Bebe%'   then 14.4
    else 50.0
  end;
$$;

create or replace function public.side_rating(p_side uuid)
returns numeric
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select avg(public.bot_rating(coalesce(m.bot_name, m.nickname)))
       from public.tournament_members m
      where m.side_id = p_side),
    73.0);
$$;

create or replace function public.name_bot_sides(p_tournament uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  s       record;
  fmt     text;
  roster  text[];
  a       text; b text;
  n       int := 0;
begin
  select format into fmt from public.tournaments where id = p_tournament;
  -- filler teams come from what the organiser has earned
  roster := public.organiser_bot_pool(p_tournament);
  for s in
    select sd.* from public.tournament_sides sd
     where sd.tournament_id = p_tournament and sd.is_bot
       and not exists (select 1 from public.tournament_members m where m.side_id = sd.id)
  loop
    a := roster[1 + floor(random()*array_length(roster,1))::int];
    loop
      b := roster[1 + floor(random()*array_length(roster,1))::int];
      exit when b <> a or fmt = 'solo' or array_length(roster, 1) < 2;
    end loop;

    insert into public.tournament_members (side_id, nickname, bot_name, checked_in)
    values (s.id, a, a, true);
    if fmt = 'duo' then
      insert into public.tournament_members (side_id, nickname, bot_name, checked_in)
      values (s.id, b, b, true);
      update public.tournament_sides set name = a || ' & ' || b where id = s.id;
    else
      update public.tournament_sides set name = a where id = s.id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.stamp_tournament_end()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('finished','cancelled') and coalesce(old.status,'') <> new.status then
    new.ended_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.cleanup_tournaments()
returns integer
language plpgsql
as $$
declare gone integer;
begin
  -- the rooms those matches were played in
  delete from public.domino_rooms r
   using public.tournament_matches m, public.tournaments t
   where r.tournament_match_id = m.id
     and m.tournament_id = t.id
     and t.status in ('finished','cancelled')
     and t.ended_at is not null
     and t.ended_at < now() - interval '15 minutes';

  -- finished or cancelled, 15 minutes on
  with removed as (
    delete from public.tournaments
     where status in ('finished','cancelled')
       and ended_at is not null
       and ended_at < now() - interval '15 minutes'
    returning 1
  )
  select count(*) into gone from removed;

  -- never started, and nobody has touched them for a day
  delete from public.tournaments
   where status = 'registration'
     and created_at < now() - interval '24 hours';

  return gone;
end;
$$;

create or replace function public.add_bot_side(
  p_tournament uuid,
  p_bot_a      text,
  p_bot_b      text default null
)
returns public.tournament_sides
language plpgsql security definer set search_path = public
as $$
declare
  s     public.tournament_sides;
  fmt   text;
  owner uuid;
  nm    text;
begin
  select format, created_by into fmt, owner
    from public.tournaments where id = p_tournament;
  if owner is null then raise exception 'no such tournament'; end if;
  if owner <> auth.uid() then raise exception 'only the organiser can add AI teams'; end if;
  if exists (select 1 from public.tournaments
              where id = p_tournament and status <> 'registration')
    then raise exception 'registration is closed'; end if;

  -- Experts are earned in Story Mode. An organiser can only field the
  -- experts they have unlocked; ordinary bots are always allowed.
  if exists (
    select 1
      from unnest(array[p_bot_a, p_bot_b]) as b(name)
     where b.name in ('Ti-Jòj','Ti-Tid','Ti-Roro','Ti-Chasè','Ti-Frè','Ti-Chaj','Ti-Pyèj','Ti-Wa')
       and not exists (
         select 1 from public.story_progress sp
          where sp.user_id = auth.uid()
            and b.name = any(sp.unlocked_bots))
  ) then
    raise exception 'that expert is still locked — beat their Story Mode chapter first';
  end if;

  if fmt = 'duo' then
    if p_bot_b is null then raise exception 'a team needs two bots'; end if;
    nm := p_bot_a || ' & ' || p_bot_b;
  else
    nm := p_bot_a;
  end if;

  insert into public.tournament_sides (tournament_id, name, is_bot)
  values (p_tournament, nm, true)
  returning * into s;

  insert into public.tournament_members (side_id, nickname, bot_name, checked_in)
  values (s.id, p_bot_a, p_bot_a, true);

  if fmt = 'duo' then
    insert into public.tournament_members (side_id, nickname, bot_name, checked_in)
    values (s.id, p_bot_b, p_bot_b, true);
  end if;

  return s;
end;
$$;

create or replace function public.remove_bot_side(p_side uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare owner uuid; st text; isbot boolean; tid uuid;
begin
  select s.tournament_id, s.is_bot into tid, isbot
    from public.tournament_sides s where s.id = p_side;
  if tid is null then raise exception 'no such entry'; end if;
  if not isbot then raise exception 'that is a real team'; end if;

  select created_by, status into owner, st from public.tournaments where id = tid;
  if owner <> auth.uid() then raise exception 'only the organiser can remove AI teams'; end if;
  if st <> 'registration' then raise exception 'registration is closed'; end if;

  delete from public.tournament_sides where id = p_side;
  return true;
end;
$$;

create or replace function public.report_round(
  p_match_id uuid,
  p_winner   uuid,
  p_dekabess boolean default false
)
returns public.tournament_matches
language plpgsql
security definer
set search_path = public
as $$
declare
  m        public.tournament_matches;
  k        text := p_winner::text;
  new_wins jsonb;
  new_str  jsonb;
  new_dek  jsonb;
  loser    uuid;
  side_ids uuid[];
  sid      uuid;
  fmt      text;
  add      int := case when p_dekabess then 2 else 1 end;
begin
  select * into m from public.tournament_matches where id = p_match_id for update;
  if m.id is null then raise exception 'no such match'; end if;
  if m.status in ('done', 'forfeit') then return m; end if;

  select format into fmt from public.tournaments where id = m.tournament_id;

  side_ids := array_remove(array[m.side_a, m.side_b, m.side_c, m.side_d], null);
  if not (p_winner = any(side_ids)) then raise exception 'winner is not in this match'; end if;

  new_wins := coalesce(m.wins, '{}'::jsonb)
              || jsonb_build_object(k, coalesce((m.wins ->> k)::int, 0) + 1);

  new_dek := coalesce(m.deks, '{}'::jsonb);
  if p_dekabess then
    new_dek := new_dek || jsonb_build_object(k, coalesce((new_dek ->> k)::int, 0) + 1);
  end if;

  -- the streak, counted exactly as the table counts it
  new_str := '{}'::jsonb;
  foreach sid in array side_ids loop
    if sid = p_winner then
      new_str := new_str || jsonb_build_object(sid::text, coalesce((m.streaks ->> sid::text)::int, 0) + add);
    else
      new_str := new_str || jsonb_build_object(sid::text, 0);
    end if;
  end loop;

  -- 2v2 only: a team on 3 or more that just lost the round is out
  loser := null;
  if fmt = 'duo' then
    foreach sid in array side_ids loop
      if sid <> p_winner and coalesce((m.streaks ->> sid::text)::int, 0) >= 3 then
        loser := sid;
      end if;
    end loop;
  end if;

  if loser is not null or (new_str ->> k)::int >= 4 then
    update public.tournament_matches set
      wins = new_wins, streaks = new_str, deks = new_dek, last_winner = p_winner,
      status = 'done', winner_side = p_winner
    where id = p_match_id;
    foreach sid in array side_ids loop
      if sid <> p_winner then
        update public.tournament_sides set eliminated = true where id = sid;
      end if;
    end loop;
  else
    update public.tournament_matches set
      wins = new_wins, streaks = new_str, deks = new_dek, last_winner = p_winner, status = 'playing'
    where id = p_match_id;
  end if;

  select * into m from public.tournament_matches where id = p_match_id;
  return m;
end;
$$;

create or replace function public.delete_tournament(p_tournament uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare owner uuid;
begin
  select created_by into owner from public.tournaments where id = p_tournament;
  if owner is null then raise exception 'no such tournament'; end if;
  if owner <> auth.uid() then raise exception 'only the organiser can delete it'; end if;

  -- the rooms its matches were played in
  delete from public.domino_rooms r
   using public.tournament_matches m
   where r.tournament_match_id = m.id
     and m.tournament_id = p_tournament;

  -- sides, members and matches go with it (on delete cascade)
  delete from public.tournaments where id = p_tournament;

  -- tidy anything the room deletes left behind
  delete from public.game_events    where room_id not in (select id from public.domino_rooms);
  delete from public.board          where room_id not in (select id from public.domino_rooms);
  delete from public.domino_players where room_id not in (select id from public.domino_rooms);
  return true;
end;
$$;

create or replace function public.remove_ai_partner(p_side uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare st text;
begin
  if not exists (select 1 from public.tournament_members
                  where side_id = p_side and user_id = auth.uid())
    then raise exception 'that is not your team'; end if;
  select t.status into st
    from public.tournament_sides s join public.tournaments t on t.id = s.tournament_id
   where s.id = p_side;
  if st <> 'registration' then raise exception 'registration is closed'; end if;

  delete from public.tournament_members where side_id = p_side and bot_name is not null;
  return true;
end;
$$;

create or replace function public.organiser_bot_pool(p_tournament uuid)
returns text[]
language sql stable security definer set search_path = public
as $$
  select array_cat(
    array['Ti-Bebe','Ti-Pridan','Ti-Sak','Ti-Cam','Ti-Mèt','Ti-Jean','Ti-Djo','Ti-Doub'],
    coalesce((
      select array_agg(x.name)
        from unnest(array['Ti-Jòj','Ti-Tid','Ti-Roro','Ti-Chasè','Ti-Frè','Ti-Chaj','Ti-Pyèj','Ti-Wa']) as x(name)
       where x.name = any(coalesce(
               (select sp.unlocked_bots
                  from public.story_progress sp
                  join public.tournaments t on t.created_by = sp.user_id
                 where t.id = p_tournament), '{}'::text[]))
    ), '{}'::text[])
  );
$$;

create or replace function public.count_tournament_win()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare all_expert boolean;
begin
  if new.status = 'finished' and coalesce(old.status, '') <> 'finished' then
    select not exists (
      select 1
        from public.tournament_sides s
        join public.tournament_members m on m.side_id = s.id
       where s.tournament_id = new.id
         and m.bot_name is not null
         and m.bot_name <> all (array['Ti-Jòj','Ti-Tid','Ti-Roro','Ti-Chasè','Ti-Frè','Ti-Chaj','Ti-Pyèj','Ti-Wa'])
    ) into all_expert;
    update public.profiles p
       set total_tournaments_won  = coalesce(p.total_tournaments_won, 0) + 1,
           trophy_tournaments_won = coalesce(p.trophy_tournaments_won, 0) + (case when all_expert then 1 else 0 end)
     where p.id in (
       select m.user_id
         from public.tournament_sides s
         join public.tournament_members m on m.side_id = s.id
        where s.tournament_id = new.id
          and not s.eliminated
          and m.user_id is not null
     );
  end if;
  return new;
end;
$$;

create or replace function public.record_feat(p_kind text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if p_kind = 'clean_round' then
    update public.profiles set total_clean_rounds = total_clean_rounds + 1 where id = auth.uid();
  elsif p_kind = 'comeback' then
    update public.profiles set total_comebacks = total_comebacks + 1 where id = auth.uid();
  elsif p_kind = 'five_doubles' then
    update public.profiles set total_five_double_rounds = total_five_double_rounds + 1 where id = auth.uid();
  elsif p_kind = 'five_doubles_won' then
    update public.profiles set total_five_double_wins = total_five_double_wins + 1 where id = auth.uid();
  end if;
end;
$$;

create or replace function public.draw_tile(p_room_id uuid, p_seat integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room  public.domino_rooms;
  v_board public.board;
  v_hand  jsonb;
  v_tile  jsonb;
begin
  if not public.can_play_room(p_room_id) then raise exception 'Room access denied'; end if;
  -- one draw at a time per table
  select * into v_room from public.domino_rooms where id = p_room_id for update;
  if v_room.id is null or v_room.status <> 'playing' then
    return jsonb_build_object('ok', false, 'reason', 'not playing');
  end if;
  if v_room.current_turn is distinct from p_seat then
    return jsonb_build_object('ok', false, 'reason', 'not your turn');
  end if;
  if coalesce(jsonb_array_length(v_room.pile), 0) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'pile empty');
  end if;

  -- you only draw when you can't play
  select * into v_board from public.board where room_id = p_room_id;
  select coalesce(hand, '[]'::jsonb) into v_hand from public.domino_players where room_id = p_room_id and seat = p_seat;
  if v_board.room_id is not null and coalesce(jsonb_array_length(v_board.tiles), 0) > 0 and exists (
       select 1 from jsonb_array_elements(v_hand) t
        where (t ->> 0)::int in (v_board.left_end, v_board.right_end)
           or (t ->> 1)::int in (v_board.left_end, v_board.right_end)) then
    return jsonb_build_object('ok', false, 'reason', 'you can play');
  end if;

  v_tile := v_room.pile -> 0;
  update public.domino_rooms set pile = pile - 0 where id = p_room_id;
  update public.domino_players set hand = v_hand || jsonb_build_array(v_tile)
   where room_id = p_room_id and seat = p_seat;
  insert into public.game_events (room_id, player_seat, action, tile) values (p_room_id, p_seat, 'draw', v_tile);
  return jsonb_build_object('ok', true, 'tile', v_tile, 'left', jsonb_array_length(v_room.pile) - 1);
end;
$$;

create or replace function public.reshuffle_round(p_room_id uuid, p_seat integer)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_room   public.domino_rooms;
  v_hand   jsonb;
  v_n      integer;
  v_pile   boolean;
  v_per    integer;
  v_tiles  jsonb;
  v_left   jsonb;
  v_turn   integer;
  v_open   jsonb := null;
  i        integer;
  d        integer;
begin
  if not public.can_play_room(p_room_id) then raise exception 'Room access denied'; end if;
  select * into v_room from public.domino_rooms where id = p_room_id for update;
  if v_room.id is null or v_room.status <> 'playing' then
    return jsonb_build_object('ok', false, 'reason', 'not playing');
  end if;
  if v_room.game_mode in ('asosye', 'duo') then        -- partner games: anything goes
    return jsonb_build_object('ok', false, 'reason', 'not in partner games');
  end if;
  if exists (select 1 from public.board where room_id = p_room_id and coalesce(jsonb_array_length(tiles), 0) > 0) then
    return jsonb_build_object('ok', false, 'reason', 'the round has started');
  end if;
  select coalesce(hand, '[]'::jsonb) into v_hand from public.domino_players where room_id = p_room_id and seat = p_seat;
  if (select count(*) from jsonb_array_elements(v_hand) t where (t ->> 0) = (t ->> 1)) < 5 then
    return jsonb_build_object('ok', false, 'reason', 'fewer than 5 doubles');
  end if;

  -- the same kind of deal as before
  v_n    := coalesce(v_room.seat_count, 4);
  v_pile := v_room.deal_variant = 'pile' and v_n < 4;
  v_per  := case when v_pile then 7 when v_n = 3 then 9 when v_n = 2 then 14 else 7 end;
  select jsonb_agg(jsonb_build_array(a, b) order by random()) into v_tiles
    from generate_series(0, 6) a, generate_series(0, 6) b
   where b >= a and not (v_n = 3 and not v_pile and a = 0 and b = 0);   -- 3 players, no pile: 0-0 out

  for i in 0 .. v_n - 1 loop
    update public.domino_players
       set hand = (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                     from jsonb_array_elements(v_tiles) with ordinality x(e, o)
                    where o > i * v_per and o <= (i + 1) * v_per)
     where room_id = p_room_id and seat = i;
  end loop;
  select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_left
    from jsonb_array_elements(v_tiles) with ordinality x(e, o) where o > v_n * v_per;

  -- who opens: a first round follows the opening rule again (the 6-6, or with
  -- a pile the highest double held); a later round keeps the same winner
  v_turn := v_room.current_turn;
  if coalesce(v_room.round, 1) = 1 then
    v_turn := 0;
    for d in reverse 6 .. 0 loop
      -- (each tile tested exactly: "hand @> [[d,d]]" would match any tile with a d)
      select seat into i from public.domino_players
       where room_id = p_room_id and seat < v_n
         and exists (select 1 from jsonb_array_elements(hand) t
                      where (t ->> 0)::int = d and (t ->> 1)::int = d)
       limit 1;
      if found then v_turn := i; v_open := jsonb_build_array(d, d); exit; end if;
    end loop;
  end if;

  update public.domino_rooms
     set pile = case when v_pile then v_left else '[]'::jsonb end,
         current_turn = v_turn,
         opening_tile = v_open,
         deal_no = coalesce(deal_no, 0) + 1
   where id = p_room_id;
  update public.board set tiles = '[]'::jsonb, left_end = null, right_end = null where room_id = p_room_id;
  delete from public.game_events where room_id = p_room_id;
  return jsonb_build_object('ok', true, 'deal_no', coalesce(v_room.deal_no, 0) + 1);
end;
$$;

create or replace function public.keep_deal(p_room_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.can_play_room(p_room_id) then raise exception 'Room access denied'; end if;
 update public.domino_rooms set deal_decided=coalesce(round,1)::text||':'||coalesce(deal_no,0)::text where id=p_room_id;
end; $$;

create or replace function public.wa_tab_la_prize(p_week date)
returns text
language sql immutable
as $$
  select (array['tiger', 'viking', 'marron', 'jazz', 'negmaron'])[((((p_week - date '2026-01-05') / 7) % 5 + 5) % 5) + 1];
$$;

create or replace function public.wa_tab_la_win(p_player_id text, p_nickname text, p_mode text, p_week_start date)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.wa_tab_la (player_id, player_nickname, mode, week_start, wins, user_id)
  values (p_player_id, p_nickname, p_mode, p_week_start, 1, auth.uid())
  on conflict (player_id, week_start, mode) do update
    set wins = public.wa_tab_la.wins + 1,
        player_nickname = excluded.player_nickname,
        user_id = coalesce(auth.uid(), public.wa_tab_la.user_id);
end;
$$;

create or replace function public.settle_wa_tab_la()
returns integer
language plpgsql security definer set search_path = public
as $$
declare r record; n integer := 0; v_top integer; v_prize text;
begin
  if not pg_try_advisory_xact_lock(87344101) then return 0; end if;
  for r in
    select distinct w.week_start, w.mode from public.wa_tab_la w
     where w.week_start < date_trunc('week', now())::date
       and w.mode is not null
       and not exists (select 1 from public.wa_tab_la_settled s where s.week_start = w.week_start and s.mode = w.mode)
  loop
    -- a signed-in player's wins from every device count together (one total
    -- per account); guests count per device
    select max(total) into v_top from (
      select sum(wins) as total from public.wa_tab_la
       where week_start = r.week_start and mode = r.mode
       group by coalesce(user_id::text, 'device:' || player_id)) t;
    v_prize := public.wa_tab_la_prize(r.week_start);
    if coalesce(v_top, 0) > 0 then
      insert into public.table_unlocks (user_id, skin, source, week_start)
      select t.user_id, v_prize, 'wa_tab_la', r.week_start
        from (select user_id, sum(wins) as total from public.wa_tab_la
               where week_start = r.week_start and mode = r.mode and user_id is not null
               group by user_id) t
       where t.total = v_top
      on conflict (user_id, skin) do nothing;
    end if;
    insert into public.wa_tab_la_settled (week_start, mode, prize) values (r.week_start, r.mode, v_prize)
    on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.my_friend_code()
returns text language sql security definer set search_path = public stable as $$
  select friend_code from public.profiles where id = auth.uid();
$$;

create or replace function public.friend_request_to(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f public.friendships;
begin
  if me is null then return 'sign in first'; end if;
  if p_user is null or p_user = me then return 'that''s you'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then return 'no such player'; end if;
  -- blocked either way: say nothing useful, change nothing
  if exists (select 1 from public.blocks where (blocker = p_user and blocked = me) or (blocker = me and blocked = p_user)) then
    return 'sent';
  end if;
  select * into f from public.friendships
   where least(requester, addressee) = least(me, p_user) and greatest(requester, addressee) = greatest(me, p_user);
  if f.id is null then
    insert into public.friendships (requester, addressee) values (me, p_user);
    return 'sent';
  elsif f.status = 'accepted' then
    return 'already friends';
  elsif f.addressee = me then
    update public.friendships set status = 'accepted', accepted_at = now() where id = f.id;   -- they'd asked you
    return 'now friends';
  else
    return 'already sent';
  end if;
end $$;

create or replace function public.friend_request_by_nickname(p_nickname text)
returns text language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select id into u from public.profiles where lower(nickname) = lower(trim(p_nickname)) limit 1;
  if u is null then return 'no such player'; end if;
  return public.friend_request_to(u);
end $$;

create or replace function public.friend_request_by_code(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select id into u from public.profiles where friend_code = upper(trim(p_code)) limit 1;
  if u is null then return 'no such player'; end if;
  return public.friend_request_to(u);
end $$;

create or replace function public.friend_respond(p_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
     where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end $$;

create or replace function public.friend_remove(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where least(requester, addressee) = least(auth.uid(), p_user)
     and greatest(requester, addressee) = greatest(auth.uid(), p_user);
end $$;

create or replace function public.friend_block(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_user = auth.uid() then return; end if;
  perform public.friend_remove(p_user);
  insert into public.blocks (blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
end $$;

create or replace function public.friend_unblock(p_user uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.blocks where blocker = auth.uid() and blocked = p_user;
$$;

create or replace function public.heartbeat(p_activity text default 'online')
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set last_seen = now(),
         activity = case when p_activity = 'game' then 'game' else 'online' end
   where id = auth.uid();
$$;

create or replace function public.my_friends()
returns table (id uuid, user_id uuid, nickname text, avatar text, kind text, since timestamptz, last_seen timestamptz, activity text)
language sql security definer set search_path = public stable as $$
  select f.id,
         case when f.requester = auth.uid() then f.addressee else f.requester end,
         p.nickname, p.avatar,
         case when f.status = 'accepted' then 'friend' when f.addressee = auth.uid() then 'incoming' else 'outgoing' end,
         coalesce(f.accepted_at, f.created_at),
         case when f.status = 'accepted' then p.last_seen end,
         case when f.status = 'accepted' then p.activity end
    from public.friendships f
    join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
   where auth.uid() in (f.requester, f.addressee)
  union all
  select null, b.blocked, p.nickname, p.avatar, 'blocked', b.created_at, null, null
    from public.blocks b join public.profiles p on p.id = b.blocked
   where b.blocker = auth.uid();
$$;

create or replace function public.challenge_friend(p_friend uuid, p_room uuid, p_code text, p_mode text)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return 'sign in first'; end if;
  if not exists (select 1 from public.friendships
                  where status = 'accepted'
                    and least(requester, addressee) = least(me, p_friend)
                    and greatest(requester, addressee) = greatest(me, p_friend)) then
    return 'not friends';
  end if;
  if exists (select 1 from public.blocks where (blocker = p_friend and blocked = me) or (blocker = me and blocked = p_friend)) then
    return 'sent';                                     -- blocked: quietly nothing
  end if;
  -- one open invitation per friend per room
  delete from public.friend_challenges where from_user = me and to_user = p_friend and room_id = p_room;
  insert into public.friend_challenges (from_user, to_user, room_id, room_code, mode)
  values (me, p_friend, p_room, upper(p_code), coalesce(p_mode, 'chien'));
  return 'sent';
end $$;

create or replace function public.my_challenges()
returns table (id uuid, from_user uuid, nickname text, avatar text, room_code text, mode text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select c.id, c.from_user, p.nickname, p.avatar, c.room_code, c.mode, c.created_at
    from public.friend_challenges c join public.profiles p on p.id = c.from_user
   where c.to_user = auth.uid() and c.status = 'pending' and c.created_at > now() - interval '5 minutes'
   order by c.created_at desc;
$$;

create or replace function public.challenge_respond(p_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare c public.friend_challenges;
begin
  select * into c from public.friend_challenges
   where id = p_id and to_user = auth.uid() and status = 'pending' and created_at > now() - interval '5 minutes';
  if c.id is null then return null; end if;
  update public.friend_challenges set status = case when p_accept then 'accepted' else 'declined' end where id = p_id;
  return case when p_accept then c.room_code else null end;
end $$;

CREATE OR REPLACE FUNCTION public.ensure_profile() RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.profiles; nick text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
 PERFORM pg_advisory_xact_lock(87344102);
 SELECT * INTO result FROM public.profiles WHERE id=auth.uid();
 IF result.id IS NULL THEN
  SELECT name INTO nick FROM neon_auth."user" WHERE id=auth.uid();
  INSERT INTO public.profiles(id,nickname,friend_code) VALUES(auth.uid(),public.unique_nickname(left(coalesce(nick,'Player'),16),auth.uid()),upper(substr(md5(auth.uid()::text || 'dekabess-friends'),1,8))) RETURNING * INTO result;
 END IF;
 RETURN result;
END; $$;

create trigger domino_rooms_tournament_watch
  after update on public.domino_rooms
  for each row execute function public.tournament_round_watch();

create trigger domino_rooms_touch
  before update on public.domino_rooms
  for each row execute function public.touch_domino_room();

create trigger domino_players_touch_room
  after insert or update on public.domino_players
  for each row execute function public.touch_room_from_child();

create trigger board_touch_room
  after insert or update on public.board
  for each row execute function public.touch_room_from_child();

create trigger tournaments_stamp_end
  before update on public.tournaments
  for each row execute function public.stamp_tournament_end();

create trigger tournaments_count_win
  after update on public.tournaments
  for each row execute function public.count_tournament_win();
