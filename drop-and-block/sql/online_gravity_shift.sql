-- Online Gravity Shift. Shared PlayVolt Game DB, game-owned objects only.
-- Local game parity: 4 valid drops -> shift left/right alternately -> settle down.
-- A direct connection finishes before shifting; simultaneous shift winners draw.
-- Run BEGIN; [this file]; [smoke test]; ROLLBACK; before any production install.
--
-- Extend only Drop & Block's existing room mode constraint.
alter table public.drop_block_rooms drop constraint if exists drop_block_rooms_mode_check;
alter table public.drop_block_rooms add constraint drop_block_rooms_mode_check
check(mode in ('classic','territory','elimination','collapse','chaos','team','speed','power','gravity'));

-- Old drop_block_action is intentionally unchanged. Directly using it to move
-- a Gravity room cannot bypass the server-side shift rules.
create or replace function public.drop_block_gravity_guard()
returns trigger language plpgsql set search_path='' as $guard$
begin
 if old.mode='gravity' and new.board is distinct from old.board
    and coalesce(current_setting('drop_block.gravity_write',true),'')<>'on' then
   raise exception 'Gravity Shift moves must use the Gravity game endpoint';
 end if;
 return new;
end $guard$;
drop trigger if exists drop_block_gravity_guard_room on public.drop_block_rooms;
create trigger drop_block_gravity_guard_room before update on public.drop_block_rooms
for each row execute function public.drop_block_gravity_guard();
revoke all on function public.drop_block_gravity_guard() from public,anon,authenticated;

-- Exactly mirrors arcadeModes.js applyGravityShift:
-- compact occupied cells within each row toward LEFT or RIGHT,
-- then let those chips settle downward within each column.
create or replace function public.drop_block_gravity_settle(
 p_board jsonb,p_width integer,p_height integer,p_direction text
) returns jsonb language plpgsql immutable set search_path='' as $settle$
declare
 v_stage integer[]:=array_fill(0,array[p_width*p_height]);
 v_result integer[]:=array_fill(0,array[p_width*p_height]);
 v_row integer;v_col integer;v_chip integer;v_count integer;v_target integer;
begin
 if p_direction not in ('left','right') or jsonb_array_length(p_board)<>p_width*p_height then
   raise exception 'Invalid Gravity Shift board or direction';
 end if;
 for v_row in 0..p_height-1 loop
   v_count:=0;
   for v_col in 0..p_width-1 loop
     if (p_board->>(v_row*p_width+v_col))::integer<>0 then v_count:=v_count+1;end if;
   end loop;
   v_target:=case when p_direction='right' then p_width-v_count else 0 end;
   for v_col in 0..p_width-1 loop
     v_chip:=(p_board->>(v_row*p_width+v_col))::integer;
     if v_chip<>0 then
       v_stage[v_row*p_width+v_target+1]:=v_chip;
       v_target:=v_target+1;
     end if;
   end loop;
 end loop;
 for v_col in 0..p_width-1 loop
   v_target:=p_height-1;
   for v_row in reverse p_height-1..0 loop
     v_chip:=v_stage[v_row*p_width+v_col+1];
     if v_chip<>0 then
       v_result[v_target*p_width+v_col+1]:=v_chip;
       v_target:=v_target-1;
     end if;
   end loop;
 end loop;
 return to_jsonb(v_result);
end $settle$;
revoke all on function public.drop_block_gravity_settle(jsonb,integer,integer,text)
 from public,anon,authenticated;

-- Preserve existing legacy room response keys; append Gravity metadata and
-- mark whether the most recent accepted move shifted the board.
create or replace function public.drop_block_gravity_snapshot(
 p_room_id uuid,p_response jsonb
) returns jsonb language plpgsql set search_path='' as $snap$
declare
 v_room public.drop_block_rooms;
 v_last jsonb:=p_response->'lastMove';
 v_last_event text;
 v_shift_event text;
 v_last_direction text;
 v_direction text;
