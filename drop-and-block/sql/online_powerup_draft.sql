-- Drop & Block / Online Power-Up Arcade
-- DRAFT ONLY. Install on an isolated Supabase development branch before enabling UI.
-- All abilities are validated in the same DB transaction as the board update.
-- Existing Classic / Chaos / Team / Speed rules remain under drop_block_action.
--
-- The state table is not readable or writable directly by browser credentials.
-- Extend the existing Drop & Block room-mode constraint without replacing the DB.
alter table public.drop_block_rooms drop constraint if exists drop_block_rooms_mode_check;
alter table public.drop_block_rooms add constraint drop_block_rooms_mode_check
  check (mode in ('classic','territory','elimination','collapse','chaos','team','speed','power'));

create table if not exists public.drop_block_power_state (
  room_id uuid primary key references public.drop_block_rooms(id) on delete cascade,
  match_number integer not null default 1,
  state jsonb not null default '{"energy":[],"shields":[],"frozen":null,"doublePending":0}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.drop_block_power_state enable row level security;
revoke all on public.drop_block_power_state from public, anon, authenticated;

-- Stop clients from bypassing power energy / frozen-lane checks through the old RPC.
create or replace function public.drop_block_power_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.mode='power' and new.board is distinct from old.board
     and coalesce(current_setting('drop_block.power_write',true),'')<>'on' then
    raise exception 'Power-Up moves must use the power game endpoint';
  end if;
  return new;
end $$;
drop trigger if exists drop_block_power_guard_room on public.drop_block_rooms;
create trigger drop_block_power_guard_room before update on public.drop_block_rooms
for each row execute function public.drop_block_power_guard();

-- Returns all seats with any complete connection; multiple winners produce a draw.
create or replace function public.drop_block_power_winners(
  p_board jsonb,p_width integer,p_height integer,p_count integer,p_length integer
) returns integer[] language plpgsql immutable set search_path = '' as $$
declare
  v_x integer;v_y integer;v_dir integer;v_k integer;v_xx integer;v_yy integer;
  v_dx integer;v_dy integer;v_seat integer;v_ok boolean;v_winners integer[]:='{}';
begin
  for v_y in 0..p_height-1 loop
    for v_x in 0..p_width-1 loop
      v_seat:=(p_board->>(v_y*p_width+v_x))::integer;
      if v_seat<1 or v_seat>p_count or v_seat=any(v_winners) then continue; end if;
      for v_dir in 1..4 loop
        v_dx:=case when v_dir=2 then 0 else 1 end;
        v_dy:=case v_dir when 1 then 0 when 2 then 1 when 3 then 1 else -1 end;
        v_ok:=true;
        for v_k in 1..p_length-1 loop
          v_xx:=v_x+v_k*v_dx;v_yy:=v_y+v_k*v_dy;
          if v_xx<0 or v_xx>=p_width or v_yy<0 or v_yy>=p_height
             or (p_board->>(v_yy*p_width+v_xx))::integer<>v_seat then
            v_ok:=false;exit;
          end if;
        end loop;
        if v_ok then v_winners:=array_append(v_winners,v_seat);exit;end if;
      end loop;
    end loop;
  end loop;
  return v_winners;
end $$;

create or replace function public.drop_block_power_threats(
  p_board jsonb,p_width integer,p_height integer,p_count integer,p_seat integer,p_length integer
) returns integer language plpgsql immutable set search_path='' as $$
declare
  v_x integer;v_y integer;v_test jsonb;v_threats integer:=0;
begin
  for v_x in 0..p_width-1 loop
    v_y:=null;
    for v_y in reverse p_height-1..0 loop
      exit when (p_board->>(v_y*p_width+v_x))::integer=0;
    end loop;
    if (p_board->>(v_y*p_width+v_x))::integer<>0 then v_y:=null;end if;
    if v_y is null then continue; end if;
    v_test:=jsonb_set(p_board,array[(v_y*p_width+v_x)::text],to_jsonb(p_seat),false);
    if p_seat=any(public.drop_block_power_winners(v_test,p_width,p_height,p_count,p_length)) then
      v_threats:=v_threats+1;
    end if;
  end loop;
  return v_threats;
end $$;

-- Same shape as drop_block_action; only power rooms use this RPC.
create or replace function public.drop_block_power_action(
  p_action text,p_code text default '',p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid();v_result jsonb;v_room public.drop_block_rooms;v_room_id uuid;
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
end $$;
revoke all on function public.drop_block_power_action(text,text,jsonb) from public,anon;
grant execute on function public.drop_block_power_action(text,text,jsonb) to authenticated;
