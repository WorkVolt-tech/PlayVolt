-- Drop & Block guest multiplayer using the existing PlayVolt Game DB.
-- No new auth.users rows, no email/password, and no change to other games.
-- A random 256-bit guest token authorizes one temporary player identity.
-- Test via BEGIN; [migration]; [smoke tests]; ROLLBACK; before install.
create table if not exists public.drop_block_guest_sessions (
  guest_id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  nickname text not null check (char_length(nickname) between 2 and 24),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '48 hours')
);
alter table public.drop_block_guest_sessions enable row level security;
revoke all on public.drop_block_guest_sessions from public,anon,authenticated;

-- Older game tables assume every player is in auth.users/public.profiles.
-- Keep the same UUID column/API for older modes while validating either a
-- registered account or a scoped temporary guest identity at DB write time.
alter table public.drop_block_rooms drop constraint if exists drop_block_rooms_host_id_fkey;
alter table public.drop_block_players drop constraint if exists drop_block_players_user_id_fkey;
alter table public.drop_block_moves drop constraint if exists drop_block_moves_user_id_fkey;
alter table public.drop_block_speed_plays drop constraint if exists drop_block_speed_plays_user_id_fkey;

create or replace function public.drop_block_validate_player_identity()
returns trigger language plpgsql security definer set search_path='' as $guard$
declare v_id uuid;
begin
  if TG_TABLE_NAME='drop_block_rooms' then v_id:=new.host_id;
  else v_id:=new.user_id; end if;
  if v_id is null or not (
    exists(select 1 from auth.users u where u.id=v_id)
    or exists(select 1 from public.drop_block_guest_sessions s
        where s.guest_id=v_id and s.expires_at>clock_timestamp())
  ) then
    raise exception 'Unknown Drop & Block player identity';
  end if;
  return new;
end $guard$;

drop trigger if exists drop_block_validate_room_host on public.drop_block_rooms;
create trigger drop_block_validate_room_host before insert or update of host_id
on public.drop_block_rooms for each row execute function public.drop_block_validate_player_identity();
drop trigger if exists drop_block_validate_player_seat on public.drop_block_players;
create trigger drop_block_validate_player_seat before insert or update of user_id
on public.drop_block_players for each row execute function public.drop_block_validate_player_identity();
drop trigger if exists drop_block_validate_move_actor on public.drop_block_moves;
create trigger drop_block_validate_move_actor before insert or update of user_id
on public.drop_block_moves for each row execute function public.drop_block_validate_player_identity();
drop trigger if exists drop_block_validate_speed_actor on public.drop_block_speed_plays;
create trigger drop_block_validate_speed_actor before insert or update of user_id
on public.drop_block_speed_plays for each row execute function public.drop_block_validate_player_identity();
revoke all on function public.drop_block_validate_player_identity() from public,anon,authenticated;

-- Guest records never create persistent leaderboard/achievement results.
-- Existing authenticated and fully registered players are still eligible.
create or replace function public.drop_block_guest_reward_guard()
returns trigger language plpgsql security definer set search_path='' as $reward$
begin
 if exists(select 1 from auth.users u where u.id=new.user_id and u.is_anonymous is true)
   or exists(select 1 from public.drop_block_guest_sessions s where s.guest_id=new.user_id) then
   return null;
 end if;
 return new;
end $reward$;
revoke all on function public.drop_block_guest_reward_guard() from public,anon,authenticated;

-- Extend existing game functions surgically. Only identity resolution changes.

