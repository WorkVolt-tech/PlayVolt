-- Speed Round synchronized start and ranked first/second/third drops.
-- All clocks use server timestamps; only room-locked server actions accept chips.
alter table public.drop_block_rooms
 add column if not exists speed_round_opens_at timestamptz,
 add column if not exists speed_previous_round integer,
 add column if not exists speed_previous_order jsonb not null default '[]'::jsonb;
alter table public.drop_block_speed_plays
 add column if not exists accepted_number integer;
-- Backfill any Speed Round submissions made before order tracking existed.
update public.drop_block_speed_plays sp
 set accepted_number=m.number
 from public.drop_block_moves m
 where sp.accepted_number is null
  and m.room_id=sp.room_id and m.match_number=sp.match_number
  and m.user_id=sp.user_id and m.round_after=sp.round_number
  and m.move_kind='drop';
create unique index if not exists drop_block_speed_accepted_order_unique
 on public.drop_block_speed_plays(room_id,accepted_number)
 where accepted_number is not null;
-- Authoritative submission order. The number is the same globally sequential
-- move number used by match history, not client timestamps or animation order.
create or replace function public.drop_block_speed_order(
 p_room_id uuid,p_match integer,p_round integer
) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('seat',ranked.seat,'place',ranked.place)
   order by ranked.place),'[]'::jsonb)
 from (
   select p.seat,row_number() over(
     order by p.accepted_number nulls last,p.placed_at,p.seat
   )::integer as place
   from public.drop_block_speed_plays p
   where p.room_id=p_room_id and p.match_number=p_match
     and p.round_number=p_round
 ) ranked;
$$;
revoke all on function public.drop_block_speed_order(uuid,integer,integer)
 from public,anon,authenticated;