begin
 select * into v_room from public.drop_block_rooms where id=p_room_id;
 if not found or v_room.mode<>'gravity' then raise exception 'Gravity Shift room missing';end if;
 if jsonb_typeof(v_last)='object' then
   select m.event_after into v_last_event
   from public.drop_block_moves m
   where m.room_id=p_room_id and m.match_number=v_room.match_number
     and m.number=(v_last->>'number')::integer;
   v_last:=v_last||jsonb_build_object(
     'shifted',coalesce(v_last_event like '🌪 GRAVITY SHIFT %',false),
     'shiftDirection',case when v_last_event like '🌪 GRAVITY SHIFT LEFT%' then 'left'
                           when v_last_event like '🌪 GRAVITY SHIFT RIGHT%' then 'right'
                           else null end
   );
 end if;
 select m.event_after into v_shift_event from public.drop_block_moves m
 where m.room_id=p_room_id and m.match_number=v_room.match_number
    and m.event_after like '🌪 GRAVITY SHIFT %'
 order by m.number desc limit 1;
 v_last_direction:=case when v_shift_event like '🌪 GRAVITY SHIFT LEFT%' then 'left'
                        when v_shift_event like '🌪 GRAVITY SHIFT RIGHT%' then 'right'
                        else null end;
 v_direction:=case when ((v_room.move_count/4)%2)=0 then 'left' else 'right' end;
 return p_response||jsonb_build_object(
  'lastMove',coalesce(v_last,'null'::jsonb),
  'gravity',jsonb_build_object('drops',v_room.move_count,
     'nextDirection',v_direction,'lastShift',v_last_direction));
end $snap$;
revoke all on function public.drop_block_gravity_snapshot(uuid,jsonb)
 from public,anon,authenticated;