CREATE OR REPLACE FUNCTION public.drop_block_action(p_action text, p_code text DEFAULT ''::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid := coalesce(auth.uid(),nullif(current_setting('drop_block.guest_uid',true),'')::uuid);
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
 v_elim_target integer := null;
 v_elim_scorer integer := null;
 v_reset_board jsonb := null;
 v_reset_opens_at timestamptz := null;
begin
 if v_uid is null then raise exception 'Sign in to your PlayVolt account first'; end if;
 if p_action not in ('create','join','get','ready','start','drop','rematch','cancel') then raise exception 'Unknown action'; end if;

 if p_action='create' then
   select coalesce((select left(nullif(btrim(p.nickname),''),24) from public.profiles p where p.id=v_uid),
     (select s.nickname from public.drop_block_guest_sessions s
        where s.guest_id=v_uid and s.expires_at>clock_timestamp()))
     into v_name;
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
   select coalesce((select left(nullif(btrim(p.nickname),''),24) from public.profiles p where p.id=v_uid),
     (select s.nickname from public.drop_block_guest_sessions s
        where s.guest_id=v_uid and s.expires_at>clock_timestamp()))
     into v_name;
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
     set match_number=match_number+1, status='lobby',win_length=4,
       board=to_jsonb(array_fill(0,array[width*height])),
       move_count=0,turn_seat=null,winner_seat=null,
       round_number=1,floor_clears=0,turn_skips=0,turn_deadline=null,
       speed_round_opens_at=null,speed_previous_round=null,
       speed_previous_order='[]'::jsonb,last_move_at=now(),ended_reason=null,ended_at=null,last_event='New match: ready up!',
       elimination_round_opens_at=null,elimination_previous_board=null,
       elimination_target_seat=null,elimination_scorer_seat=null,updated_at=now()
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
     set status='playing',win_length=case when v_room.mode='team' or v_count<=3 then 4 else 3 end,
       turn_seat=case when v_room.mode='speed' then null else v_starter end,
       speed_round_opens_at=case when v_room.mode='speed' then clock_timestamp()+interval '3 seconds' else null end,
       speed_previous_round=null,speed_previous_order='[]'::jsonb,
       turn_deadline=clock_timestamp()+case when v_room.mode='speed' then interval '63 seconds' else interval '60 seconds' end,
       last_move_at=now(),ended_reason=null,ended_at=null,last_event='',
       elimination_round_opens_at=null,elimination_previous_board=null,
       elimination_target_seat=null,elimination_scorer_seat=null,tv_replay_match=null,tv_replay_mode=null,tv_replay_started_at=null,updated_at=now()
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
       if v_length>=v_room.win_length then v_points:=v_points+1;end if;
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
       floor_clears_after,event_after,players_after,win_length)
     values(v_room.id,v_sequence,v_uid,v_seat,v_col,v_row,v_points,
       v_room.match_number,'drop',v_board,v_room.round_number,0,
       case when v_points>0 then 'Player '||v_seat||' connected '||v_room.win_length||'!'
         else 'Player '||v_seat||' placed first available chip: '||v_left||'/'||v_count end,
       (select coalesce(jsonb_agg(jsonb_build_object(
           'seat',p.seat,'score',p.score,'eliminated',p.eliminated
         ) order by p.seat),'[]'::jsonb)
         from public.drop_block_players p where p.room_id=v_room.id),v_room.win_length);
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
   if v_room.mode='elimination' and v_room.elimination_round_opens_at is not null
      and clock_timestamp()<v_room.elimination_round_opens_at then
      raise exception 'Arena resetting. Wait for the next round countdown';
   end if;
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
         if v_length>=v_room.win_length then v_points:=v_points+1; end if;
       end loop;
     end if;
   end if;
   update public.drop_block_players set score=score+v_points
     where room_id=v_room.id and user_id=v_uid;
   v_total:=v_room.move_count+1;
   v_sequence:=v_room.total_moves+1;
   insert into public.drop_block_moves(room_id,number,user_id,seat,column_number,row_number,earned,match_number,move_kind,win_length)
     values(v_room.id,v_sequence,v_uid,v_seat,v_col,v_row,v_points,v_room.match_number,v_kind,v_room.win_length);

   if v_room.mode in ('classic','collapse','chaos','team') and v_points>0 then
     v_winner:=v_seat;
   elsif v_room.mode='elimination' and v_points>0 then
     -- Eliminate the previous ACTIVE seat: the last opponent who could
     -- have blocked the scorer. Skip eliminated seats; wrap from seat 1
     -- to the highest still-active seat. Never target the scoring player.
     select seat into v_target from public.drop_block_players
       where room_id=v_room.id and not eliminated and seat<v_seat
       order by seat desc limit 1;
     if v_target is null then
       select seat into v_target from public.drop_block_players
         where room_id=v_room.id and not eliminated and seat<>v_seat
         order by seat desc limit 1;
     end if;
     if v_target is not null then
       update public.drop_block_players set eliminated=true
         where room_id=v_room.id and seat=v_target;
     end if;
     select count(*) into v_left from public.drop_block_players
       where room_id=v_room.id and not eliminated;
     v_elim_target:=v_target;
     v_elim_scorer:=v_seat;
     v_event := 'Player ' || v_target || ' eliminated — previous active player before Player ' || v_seat || '!';
     if v_left=1 then
       v_winner:=v_seat;
     else
       v_reset_board:=v_board;
       v_reset_opens_at:=clock_timestamp()+interval '3 seconds';
       v_board:=to_jsonb(array_fill(0,array[v_room.width*v_room.height]));
       v_round:=v_room.round_number+1;
       v_event:=v_event || ' Arena resetting... next round in 3, 2, 1!';
     end if;
   elsif v_room.mode='elimination' and not exists (select 1 from jsonb_array_elements_text(v_board) as cell(value) where cell.value='0') then
     -- A full board also uses a visible transition, but nobody is eliminated.
     v_reset_board:=v_board;
     v_reset_opens_at:=clock_timestamp()+interval '3 seconds';
     v_board:=to_jsonb(array_fill(0,array[v_room.width*v_room.height]));
     v_round:=v_room.round_number+1;
     v_event:='Board full! No eliminations. Resetting arena... next round in 3, 2, 1!';
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
         round_number=v_round,floor_clears=v_floor,last_event=v_event,turn_seat=null,turn_deadline=null,
         elimination_round_opens_at=null,elimination_previous_board=null,
         elimination_target_seat=v_elim_target,elimination_scorer_seat=v_elim_scorer,updated_at=now()
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
           round_number=v_round,floor_clears=v_floor,last_event=v_event,
           elimination_round_opens_at=v_reset_opens_at,
           elimination_previous_board=v_reset_board,
           elimination_target_seat=v_elim_target,elimination_scorer_seat=v_elim_scorer,
           turn_deadline=coalesce(v_reset_opens_at,clock_timestamp())+interval '60 seconds',
           updated_at=now()
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
   'width',v_room.width,'height',v_room.height,'winLength',v_room.win_length,'board',v_room.board,
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
   'eliminationRoundOpensAt',v_room.elimination_round_opens_at,
   'eliminationPreviousBoard',v_room.elimination_previous_board,
   'eliminationTargetSeat',v_room.elimination_target_seat,
   'eliminationScorerSeat',v_room.elimination_scorer_seat,
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
$function$