create or replace function public.drop_block_resolve_speed_timeout(p_room_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
 r public.drop_block_rooms;
 missing_count integer:=0;
begin
 select * into r from public.drop_block_rooms where id=p_room_id for update;
 if not found or r.mode<>'speed' or r.status<>'playing' or
    r.turn_deadline is null or r.turn_deadline>clock_timestamp() then
   return false;
 end if;
 update public.drop_block_players p set timed_out_turns=p.timed_out_turns+1
 where p.room_id=r.id and not exists(
   select 1 from public.drop_block_speed_plays sp
    where sp.room_id=r.id and sp.match_number=r.match_number
      and sp.round_number=r.round_number and sp.user_id=p.user_id
 );
 get diagnostics missing_count=row_count;
 update public.drop_block_rooms set
    turn_skips=turn_skips+missing_count,round_number=round_number+1,
    speed_previous_round=r.round_number,
    speed_previous_order=public.drop_block_speed_order(r.id,r.match_number,r.round_number),
    speed_round_opens_at=clock_timestamp()+interval '3 seconds',
    turn_deadline=clock_timestamp()+interval '63 seconds',
    last_event=missing_count||' player(s) missed round '||r.round_number||
       '. Round '||(r.round_number+1)||' starts in 3… 2… 1…',
    updated_at=now()
 where id=r.id;
 return true;
end;
$$;
revoke all on function public.drop_block_resolve_speed_timeout(uuid)
 from public,anon,authenticated;


create or replace function public.drop_block_action(
 p_action text, p_code text default '', p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid();
 v_room public.drop_block_rooms;
 v_seat integer;
 v_name text;
 v_max integer;
 v_width integer;
 v_height integer;
 v_col integer;
 v_row integer;
 v_board jsonb;
 v_points integer := 0;
 v_winner integer := null;
 v_next integer := null;
 v_total integer;
 v_dx integer;
 v_dy integer;
 v_x integer;
 v_y integer;
 v_length integer;
 v_dir integer;
 v_sign integer;
 v_code text;
 v_count integer;
 v_best integer;
 v_ties integer;
 v_target integer;
 v_left integer;
 v_round integer;
 v_floor integer;
 v_event text;
 v_newboard jsonb;
 v_sequence integer;
 v_starter integer;
 v_kind text;
 v_cell integer;
begin
 if v_uid is null then raise exception 'Sign in to your PlayVolt account first'; end if;
 if p_action not in ('create','join','get','ready','start','drop','rematch','cancel') then raise exception 'Unknown action'; end if;

 if p_action='create' then
   select left(nullif(btrim(nickname),''),24) into v_name from public.profiles where id=v_uid;
   if v_name is null then raise exception 'Open Dekabess to finish setting up your PlayVolt profile'; end if;
   if (select count(*) from public.drop_block_rooms where host_id=v_uid and created_at>now()-interval '1 day')>=20 then
     raise exception 'Too many rooms created today';
   end if;
   v_max := coalesce((p_data->>'maxPlayers')::integer,4);
   if v_max not between 2 and 8 then raise exception 'Choose 2 to 8 players'; end if;
   if p_data->>'mode'='team' and v_max not in (4,6,8) then
     raise exception 'Team Battle requires a maximum of 4, 6 or 8 players';
   end if;
   if coalesce(p_data->>'mode','') not in ('classic','territory','elimination','collapse','chaos','team','speed') then raise exception 'Choose a game mode'; end if;
   v_width := case when v_max=2 then 7 when v_max<=4 then 9 when v_max<=6 then 12 else 14 end;
   v_height := case when v_max=2 then 6 when v_max<=4 then 8 when v_max<=6 then 9 else 10 end;
   for v_count in 1..8 loop
     v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
     begin
       insert into public.drop_block_rooms(code,host_id,mode,max_players,width,height,board)
         values(v_code,v_uid,p_data->>'mode',v_max,v_width,v_height,to_jsonb(array_fill(0,array[v_width*v_height])))
         returning * into v_room;
       exit;
     exception when unique_violation then
       if v_count=8 then raise exception 'Unable to create a room code. Please retry'; end if;
     end;
   end loop;
   insert into public.drop_block_players(room_id,user_id,seat,name,ready) values(v_room.id,v_uid,1,v_name,true);
   p_code:=v_room.code;
 end if;

 if p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{6}$' then raise exception 'Enter a six-character room code'; end if;
 select * into v_room from public.drop_block_rooms where code=upper(btrim(p_code)) for update;
 if not found or v_room.created_at<now()-interval '24 hours' then raise exception 'This room does not exist or has expired'; end if;

 select seat into v_seat from public.drop_block_players where room_id=v_room.id and user_id=v_uid;
 if p_action='join' and v_seat is null then
   if v_room.status<>'lobby' then raise exception 'This match has already started'; end if;
   select count(*) into v_count from public.drop_block_players where room_id=v_room.id;
   if v_count>=v_room.max_players then raise exception 'This room is full'; end if;
   select left(nullif(btrim(nickname),''),24) into v_name from public.profiles where id=v_uid;
   if v_name is null then raise exception 'Open Dekabess to finish setting up your PlayVolt profile'; end if;
   select coalesce(max(seat),0)+1 into v_seat from public.drop_block_players where room_id=v_room.id;
   insert into public.drop_block_players(room_id,user_id,seat,name) values(v_room.id,v_uid,v_seat,v_name);
 end if;
 if v_seat is null then raise exception 'Join this room before playing'; end if;

 -- A surviving participant's read (or attempted move) advances at most one
 -- expired turn. TV read access never writes or controls a match.
 if p_action in ('get','drop') and v_room.status='playing'
    and v_room.turn_deadline is not null
    and v_room.turn_deadline<=clock_timestamp() then
    if v_room.mode='speed' then
      perform public.drop_block_resolve_speed_timeout(v_room.id);
    else
      perform public.drop_block_resolve_timeout(v_room.id);
    end if;
    select * into v_room from public.drop_block_rooms where id=v_room.id;
    -- If this request arrived after its player's deadline, show the new turn
    -- rather than applying a stale move or rolling back the skip.
    if p_action='drop' then p_action:='get'; end if;
 end if;

 -- Presence is refreshed on room activity. Throttle routine get() polling to
 -- a single write every ~10 seconds per player.
 if p_action<>'get' or exists (
   select 1 from public.drop_block_players
   where room_id=v_room.id and user_id=v_uid
     and last_seen_at<now()-interval '10 seconds'
 ) then
   update public.drop_block_players set last_seen_at=now()
     where room_id=v_room.id and user_id=v_uid;
 end if;

 if p_action='cancel' then
   if v_room.host_id<>v_uid then raise exception 'Only the room host can close or end a match'; end if;
   if v_room.status='lobby' then
     -- Closing an unused lobby does not record a game or unlock any trophy.
     update public.drop_block_rooms set status='cancelled',
       ended_reason='closed_lobby',ended_at=clock_timestamp(),
       last_event='Room closed by the host.',turn_seat=null,turn_deadline=null,updated_at=now()
     where id=v_room.id;
   elsif v_room.status='playing' then
     -- Protect active matches from unilateral cancellation. No contest is
     -- allowed only after three idle minutes AND reliable abandonment evidence.
     if not public.drop_block_can_no_contest(v_room.id) then
       raise exception 'No Contest is available after 3 minutes without a move and another player away for 90 seconds or two missed turns';
     end if;
     update public.drop_block_rooms set status='cancelled',
       ended_reason='stalled_no_contest',ended_at=clock_timestamp(),
       last_event='Match ended as No Contest. No wins or trophies awarded.',
       turn_seat=null,winner_seat=null,turn_deadline=null,updated_at=now()
     where id=v_room.id;
   else
     raise exception 'Only a lobby or an abandoned active match can be ended';
   end if;
 elsif p_action='rematch' then
   if v_room.host_id<>v_uid then raise exception 'Only the room host can start a rematch'; end if;
   if v_room.status<>'finished' and not
      (v_room.status='cancelled' and v_room.ended_reason='stalled_no_contest') then
     raise exception 'Finish a match or end a stalled game before starting a rematch';
   end if;
   if (select count(*) from public.drop_block_players where room_id=v_room.id)<2 then
     raise exception 'At least two players are needed';
   end if;
   update public.drop_block_rooms
     set match_number=match_number+1, status='lobby',
       board=to_jsonb(array_fill(0,array[width*height])),
       move_count=0,turn_seat=null,winner_seat=null,
       round_number=1,floor_clears=0,turn_skips=0,turn_deadline=null,
       speed_round_opens_at=null,speed_previous_round=null,
       speed_previous_order='[]'::jsonb,last_move_at=now(),ended_reason=null,ended_at=null,last_event='New match: ready up!',updated_at=now()
     where id=v_room.id;
   update public.drop_block_players
     set score=0,eliminated=false,timed_out_turns=0,chaos_block_used=false,chaos_blast_used=false,ready=(user_id=v_uid)
     where room_id=v_room.id;
 elsif p_action='ready' then
   if v_room.status<>'lobby' then raise exception 'The match has already started'; end if;
   update public.drop_block_players set ready=coalesce((p_data->>'ready')::boolean,false)
     where room_id=v_room.id and user_id=v_uid;
 elsif p_action='start' then
   if v_room.host_id<>v_uid then raise exception 'Only the room host can start'; end if;
   if v_room.status<>'lobby' then raise exception 'The match is already underway'; end if;
   select count(*) into v_count from public.drop_block_players where room_id=v_room.id;
   if v_count<2 then raise exception 'At least two players are needed'; end if;
   if v_room.mode='team' and v_count not in (4,6,8) then
     raise exception 'Team Battle starts with 4, 6 or 8 players (balanced teams)';
   end if;
   if exists(select 1 from public.drop_block_players where room_id=v_room.id and not ready) then
     raise exception 'Wait until all players are ready';
   end if;
   -- Fairly rotate the first player across consecutive matches.
   select seat into v_starter from public.drop_block_players
     where room_id=v_room.id order by seat
     offset ((v_room.match_number-1)%v_count) limit 1;
   update public.drop_block_rooms
     set status='playing',turn_seat=case when v_room.mode='speed' then null else v_starter end,
       speed_round_opens_at=case when v_room.mode='speed' then clock_timestamp()+interval '3 seconds' else null end,
       speed_previous_round=null,speed_previous_order='[]'::jsonb,
       turn_deadline=clock_timestamp()+case when v_room.mode='speed' then interval '63 seconds' else interval '60 seconds' end,
       last_move_at=now(),ended_reason=null,ended_at=null,last_event='',tv_replay_match=null,tv_replay_mode=null,tv_replay_started_at=null,updated_at=now()
     where id=v_room.id;
 elsif p_action='drop' then
   if v_room.mode='speed' then
     if v_room.status<>'playing' then raise exception 'This room is not currently playing'; end if;
     if v_room.speed_round_opens_at is not null
          and clock_timestamp()<v_room.speed_round_opens_at then
       raise exception 'Wait for GO! The round has not started';
     end if;
     if coalesce(p_data->>'kind','drop')<>'drop' then
       raise exception 'Speed Round only allows regular chip drops'; end if;
     -- The room row was locked at the start of drop_block_action.
     -- This serializes competing submissions and defines the authoritative
     -- order: the first transaction to acquire the room lock places first.
     if exists(select 1 from public.drop_block_speed_plays p
         where p.room_id=v_room.id and p.match_number=v_room.match_number
          and p.round_number=v_room.round_number and p.user_id=v_uid) then
       raise exception 'You already played this round. Wait for everyone else';
     end if;
     v_col:=(p_data->>'column')::integer;
     if v_col is null or v_col<0 or v_col>=v_room.width then raise exception 'Invalid column'; end if;
     v_board:=v_room.board;
     v_row:=null;
     for v_y in reverse (v_room.height-1)..0 loop
       if (v_board->>(v_y*v_room.width+v_col))::integer=0 then
         v_row:=v_y;exit;
       end if;
     end loop;
     if v_row is null then raise exception 'That column is full';end if;
     v_board:=jsonb_set(v_board,array[(v_row*v_room.width+v_col)::text],to_jsonb(v_seat),false);
     v_points:=0;
     for v_dir in 1..4 loop
       v_dx:=case v_dir when 1 then 1 when 2 then 0 else 1 end;
       v_dy:=case v_dir when 1 then 0 when 2 then 1 when 3 then 1 else -1 end;
       v_length:=1;
       for v_sign in -1..1 loop
         if v_sign=0 then continue; end if;
         v_x:=v_col+v_sign*v_dx;
         v_y:=v_row+v_sign*v_dy;
         while v_x>=0 and v_x<v_room.width and v_y>=0 and v_y<v_room.height loop
           exit when (v_board->>(v_y*v_room.width+v_x))::integer<>v_seat;
           v_length:=v_length+1;
           v_x:=v_x+v_sign*v_dx;v_y:=v_y+v_sign*v_dy;
         end loop;
       end loop;
       if v_length>=4 then v_points:=v_points+1;end if;
     end loop;
     update public.drop_block_players set score=score+v_points
       where room_id=v_room.id and user_id=v_uid;
     v_total:=v_room.move_count+1;
     v_sequence:=v_room.total_moves+1;
     insert into public.drop_block_speed_plays(room_id,match_number,round_number,user_id,seat,column_number,accepted_number)
       values(v_room.id,v_room.match_number,v_room.round_number,v_uid,v_seat,v_col,v_sequence);
     select count(*) into v_left from public.drop_block_speed_plays p
       where p.room_id=v_room.id and p.match_number=v_room.match_number
         and p.round_number=v_room.round_number;
     select count(*) into v_count from public.drop_block_players p
       where p.room_id=v_room.id;
     insert into public.drop_block_moves(room_id,number,user_id,seat,column_number,
       row_number,earned,match_number,move_kind,board_after,round_after,
       floor_clears_after,event_after,players_after)
     values(v_room.id,v_sequence,v_uid,v_seat,v_col,v_row,v_points,
       v_room.match_number,'drop',v_board,v_room.round_number,0,
       case when v_points>0 then 'Player '||v_seat||' connected four!'
         else 'Player '||v_seat||' placed first available chip: '||v_left||'/'||v_count end,
       (select coalesce(jsonb_agg(jsonb_build_object(
           'seat',p.seat,'score',p.score,'eliminated',p.eliminated
         ) order by p.seat),'[]'::jsonb)
         from public.drop_block_players p where p.room_id=v_room.id));
     if v_points>0 or not exists(
       select 1 from jsonb_array_elements_text(v_board) as cell(value) where cell.value='0'
     ) then
       update public.drop_block_rooms
         set status='finished',board=v_board,winner_seat=case when v_points>0 then v_seat else null end,
           move_count=v_total,total_moves=v_sequence,turn_seat=null,
           turn_deadline=null,speed_round_opens_at=null,last_move_at=clock_timestamp(),
           last_event=case when v_points>0 then 'Player '||v_seat||' wins the speed round!'
             else 'Board full — it is a draw!' end,updated_at=now()
        where id=v_room.id;
       insert into public.drop_block_results(room_id,match_number,user_id,score,won)
         select v_room.id,v_room.match_number,p.user_id,p.score,
           (v_points>0 and p.seat=v_seat)
         from public.drop_block_players p where p.room_id=v_room.id
         on conflict(room_id,match_number,user_id) do nothing;
     elsif v_left=v_count then
       update public.drop_block_rooms
         set board=v_board,move_count=v_total,total_moves=v_sequence,
           round_number=round_number+1,turn_seat=null,
           speed_previous_round=v_room.round_number,
           speed_previous_order=public.drop_block_speed_order(v_room.id,v_room.match_number,v_room.round_number),
           speed_round_opens_at=clock_timestamp()+interval '3 seconds',
           turn_deadline=clock_timestamp()+interval '63 seconds',
           last_move_at=clock_timestamp(),
           last_event='Everyone dropped! Round '||(v_room.round_number+1)||' starts in 3… 2… 1…',
           updated_at=now()
         where id=v_room.id;
     else
       update public.drop_block_rooms
         set board=v_board,move_count=v_total,total_moves=v_sequence,
           last_move_at=clock_timestamp(),
           last_event='Player '||v_seat||' dropped ('||v_left||'/'||v_count||' this round)',
           updated_at=now()
         where id=v_room.id;
     end if;
   else
   if v_room.status<>'playing' then raise exception 'This room is not currently playing'; end if;
   if v_room.turn_seat<>v_seat then raise exception 'Wait for your turn'; end if;
   if exists (select 1 from public.drop_block_players where room_id=v_room.id and user_id=v_uid and eliminated) then
     raise exception 'You have been eliminated. Watch the remaining players!';
   end if;
   v_round:=v_room.round_number;
   v_floor:=v_room.floor_clears;
   v_event:='';
   v_kind:=coalesce(p_data->>'kind','drop');
   if v_kind not in ('drop','block','blast') then raise exception 'Unknown move kind'; end if;
   if v_room.mode<>'chaos' and v_kind<>'drop' then raise exception 'Powers are only available in Chaos Mode'; end if;
   v_col:=(p_data->>'column')::integer;
   if v_col is null or v_col<0 or v_col>=v_room.width then raise exception 'Invalid column'; end if;
   v_board:=v_room.board;
   if v_kind='blast' then
     if exists(select 1 from public.drop_block_players
       where room_id=v_room.id and user_id=v_uid and chaos_blast_used) then
       raise exception 'Your Blast power has already been used this match';
     end if;
     if (v_board->>((v_room.height-1)*v_room.width+v_col))::integer=0 then
       raise exception 'Choose a column that contains at least one chip';
     end if;
     v_row:=v_room.height-1;
     for v_y in reverse (v_room.height-1)..1 loop
       v_board:=jsonb_set(v_board,array[(v_y*v_room.width+v_col)::text],
         to_jsonb((v_board->>(((v_y-1)*v_room.width+v_col)))::integer),false);
     end loop;
     v_board:=jsonb_set(v_board,array[v_col::text],to_jsonb(0),false);
     update public.drop_block_players set chaos_blast_used=true
       where room_id=v_room.id and user_id=v_uid;
     v_event:='Player ' || v_seat || ' used Blast — a bottom chip vanished!';
   else
     v_row:=null;
     for v_y in reverse (v_room.height-1)..0 loop
       if (v_board->>(v_y*v_room.width+v_col))::integer=0 then v_row:=v_y; exit; end if;
     end loop;
     if v_row is null then raise exception 'That column is full'; end if;
     if v_kind='block' then
       if exists(select 1 from public.drop_block_players
         where room_id=v_room.id and user_id=v_uid and chaos_block_used) then
         raise exception 'Your Barrier power has already been used this match';
       end if;
       v_board:=jsonb_set(v_board,array[(v_row*v_room.width+v_col)::text],to_jsonb(9),false);
       update public.drop_block_players set chaos_block_used=true
         where room_id=v_room.id and user_id=v_uid;
       v_event:='Player ' || v_seat || ' dropped a Barrier!';
     else
       v_board:=jsonb_set(v_board,array[(v_row*v_room.width+v_col)::text],to_jsonb(v_seat),false);
       -- Only a normal drop can complete four in a row and win.
       for v_dir in 1..4 loop
         v_dx:=case v_dir when 1 then 1 when 2 then 0 else 1 end;
         v_dy:=case v_dir when 1 then 0 when 2 then 1 when 3 then 1 else -1 end;
         v_length:=1;
         for v_sign in -1..1 loop
           if v_sign=0 then continue; end if;
           v_x:=v_col+v_sign*v_dx;
           v_y:=v_row+v_sign*v_dy;
           while v_x>=0 and v_x<v_room.width and v_y>=0 and v_y<v_room.height loop
             v_cell:=(v_board->>(v_y*v_room.width+v_x))::integer;
             exit when (v_room.mode='team' and (v_cell not between 1 and 8 or mod(v_cell,2)<>mod(v_seat,2)))
                    or (v_room.mode<>'team' and v_cell<>v_seat);
             v_length:=v_length+1;
             v_x:=v_x+v_sign*v_dx;
             v_y:=v_y+v_sign*v_dy;
           end loop;
         end loop;
         if v_length>=4 then v_points:=v_points+1; end if;
       end loop;
     end if;
   end if;
   update public.drop_block_players set score=score+v_points
     where room_id=v_room.id and user_id=v_uid;
   v_total:=v_room.move_count+1;
   v_sequence:=v_room.total_moves+1;
   insert into public.drop_block_moves(room_id,number,user_id,seat,column_number,row_number,earned,match_number,move_kind)
     values(v_room.id,v_sequence,v_uid,v_seat,v_col,v_row,v_points,v_room.match_number,v_kind);

   if v_room.mode in ('classic','collapse','chaos','team') and v_points>0 then
     v_winner:=v_seat;
   elsif v_room.mode='elimination' and v_points>0 then
     -- Knock out the next living opponent clockwise; winner cannot eliminate themselves.
     select seat into v_target from public.drop_block_players
       where room_id=v_room.id and not eliminated and seat>v_seat order by seat limit 1;
     if v_target is null then
       select seat into v_target from public.drop_block_players
         where room_id=v_room.id and not eliminated and seat<>v_seat order by seat limit 1;
     end if;
     if v_target is not null then
       update public.drop_block_players set eliminated=true
         where room_id=v_room.id and seat=v_target;
     end if;
     select count(*) into v_left from public.drop_block_players
       where room_id=v_room.id and not eliminated;
     v_event := 'Player ' || v_target || ' eliminated!';
     if v_left=1 then
       v_winner:=v_seat;
     else
       v_board:=to_jsonb(array_fill(0,array[v_room.width*v_room.height]));
       v_round:=v_room.round_number+1;
       v_event:=v_event || ' New round!';
     end if;
   elsif v_room.mode='elimination' and not exists (select 1 from jsonb_array_elements_text(v_board) as cell(value) where cell.value='0') then
     -- A full round without a connect-four is a redraw, not a knockout.
     v_board:=to_jsonb(array_fill(0,array[v_room.width*v_room.height]));
     v_round:=v_room.round_number+1;
     v_event:='Board full! New round, no eliminations.';
   elsif v_room.mode='collapse' and v_points=0 and v_row<=1 then
     -- Remove exactly the bottom row. All other rows descend one step; top becomes blank.
     v_newboard:=to_jsonb(array_fill(0,array[v_room.width]));
     for v_y in 0..(v_room.height-2) loop
       for v_x in 0..(v_room.width-1) loop
         v_newboard:=v_newboard || jsonb_build_array((v_board->>(v_y*v_room.width+v_x))::integer);
       end loop;
     end loop;
     v_board:=v_newboard;
     v_floor:=v_room.floor_clears+1;
     v_event:='Bottom row cleared — pieces fell one row!';
   elsif v_total=v_room.width*v_room.height and v_room.mode='territory' then
     select max(score) into v_best from public.drop_block_players where room_id=v_room.id;
     select count(*) into v_ties from public.drop_block_players where room_id=v_room.id and score=v_best;
     if v_ties=1 then
       select seat into v_winner from public.drop_block_players where room_id=v_room.id and score=v_best;
     end if;
   end if;
   if v_winner is not null or (v_room.mode in ('classic','territory','chaos','team') and not exists (select 1 from jsonb_array_elements_text(v_board) as cell(value) where cell.value='0')) then
     update public.drop_block_rooms
       set status='finished',board=v_board,move_count=v_total,total_moves=v_sequence,last_move_at=now(),winner_seat=v_winner,
         round_number=v_round,floor_clears=v_floor,last_event=v_event,turn_seat=null,turn_deadline=null,updated_at=now()
       where id=v_room.id;
     insert into public.drop_block_results(room_id,match_number,user_id,score,won)
       select v_room.id,v_room.match_number,user_id,score,
         case when v_room.mode='team' then
            (v_winner is not null and mod(seat,2)=mod(v_winner,2))
         else seat=v_winner end
       from public.drop_block_players
       where room_id=v_room.id on conflict(room_id,match_number,user_id) do nothing;
   else
     select seat into v_next from public.drop_block_players
       where room_id=v_room.id and (v_room.mode<>'elimination' or not eliminated)
         and seat>v_seat order by seat limit 1;
     if v_next is null then
       select seat into v_next from public.drop_block_players
         where room_id=v_room.id and (v_room.mode<>'elimination' or not eliminated)
         order by seat limit 1;
     end if;
     update public.drop_block_rooms
       set board=v_board,turn_seat=v_next,move_count=v_total,total_moves=v_sequence,last_move_at=now(),
           round_number=v_round,floor_clears=v_floor,last_event=v_event,turn_deadline=now()+interval '60 seconds',updated_at=now()
       where id=v_room.id;
   end if;
   -- Store the authoritative *post-effect* state, after any Chaos blast,
   -- Bottom Drop clear, or Elimination reset (and after scoring changes).
   -- This is part of the same atomic transaction as the accepted move.
   update public.drop_block_moves
      set board_after=v_board,round_after=v_round,
          floor_clears_after=v_floor,event_after=v_event,
          players_after=(
            select coalesce(jsonb_agg(jsonb_build_object(
              'seat',p.seat,'score',p.score,'eliminated',p.eliminated
            ) order by p.seat),'[]'::jsonb)
            from public.drop_block_players p where p.room_id=v_room.id
          )
     where room_id=v_room.id and number=v_sequence;
   end if; -- original sequential-mode branch
 end if;

 select * into v_room from public.drop_block_rooms where id=v_room.id;
 return jsonb_build_object(
   'code',v_room.code,'mode',v_room.mode,'status',v_room.status,'maxPlayers',v_room.max_players,
   'width',v_room.width,'height',v_room.height,'board',v_room.board,
   'moveCount',v_room.move_count,'turnSeat',v_room.turn_seat,'winnerSeat',v_room.winner_seat,
   'lastMove',case when v_room.move_count>0 then (
      select jsonb_build_object(
        'seat',m.seat,'column',m.column_number,'row',m.row_number,
        'kind',m.move_kind,'number',m.number,'earned',m.earned,'round',m.round_after)
      from public.drop_block_moves m
      where m.room_id=v_room.id and m.match_number=v_room.match_number
      order by m.number desc limit 1
   ) else null end,
   'roundNumber',v_room.round_number,'floorClears',v_room.floor_clears,'lastEvent',v_room.last_event,
   'matchNumber',v_room.match_number,
   'turnDeadline',v_room.turn_deadline,'serverNow',clock_timestamp(),
   'turnSkips',v_room.turn_skips,'turnDuration',60,
   'speedRoundOpensAt',v_room.speed_round_opens_at,
   'speedPreviousRound',v_room.speed_previous_round,
   'speedPreviousOrder',v_room.speed_previous_order,
   'speedOrder',case when v_room.mode='speed' then
      public.drop_block_speed_order(v_room.id,v_room.match_number,v_room.round_number)
     else '[]'::jsonb end,
   'speedPlayedSeats',case when v_room.mode='speed' then
      coalesce((select jsonb_agg(p.seat order by p.seat)
          from public.drop_block_speed_plays p
          where p.room_id=v_room.id and p.match_number=v_room.match_number
           and p.round_number=v_room.round_number),'[]'::jsonb)
        else '[]'::jsonb end,
   'endReason',v_room.ended_reason,'endedAt',v_room.ended_at,
   'lastMoveAt',v_room.last_move_at,
   'tvReplay',jsonb_build_object('active',v_room.tv_replay_match is not null and v_room.status in ('lobby','finished'),
     'matchNumber',v_room.tv_replay_match,'mode',v_room.tv_replay_mode,'startedAt',v_room.tv_replay_started_at),
   'canNoContest',case when v_room.host_id=v_uid then public.drop_block_can_no_contest(v_room.id) else false end,
   'winnerTeam',case when v_room.mode='team' and v_room.winner_seat is not null then
      case when mod(v_room.winner_seat,2)=1 then 1 else 2 end else null end,
   'host',v_room.host_id=v_uid,'meSeat',v_seat,
   'displayToken',v_room.display_token,
   'hostBoardTheme',coalesce((select board_id from public.drop_block_cosmetic_loadouts where user_id=v_room.host_id),'deep-navy'),
   'players',coalesce((
      select jsonb_agg(jsonb_build_object('seat',seat,'name',name,'ready',ready,'score',score,'eliminated',eliminated,
        'chaosBlockUsed',chaos_block_used,'chaosBlastUsed',chaos_blast_used,
        'team',case when mod(seat,2)=1 then 1 else 2 end,
        'avatarStyle',coalesce(co.avatar_id,'sentinel'),
        'chipStyle',coalesce(co.chip_id,'round'),
        'online',p.last_seen_at>=now()-interval '25 seconds',
        'timedOutTurns',p.timed_out_turns)
                        order by seat)
      from public.drop_block_players p
      left join public.drop_block_cosmetic_loadouts co on co.user_id=p.user_id
      where p.room_id=v_room.id
   ),'[]'::jsonb)
 );
end;
$$;
revoke all on function public.drop_block_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.drop_block_action(text,text,jsonb) to authenticated;















create or replace function public.drop_block_tv_state(
  p_code text, p_token text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r public.drop_block_rooms;
begin
 if p_code is null or p_code !~ '^[A-Fa-f0-9]{6}$'
    or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid TV display link';
 end if;
 select * into r from public.drop_block_rooms
  where code=upper(p_code) and display_token=p_token
    and created_at>now()-interval '24 hours';
 if not found then raise exception 'TV display link is unavailable or expired'; end if;
 return jsonb_build_object(
   'code',r.code,'mode',r.mode,'status',r.status,'maxPlayers',r.max_players,
   'width',r.width,'height',r.height,'board',r.board,
   'moveCount',r.move_count,'turnSeat',r.turn_seat,'winnerSeat',r.winner_seat,
   'lastMove',case when r.move_count>0 then (
      select jsonb_build_object(
        'seat',m.seat,'column',m.column_number,'row',m.row_number,
        'kind',m.move_kind,'number',m.number,'earned',m.earned,'round',m.round_after)
      from public.drop_block_moves m
      where m.room_id=r.id and m.match_number=r.match_number
      order by m.number desc limit 1
   ) else null end,
   'roundNumber',r.round_number,'floorClears',r.floor_clears,'lastEvent',r.last_event,
   'matchNumber',r.match_number,
   'tvReplay',jsonb_build_object('active',r.tv_replay_match is not null and r.status in ('lobby','finished'),
     'matchNumber',r.tv_replay_match,'mode',r.tv_replay_mode,'startedAt',r.tv_replay_started_at),
   'turnDeadline',r.turn_deadline,'serverNow',clock_timestamp(),
   'turnSkips',r.turn_skips,'turnDuration',60,
   'speedRoundOpensAt',r.speed_round_opens_at,
   'speedPreviousRound',r.speed_previous_round,
   'speedPreviousOrder',r.speed_previous_order,
   'speedOrder',case when r.mode='speed' then
      public.drop_block_speed_order(r.id,r.match_number,r.round_number)
     else '[]'::jsonb end,
   'speedPlayedSeats',case when r.mode='speed' then
      coalesce((select jsonb_agg(p.seat order by p.seat)
         from public.drop_block_speed_plays p
         where p.room_id=r.id and p.match_number=r.match_number
          and p.round_number=r.round_number),'[]'::jsonb)
       else '[]'::jsonb end,
   'endReason',r.ended_reason,'endedAt',r.ended_at,
   'winnerTeam',case when r.mode='team' and r.winner_seat is not null then
       case when mod(r.winner_seat,2)=1 then 1 else 2 end else null end,
   'hostBoardTheme',coalesce((select board_id from public.drop_block_cosmetic_loadouts where user_id=r.host_id),'deep-navy'),
   'players',coalesce((
      select jsonb_agg(jsonb_build_object(
       'seat',seat,'name',name,'ready',ready,'score',score,'eliminated',eliminated,
        'chaosBlockUsed',chaos_block_used,'chaosBlastUsed',chaos_blast_used,
        'team',case when mod(seat,2)=1 then 1 else 2 end,
        'avatarStyle',coalesce(co.avatar_id,'sentinel'),
        'chipStyle',coalesce(co.chip_id,'round'),
        'online',p.last_seen_at>=now()-interval '25 seconds',
        'timedOutTurns',p.timed_out_turns)
       order by seat)
      from public.drop_block_players p
      left join public.drop_block_cosmetic_loadouts co on co.user_id=p.user_id
      where p.room_id=r.id
   ),'[]'::jsonb)
 );
end;
$$;
-- No direct table access, and no gameplay actions granted to guests.
revoke all on function public.drop_block_tv_state(text,text) from public,anon,authenticated;
grant execute on function public.drop_block_tv_state(text,text) to anon,authenticated;