create or replace function public.drop_block_gravity_action(
 p_action text,p_code text default '',p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $gravity$
declare
 v_uid uuid:=coalesce(auth.uid(),nullif(current_setting('drop_block.guest_uid',true),'')::uuid);
 v_room public.drop_block_rooms;
 v_result jsonb;
 v_room_id uuid;
 v_seat integer;
 v_count integer;
 v_col integer;
 v_row integer;
 v_y integer;
 v_total integer;
 v_sequence integer;
 v_next integer;
 v_width integer;
 v_height integer;
 v_board integer[];
 v_winners integer[];
 v_winner integer;
 v_finished boolean;
 v_shifted boolean:=false;
 v_direction text;
 v_event text:='';
 v_earned integer;
begin
 if v_uid is null then raise exception 'Join or create a room before playing';end if;
 if p_action not in ('create','join','get','ready','start','drop','rematch','cancel') then
   raise exception 'Unknown Gravity Shift action';
 end if;
 -- Safe only within this transaction, and only when the authenticated or
 -- guest-session-verified player invoked this authorized Gravity endpoint.
 perform set_config('drop_block.gravity_write','on',true);

 if p_action='create' then
   if p_data->>'mode'<>'gravity' then raise exception 'Expected Gravity Shift mode';end if;
   v_result:=public.drop_block_action('create','',p_data||'{"mode":"classic"}'::jsonb);
   p_code:=v_result->>'code';
   update public.drop_block_rooms set mode='gravity',updated_at=now()
   where code=p_code and host_id=v_uid and status='lobby'
   returning id into v_room_id;
   if v_room_id is null then raise exception 'Unable to create Gravity Shift room';end if;
   return public.drop_block_gravity_action('get',p_code,'{}'::jsonb);
 end if;

 if p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{6}$' then
   raise exception 'Enter a six-character room code';
 end if;
 select * into v_room from public.drop_block_rooms
 where code=upper(btrim(p_code)) for update;
 if not found or v_room.mode<>'gravity'
    or v_room.created_at<now()-interval '24 hours' then
   raise exception 'Gravity Shift room not found or expired';
 end if;
 v_room_id:=v_room.id;
 if p_action<>'join' and not exists(
   select 1 from public.drop_block_players p
    where p.room_id=v_room_id and p.user_id=v_uid
 ) then raise exception 'Join this room before playing';end if;

 if p_action<>'drop' then
   v_result:=public.drop_block_action(p_action,p_code,p_data);
   return public.drop_block_gravity_snapshot(v_room_id,v_result);
 end if;

 if v_room.status<>'playing' then raise exception 'The match is not active';end if;
 if v_room.turn_deadline is not null and v_room.turn_deadline<=clock_timestamp() then
   perform public.drop_block_resolve_timeout(v_room_id);
   return public.drop_block_gravity_action('get',p_code,'{}'::jsonb);
 end if;
 if coalesce(p_data->>'kind','drop')<>'drop' then
   raise exception 'Gravity Shift allows ordinary chip drops only';
 end if;
 select p.seat into v_seat from public.drop_block_players p
   where p.room_id=v_room_id and p.user_id=v_uid;
 if v_seat is distinct from v_room.turn_seat then raise exception 'Wait for your turn';end if;

 v_width:=v_room.width;v_height:=v_room.height;
 v_col:=(p_data->>'column')::integer;
 if v_col is null or v_col<0 or v_col>=v_width then raise exception 'Invalid column';end if;
 select array_agg(value::integer order by ordinality) into v_board
   from jsonb_array_elements_text(v_room.board)
   with ordinality as cell(value,ordinality);
 if coalesce(array_length(v_board,1),0)<>v_width*v_height then
   raise exception 'Invalid board dimensions';
 end if;
 v_row:=null;
 for v_y in reverse v_height-1..0 loop
   if v_board[v_y*v_width+v_col+1]=0 then v_row:=v_y;exit;end if;
 end loop;
 if v_row is null then raise exception 'That column is full';end if;
 v_board[v_row*v_width+v_col+1]:=v_seat;

 select count(*) into v_count from public.drop_block_players
 where room_id=v_room_id;
 v_total:=v_room.move_count+1;
 v_sequence:=v_room.total_moves+1;
 v_winners:=public.drop_block_power_winners(
   to_jsonb(v_board),v_width,v_height,v_count,v_room.win_length);
 -- A direct connection ends the match *before* the scheduled shift.
 if coalesce(cardinality(v_winners),0)=0 and v_total%4=0 then
   v_direction:=case when ((v_total/4-1)%2)=0 then 'left' else 'right' end;
   select array_agg(value::integer order by ordinality) into v_board
      from jsonb_array_elements_text(public.drop_block_gravity_settle(
        to_jsonb(v_board),v_width,v_height,v_direction))
      with ordinality as shifted(value,ordinality);
   v_shifted:=true;
   v_winners:=public.drop_block_power_winners(
      to_jsonb(v_board),v_width,v_height,v_count,v_room.win_length);
 end if;
 v_winner:=case when cardinality(v_winners)=1 then v_winners[1] else null end;
 v_finished:=coalesce(cardinality(v_winners),0)>0 or not(0=any(v_board));
 if v_shifted then
   v_event:='🌪 GRAVITY SHIFT '||upper(v_direction)||'! '||
     case when cardinality(v_winners)>1 then 'Multiple connections — DRAW!'
          when v_winner is not null then 'Player '||v_winner||' wins after the shift!'
          else 'All chips rearranged!' end;
 elsif v_winner is not null then
   v_event:='Player '||v_winner||' connected '||v_room.win_length||'!';
 elsif cardinality(v_winners)>1 then
   v_event:='Multiple simultaneous connections — DRAW!';
 end if;

 if v_finished then v_next:=null;
 else
   select p.seat into v_next from public.drop_block_players p
   where p.room_id=v_room_id and p.seat>v_seat order by p.seat limit 1;
   if v_next is null then
     select p.seat into v_next from public.drop_block_players p
      where p.room_id=v_room_id order by p.seat limit 1;
   end if;
 end if;
 v_earned:=case when v_winner=v_seat then 1 else 0 end;
 if v_winner is not null then
   update public.drop_block_players set score=score+1
   where room_id=v_room_id and seat=v_winner;
 end if;
 update public.drop_block_rooms
 set board=to_jsonb(v_board),status=case when v_finished then 'finished' else 'playing' end,
   winner_seat=v_winner,turn_seat=v_next,move_count=v_total,total_moves=v_sequence,
   last_event=v_event,last_move_at=clock_timestamp(),
   turn_deadline=case when v_finished then null else clock_timestamp()+interval '60 seconds' end,
   updated_at=now()
 where id=v_room_id;
 insert into public.drop_block_moves(
    room_id,number,user_id,seat,column_number,row_number,earned,
    match_number,move_kind,board_after,round_after,floor_clears_after,
    event_after,players_after,win_length
 ) values(
    v_room_id,v_sequence,v_uid,v_seat,v_col,v_row,v_earned,
    v_room.match_number,'drop',to_jsonb(v_board),v_room.round_number,v_room.floor_clears,
    v_event,(select coalesce(jsonb_agg(
      jsonb_build_object('seat',p.seat,'score',p.score,'eliminated',p.eliminated)
      order by p.seat),'[]'::jsonb)
      from public.drop_block_players p where p.room_id=v_room_id),v_room.win_length
 );
 if v_finished then
   insert into public.drop_block_results(room_id,match_number,user_id,score,won)
   select v_room_id,v_room.match_number,p.user_id,p.score,p.seat=v_winner
   from public.drop_block_players p where p.room_id=v_room_id
   on conflict(room_id,match_number,user_id) do nothing;
 end if;
 return public.drop_block_gravity_action('get',p_code,'{}'::jsonb);
end $gravity$;
revoke all on function public.drop_block_gravity_action(text,text,jsonb) from public;
grant execute on function public.drop_block_gravity_action(text,text,jsonb) to anon,authenticated;

-- Keep the existing guest-seat validator/token storage and shared account
-- system completely intact. Only dispatch Gravity rooms to their own RPC.

CREATE OR REPLACE FUNCTION public.drop_block_guest_action(p_action text, p_code text DEFAULT ''::text, p_data jsonb DEFAULT '{}'::jsonb, p_token text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_uid uuid; v_name text; v_token text; v_mode text; v_result jsonb;
begin
 if auth.uid() is not null then
  raise exception 'Signed-in players must use their shared PlayVolt account';
 end if;
 if p_action='register' then
  v_name:=left(btrim(regexp_replace(coalesce(p_data->>'nickname',''),'\s+',' ','g')),24);
  if length(v_name)<2 then
    v_name:='Guest '||upper(substr(encode(extensions.gen_random_bytes(4),'hex'),1,4));
  end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
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
 elsif v_mode='gravity' then
   v_result:=public.drop_block_gravity_action(p_action,p_code,p_data);
 else
   v_result:=public.drop_block_action(p_action,p_code,p_data);
 end if;
 return v_result;
end $function$;

revoke all on function public.drop_block_guest_action(text,text,jsonb,text) from public,authenticated;
grant execute on function public.drop_block_guest_action(text,text,jsonb,text) to anon;

-- The existing TV bearer-token RPC remains the authorization gate.
-- Gravity metadata is added only after its valid room+display token check.
CREATE OR REPLACE FUNCTION public.drop_block_tv_state(p_code text, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 r public.drop_block_rooms;
 v_result jsonb;
begin
 if p_code is null or p_code !~ '^[A-Fa-f0-9]{6}$'
    or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid TV display link';
 end if;
 select * into r from public.drop_block_rooms
  where code=upper(p_code) and display_token=p_token
    and created_at>now()-interval '24 hours';
 if not found then raise exception 'TV display link is unavailable or expired'; end if;
 v_result:=jsonb_build_object(
   'code',r.code,'mode',r.mode,'status',r.status,'maxPlayers',r.max_players,
   'width',r.width,'height',r.height,'winLength',r.win_length,'board',r.board,
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
   'eliminationRoundOpensAt',r.elimination_round_opens_at,
   'eliminationPreviousBoard',r.elimination_previous_board,
   'eliminationTargetSeat',r.elimination_target_seat,
   'eliminationScorerSeat',r.elimination_scorer_seat,
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
if r.mode='gravity' then
   return public.drop_block_gravity_snapshot(r.id,v_result);
 end if;
 return v_result;
end;
$function$;