CREATE OR REPLACE FUNCTION public.drop_block_power_action(p_action text, p_code text DEFAULT ''::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=coalesce(auth.uid(),nullif(current_setting('drop_block.guest_uid',true),'')::uuid);v_result jsonb;v_room public.drop_block_rooms;v_room_id uuid;
  v_power jsonb;v_seat integer;v_count integer;v_width integer;v_height integer;
  v_length integer;v_col integer;v_row integer;v_y integer;v_x integer;v_index integer;
  v_dest integer;v_chip integer;v_next integer;v_total integer;v_sequence integer;
  v_board integer[];v_settled integer[];v_shields integer[];v_newshields integer[];
  v_energy integer[];v_frozen jsonb;v_pending integer;v_kind text;v_cost integer;
  v_winners integer[];v_winner integer;v_finished boolean;v_event text;
  v_before integer;v_after integer;v_block_before boolean;v_block_after boolean;
  v_others integer;v_shattered boolean;v_points integer:=0;
begin
  if v_uid is null then raise exception 'Sign in to PlayVolt first';end if;
  if p_action not in ('create','join','get','ready','start','rematch','cancel','drop','double') then
    raise exception 'Unknown Power-Up action';
  end if;
  -- The board guard is limited to this transaction; the original RPC still
  -- works for every older mode, but cannot secretly alter a Power-Up board.
  perform set_config('drop_block.power_write','on',true);
  if p_action='create' then
    if p_data->>'mode'<>'power' then raise exception 'Expected Power-Up Arcade mode';end if;
    v_result:=public.drop_block_action('create','',p_data||'{"mode":"classic"}'::jsonb);
    p_code:=v_result->>'code';
    update public.drop_block_rooms set mode='power',updated_at=now()
      where code=p_code and host_id=v_uid and status='lobby' returning id into v_room_id;
    if v_room_id is null then raise exception 'Power-Up room creation failed';end if;
    insert into public.drop_block_power_state(room_id,match_number)
      values(v_room_id,1) on conflict(room_id) do nothing;
    return (v_result||jsonb_build_object('mode','power',
      'power',jsonb_build_object('energy','[]'::jsonb,'shields','[]'::jsonb,
                                'frozen',null,'doublePending',0,'pendingSeat',0)));
  end if;

  if p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{6}$' then
    raise exception 'Enter a six-character room code';
  end if;
  select * into v_room from public.drop_block_rooms
    where code=upper(btrim(p_code)) for update;
  if not found or v_room.mode<>'power' then raise exception 'Power-Up room not found'; end if;
  v_room_id:=v_room.id;
  if not exists(select 1 from public.drop_block_players
     where room_id=v_room_id and user_id=v_uid)
     and p_action<>'join' then
    raise exception 'Join this room before playing';
  end if;

  if p_action not in ('drop','double') then
    v_result:=public.drop_block_action(p_action,p_code,p_data);
    if p_action in ('start','rematch') then
      select count(*) into v_count from public.drop_block_players where room_id=v_room_id;
      update public.drop_block_power_state
        set match_number=(select match_number from public.drop_block_rooms where id=v_room_id),
            state=jsonb_build_object(
              'energy',to_jsonb(array_fill(0,array[v_count])),
              'shields','[]'::jsonb,'frozen',null,'doublePending',0,'pendingSeat',0),
            updated_at=now()
        where room_id=v_room_id;
    end if;
    select state into v_power from public.drop_block_power_state where room_id=v_room_id;
    -- If Double Drop's owner timed out, cancel the pending action; a
    -- different player must never inherit someone else's purchased ability.
    select turn_seat into v_next from public.drop_block_rooms where id=v_room_id;
    if coalesce((v_power->>'doublePending')::integer,0)>0
       and coalesce((v_power->>'pendingSeat')::integer,0) is distinct from v_next then
      v_power:=jsonb_set(v_power,'{doublePending}','0'::jsonb);
      v_power:=jsonb_set(v_power,'{pendingSeat}','0'::jsonb);
      update public.drop_block_power_state set state=v_power,updated_at=now()
        where room_id=v_room_id;
    end if;
    -- Frozen lanes unlock as soon as their owner comes around again, including
    -- if a turn expired while the phone was offline.
    if p_action='get' and v_power->'frozen' is not null and v_power->'frozen'<>'null'::jsonb
       and (v_power->'frozen'->>'owner')::integer=
           (select turn_seat from public.drop_block_rooms where id=v_room_id) then
      v_power:=jsonb_set(v_power,'{frozen}','null'::jsonb);
      update public.drop_block_power_state set state=v_power,updated_at=now()
        where room_id=v_room_id;
    end if;
    return v_result||jsonb_build_object('power',v_power);
  end if;

  if v_room.status<>'playing' then raise exception 'The match is not active';end if;
  if v_room.turn_deadline is not null and v_room.turn_deadline<=clock_timestamp() then
    perform public.drop_block_resolve_timeout(v_room_id);
    return public.drop_block_power_action('get',p_code,'{}'::jsonb);
  end if;
  select seat into v_seat from public.drop_block_players
    where room_id=v_room_id and user_id=v_uid;
  if v_seat is distinct from v_room.turn_seat then raise exception 'Wait for your turn';end if;
  select state into v_power from public.drop_block_power_state
    where room_id=v_room_id and match_number=v_room.match_number for update;
  if v_power is null then raise exception 'Power-Up state is not ready';end if;
  select array_agg(value::integer order by ordinality) into v_board
    from jsonb_array_elements_text(v_room.board) with ordinality as t(value,ordinality);
  select coalesce(array_agg(value::integer order by ordinality),'{}'::integer[])
    into v_shields from jsonb_array_elements_text(v_power->'shields')
    with ordinality as t(value,ordinality);
  select array_agg(value::integer order by ordinality) into v_energy
    from jsonb_array_elements_text(v_power->'energy')
    with ordinality as t(value,ordinality);
  v_frozen:=v_power->'frozen';
  v_pending:=coalesce((v_power->>'doublePending')::integer,0);
  select count(*) into v_count from public.drop_block_players where room_id=v_room_id;
  v_width:=v_room.width;v_height:=v_room.height;v_length:=v_room.win_length;
  if coalesce(array_length(v_energy,1),0)<>v_count then
    raise exception 'Power-Up energy state does not match this match';
  end if;

  if p_action='double' then
    if v_pending>0 then raise exception 'Finish your existing Double Drop first';end if;
    if v_energy[v_seat]<100 then raise exception 'Double Drop needs 100 EP';end if;
    if not exists(select 1 from generate_series(1,v_width) as c
      where v_board[c]=0) then raise exception 'The board is full';end if;
    v_energy[v_seat]:=v_energy[v_seat]-100;
    v_power:=jsonb_build_object('energy',to_jsonb(v_energy),'shields',to_jsonb(v_shields),
      'frozen',v_frozen,'doublePending',2,'pendingSeat',v_seat);
    update public.drop_block_power_state set state=v_power,updated_at=now() where room_id=v_room_id;
    update public.drop_block_rooms set last_event='⇊ DOUBLE DROP READY! Place chip 1 of 2.',
      updated_at=now() where id=v_room_id;
    return public.drop_block_power_action('get',p_code,'{}'::jsonb);
  end if;

  v_kind:=coalesce(p_data->>'kind','drop');
  if v_kind not in ('drop','shield','freeze','bomb') then raise exception 'Unknown ability';end if;
  if v_pending>0 and v_kind<>'drop' then
    raise exception 'Finish both Double Drop chips before using another ability';
  end if;
  v_col:=(p_data->>'column')::integer;
  if v_col is null or v_col<0 or v_col>=v_width then raise exception 'Invalid column';end if;
  v_before:=public.drop_block_power_threats(v_room.board,v_width,v_height,v_count,v_seat,v_length);
  v_block_before:=false;
  for v_others in 1..v_count loop
    if v_others<>v_seat and public.drop_block_power_threats(
       v_room.board,v_width,v_height,v_count,v_others,v_length)>0 then
      v_block_before:=true;exit;
    end if;
  end loop;
  v_row:=null;
  if v_kind in ('drop','freeze') then
    if v_frozen is not null and v_frozen<>'null'::jsonb
       and (v_frozen->>'column')::integer=v_col then
      raise exception 'This column is frozen';
    end if;
    if v_board[v_col+1]<>0 then raise exception 'That column is full';end if;
  end if;
  if v_kind='drop' then
    for v_y in reverse v_height-1..0 loop
      if v_board[v_y*v_width+v_col+1]=0 then v_row:=v_y;exit;end if;
    end loop;
    if v_row is null then raise exception 'That column is full';end if;
    v_board[v_row*v_width+v_col+1]:=v_seat;
    v_energy[v_seat]:=least(100,v_energy[v_seat]+10);
    if v_pending>0 then
      v_pending:=v_pending-1;
      v_event:=case when v_pending>0 then '⇊ DOUBLE DROP: Place your second chip!'
        else '⇊ DOUBLE DROP COMPLETE!' end;
      v_kind:='double';
    else
      v_event:='Player '||v_seat||' dropped a chip!';
    end if;
  else
    v_cost:=case v_kind when 'shield' then 70 when 'freeze' then 80 else 100 end;
    if v_energy[v_seat]<v_cost then raise exception 'Not enough Power Energy';end if;
    if v_kind in ('shield','bomb') then
      for v_y in 0..v_height-1 loop
        if v_board[v_y*v_width+v_col+1]<>0 then v_row:=v_y;exit;end if;
      end loop;
    end if;
    if v_kind='shield' then
      if v_row is null or v_board[v_row*v_width+v_col+1]<>v_seat then
        raise exception 'Shield a column with your own top chip';
      end if;
      v_index:=v_row*v_width+v_col;
      if v_index=any(v_shields) then raise exception 'This chip is already shielded';end if;
      v_shields:=array_append(v_shields,v_index);
      v_event:='⬡ SHIELD ACTIVE! Column '||(v_col+1)||' is protected.';
    elsif v_kind='freeze' then
      v_row:=v_height-1;
      v_frozen:=jsonb_build_object('column',v_col,'owner',v_seat);
      v_event:='❄ COLUMN '||(v_col+1)||' FROZEN!';
    else
      if v_row is null and (v_frozen is null or v_frozen='null'::jsonb
         or (v_frozen->>'column')::integer<>v_col) then
        raise exception 'Bomb an occupied or frozen column';
      end if;
      if v_row is null then v_row:=v_height-1;end if;
      v_shattered:=v_frozen is not null and v_frozen<>'null'::jsonb
        and abs((v_frozen->>'column')::integer-v_col)<=1;
      if v_shattered then v_frozen:=null;end if;
      for v_x in greatest(0,v_col-1)..least(v_width-1,v_col+1) loop
        v_index:=v_row*v_width+v_x;
        if v_index=any(v_shields) then
          v_shields:=array_remove(v_shields,v_index);
        elsif v_board[v_index+1]<>0 then
          v_board[v_index+1]:=0;
        end if;
      end loop;
      -- Gravity settle preserves shield protection on chips moved by the blast.
      v_settled:=array_fill(0,array[v_width*v_height]);
      v_newshields:='{}'::integer[];
      for v_x in 0..v_width-1 loop
        v_dest:=v_height-1;
        for v_y in reverse v_height-1..0 loop
          v_index:=v_y*v_width+v_x;
          v_chip:=v_board[v_index+1];
          if v_chip<>0 then
            v_settled[v_dest*v_width+v_x+1]:=v_chip;
            if v_index=any(v_shields) then
              v_newshields:=array_append(v_newshields,v_dest*v_width+v_x);
            end if;
            v_dest:=v_dest-1;
          end if;
        end loop;
      end loop;
      v_board:=v_settled;v_shields:=v_newshields;
      v_event:=case when v_shattered then '💥 ICE SHATTERED! Bomb broke the freeze.'
        else '💥 BOMB! Nearby unshielded chips removed.' end;
    end if;
    v_energy[v_seat]:=v_energy[v_seat]-v_cost;
  end if;

  if v_kind in ('drop','double') then
    v_after:=public.drop_block_power_threats(to_jsonb(v_board),v_width,v_height,v_count,v_seat,v_length);
    if v_after>v_before then v_energy[v_seat]:=least(100,v_energy[v_seat]+15);end if;
    if v_block_before then
      v_block_after:=false;
      for v_others in 1..v_count loop
        if v_others<>v_seat and public.drop_block_power_threats(
          to_jsonb(v_board),v_width,v_height,v_count,v_others,v_length)>0 then
          v_block_after:=true;exit;
        end if;
      end loop;
      if not v_block_after then v_energy[v_seat]:=least(100,v_energy[v_seat]+20);end if;
    end if;
  end if;

  v_winners:=public.drop_block_power_winners(to_jsonb(v_board),v_width,v_height,v_count,v_length);
  v_finished:=coalesce(array_length(v_winners,1),0)>0 or not(0=any(v_board));
  v_winner:=case when coalesce(array_length(v_winners,1),0)=1 then v_winners[1] else null end;
  if coalesce(array_length(v_winners,1),0)>1 then
    v_event:='SIMULTANEOUS CONNECTION — DRAW!';
  end if;
  if v_finished then
    v_next:=null;v_pending:=0;
  elsif v_pending>0 then
    v_next:=v_seat;
  else
    select seat into v_next from public.drop_block_players
      where room_id=v_room_id and seat>v_seat order by seat limit 1;
    if v_next is null then
      select seat into v_next from public.drop_block_players
        where room_id=v_room_id order by seat limit 1;
    end if;
  end if;
  if v_frozen is not null and v_frozen<>'null'::jsonb
     and (v_frozen->>'owner')::integer=v_next then
    v_frozen:=null;
  end if;
  v_power:=jsonb_build_object('energy',to_jsonb(v_energy),'shields',to_jsonb(v_shields),
     'frozen',v_frozen,'doublePending',v_pending,'pendingSeat',case when v_pending>0 then v_seat else 0 end);
  update public.drop_block_power_state
    set state=v_power,updated_at=now() where room_id=v_room_id;
  v_total:=v_room.move_count+1;v_sequence:=v_room.total_moves+1;
  v_points:=case when v_winner=v_seat then 1 else 0 end;
  if v_points>0 then
    update public.drop_block_players set score=score+1
      where room_id=v_room_id and seat=v_seat;
  end if;
  update public.drop_block_rooms
    set board=to_jsonb(v_board),status=case when v_finished then 'finished' else 'playing' end,
        winner_seat=v_winner,turn_seat=v_next,move_count=v_total,total_moves=v_sequence,
        last_event=v_event,last_move_at=clock_timestamp(),
        turn_deadline=case when v_finished then null else clock_timestamp()+interval '60 seconds' end,
        updated_at=now()
    where id=v_room_id;
  insert into public.drop_block_moves(
    room_id,number,user_id,seat,column_number,row_number,earned,match_number,move_kind,
    board_after,round_after,floor_clears_after,event_after,players_after,win_length
  ) values (
    v_room_id,v_sequence,v_uid,v_seat,v_col,coalesce(v_row,v_height-1),v_points,
    v_room.match_number,v_kind,to_jsonb(v_board),v_room.round_number,v_room.floor_clears,
    v_event,(select coalesce(jsonb_agg(jsonb_build_object('seat',p.seat,'score',p.score,
      'eliminated',p.eliminated) order by p.seat),'[]'::jsonb)
      from public.drop_block_players p where p.room_id=v_room_id),v_length
  );
  if v_finished then
    insert into public.drop_block_results(room_id,match_number,user_id,score,won)
      select v_room_id,v_room.match_number,p.user_id,p.score,p.seat=v_winner
      from public.drop_block_players p where p.room_id=v_room_id
      on conflict(room_id,match_number,user_id) do nothing;
  end if;
  return public.drop_block_power_action('get',p_code,'{}'::jsonb);
end $function$


-- Identity registration and every guest move go through this secure RPC.
create or replace function public.drop_block_guest_action(
 p_action text,p_code text default '',p_data jsonb default '{}'::jsonb,p_token text default ''
) returns jsonb language plpgsql security definer set search_path='' as $guest$
declare
 v_uid uuid; v_name text; v_token text; v_mode text; v_result jsonb;
begin
 if auth.uid() is not null then
  raise exception 'Signed-in players must use their shared PlayVolt account';
 end if;
 if p_action='register' then
  v_name:=left(btrim(regexp_replace(coalesce(p_data->>'nickname',''),'\s+',' ','g')),24);
  if length(v_name)<2 then
    v_name:='Guest '||upper(substr(encode(gen_random_bytes(4),'hex'),1,4));
  end if;
  v_token:=encode(gen_random_bytes(32),'hex');
  insert into public.drop_block_guest_sessions(token_hash,nickname)
  values(sha256(decode(v_token,'hex')),v_name)
  returning guest_id into v_uid;
  return jsonb_build_object('guestId',v_uid,'guestName',v_name,'guestToken',v_token);
 end if;
 if p_action not in ('create','join','get','ready','start','drop','double','rematch','cancel') then
  raise exception 'Unknown guest action';
 end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
  raise exception 'Guest session is missing; start a new guest session';
 end if;
 select s.guest_id into v_uid from public.drop_block_guest_sessions s
 where s.token_hash=sha256(decode(p_token,'hex'))
   and s.expires_at>clock_timestamp() for update;
 if v_uid is null then raise exception 'Guest session expired; start a new guest session'; end if;
 perform set_config('drop_block.guest_uid',v_uid::text,true);

 if p_action='create' then v_mode:=p_data->>'mode';
 else
   select mode into v_mode from public.drop_block_rooms
   where code=upper(btrim(p_code));
 end if;
 if v_mode='power' then
   v_result:=public.drop_block_power_action(p_action,p_code,p_data);
 else
   v_result:=public.drop_block_action(p_action,p_code,p_data);
 end if;
 return v_result;
end $guest$;
revoke all on function public.drop_block_guest_action(text,text,jsonb,text) from public,authenticated;
grant execute on function public.drop_block_guest_action(text,text,jsonb,text) to anon;
