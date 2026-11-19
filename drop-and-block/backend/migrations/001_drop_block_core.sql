-- Drop & Block: new PlayVolt game. Additive only; no existing game tables changed.
-- All new database objects use the drop_block_ prefix.
create table if not exists public.drop_block_rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique check (code ~ '^[A-F0-9]{6}$'),
 host_id uuid not null references auth.users(id),
 mode text not null check (mode in ('classic','territory')),
 status text not null default 'lobby' check (status in ('lobby','playing','finished')),
 max_players integer not null check (max_players between 2 and 8),
 width integer not null check (width between 7 and 14),
 height integer not null check (height between 6 and 10),
 board jsonb not null,
 turn_seat integer,
 winner_seat integer,
 move_count integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
comment on table public.drop_block_rooms is 'Drop & Block by PlayVolt: multiplayer rooms, gravity board and turn state';

create table if not exists public.drop_block_players (
 room_id uuid not null references public.drop_block_rooms(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 seat integer not null check (seat between 1 and 8),
 name text not null,
 ready boolean not null default false,
 score integer not null default 0,
 primary key (room_id,user_id),
 unique (room_id,seat)
);
comment on table public.drop_block_players is 'Drop & Block by PlayVolt: shared-account participants, seats and scores';

create table if not exists public.drop_block_moves (
 room_id uuid not null references public.drop_block_rooms(id) on delete cascade,
 number integer not null,
 user_id uuid not null references public.profiles(id) on delete cascade,
 seat integer not null,
 column_number integer not null,
 row_number integer not null,
 earned integer not null default 0,
 created_at timestamptz not null default now(),
 primary key (room_id,number)
);
comment on table public.drop_block_moves is 'Drop & Block by PlayVolt: authoritative move history';

create table if not exists public.drop_block_results (
 room_id uuid not null references public.drop_block_rooms(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 score integer not null default 0,
 won boolean not null default false,
 created_at timestamptz not null default now(),
 primary key (room_id,user_id)
);
comment on table public.drop_block_results is 'Drop & Block by PlayVolt: signed-in player match results for future leaderboards';

alter table public.drop_block_rooms enable row level security;
alter table public.drop_block_players enable row level security;
alter table public.drop_block_moves enable row level security;
alter table public.drop_block_results enable row level security;
-- No browser table access: authenticated players call the checked, transactional RPC.
revoke all on public.drop_block_rooms,public.drop_block_players,public.drop_block_moves,public.drop_block_results from public,anon,authenticated;

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
begin
 if v_uid is null then raise exception 'Sign in to your PlayVolt account first'; end if;
 if p_action not in ('create','join','get','ready','start','drop') then raise exception 'Unknown action'; end if;

 if p_action='create' then
   select left(nullif(btrim(nickname),''),24) into v_name from public.profiles where id=v_uid;
   if v_name is null then raise exception 'Open Dekabess to finish setting up your PlayVolt profile'; end if;
   if (select count(*) from public.drop_block_rooms where host_id=v_uid and created_at>now()-interval '1 day')>=20 then
     raise exception 'Too many rooms created today';
   end if;
   v_max := coalesce((p_data->>'maxPlayers')::integer,4);
   if v_max not between 2 and 8 then raise exception 'Choose 2 to 8 players'; end if;
   if coalesce(p_data->>'mode','') not in ('classic','territory') then raise exception 'Choose a game mode'; end if;
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

 if p_action='ready' then
   if v_room.status<>'lobby' then raise exception 'The match has already started'; end if;
   update public.drop_block_players set ready=coalesce((p_data->>'ready')::boolean,false)
     where room_id=v_room.id and user_id=v_uid;
 elsif p_action='start' then
   if v_room.host_id<>v_uid then raise exception 'Only the room host can start'; end if;
   if v_room.status<>'lobby' then raise exception 'The match is already underway'; end if;
   select count(*) into v_count from public.drop_block_players where room_id=v_room.id;
   if v_count<2 then raise exception 'At least two players are needed'; end if;
   if exists(select 1 from public.drop_block_players where room_id=v_room.id and not ready) then
     raise exception 'Wait until all players are ready';
   end if;
   update public.drop_block_rooms set status='playing',turn_seat=1,updated_at=now() where id=v_room.id;
 elsif p_action='drop' then
   if v_room.status<>'playing' then raise exception 'This room is not currently playing'; end if;
   if v_room.turn_seat<>v_seat then raise exception 'Wait for your turn'; end if;
   v_col:=(p_data->>'column')::integer;
   if v_col is null or v_col<0 or v_col>=v_room.width then raise exception 'Invalid column'; end if;
   v_board:=v_room.board;
   v_row:=null;
   for v_y in reverse (v_room.height-1)..0 loop
     if (v_board->>(v_y*v_room.width+v_col))::integer=0 then v_row:=v_y; exit; end if;
   end loop;
   if v_row is null then raise exception 'That column is full'; end if;
   v_board:=jsonb_set(v_board,array[(v_row*v_room.width+v_col)::text],to_jsonb(v_seat),false);

   -- Count newly completed directions through this specific move (4-in-a-row).
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
         v_x:=v_x+v_sign*v_dx;
         v_y:=v_y+v_sign*v_dy;
       end loop;
     end loop;
     if v_length>=4 then v_points:=v_points+1; end if;
   end loop;
   update public.drop_block_players set score=score+v_points
     where room_id=v_room.id and user_id=v_uid;
   v_total:=v_room.move_count+1;
   insert into public.drop_block_moves(room_id,number,user_id,seat,column_number,row_number,earned)
     values(v_room.id,v_total,v_uid,v_seat,v_col,v_row,v_points);

   if v_room.mode='classic' and v_points>0 then
     v_winner:=v_seat;
   elsif v_total=v_room.width*v_room.height and v_room.mode='territory' then
     select max(score) into v_best from public.drop_block_players where room_id=v_room.id;
     select count(*) into v_ties from public.drop_block_players where room_id=v_room.id and score=v_best;
     if v_ties=1 then
       select seat into v_winner from public.drop_block_players where room_id=v_room.id and score=v_best;
     end if;
   end if;
   if v_winner is not null or v_total=v_room.width*v_room.height then
     update public.drop_block_rooms
       set status='finished',board=v_board,move_count=v_total,winner_seat=v_winner,turn_seat=null,updated_at=now()
       where id=v_room.id;
     insert into public.drop_block_results(room_id,user_id,score,won)
       select v_room.id,user_id,score,(seat=v_winner) from public.drop_block_players
       where room_id=v_room.id on conflict(room_id,user_id) do nothing;
   else
     select seat into v_next from public.drop_block_players where room_id=v_room.id and seat>v_seat order by seat limit 1;
     if v_next is null then
       select seat into v_next from public.drop_block_players where room_id=v_room.id order by seat limit 1;
     end if;
     update public.drop_block_rooms
       set board=v_board,turn_seat=v_next,move_count=v_total,updated_at=now() where id=v_room.id;
   end if;
 end if;

 select * into v_room from public.drop_block_rooms where id=v_room.id;
 return jsonb_build_object(
   'code',v_room.code,'mode',v_room.mode,'status',v_room.status,'maxPlayers',v_room.max_players,
   'width',v_room.width,'height',v_room.height,'board',v_room.board,
   'moveCount',v_room.move_count,'turnSeat',v_room.turn_seat,'winnerSeat',v_room.winner_seat,
   'host',v_room.host_id=v_uid,'meSeat',v_seat,
   'players',coalesce((
      select jsonb_agg(jsonb_build_object('seat',seat,'name',name,'ready',ready,'score',score)
                        order by seat)
      from public.drop_block_players where room_id=v_room.id
   ),'[]'::jsonb)
 );
end;
$$;
revoke all on function public.drop_block_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.drop_block_action(text,text,jsonb) to authenticated;