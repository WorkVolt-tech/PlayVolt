-- Pin & Spin: isolated, server-only tables. Apply to Game DB.
-- Browser access goes through the pin-and-spin Edge Function. No public table reads.
create table public.pin_and_spin_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null check (mode in ('classic','reveal','timed-reveal','rush')),
  status text not null default 'lobby' check (status in ('lobby','playing','finished','closed')),
  host_id uuid,
  display_token text not null default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  secret integer[],
  puzzle integer not null default 0,
  round integer not null default 1,
  turn_id uuid,
  starter integer not null default 0,
  deadline timestamptz,
  winners uuid[] not null default '{}',
  creator_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index pin_and_spin_rooms_creator_idx on public.pin_and_spin_rooms(creator_hash,created_at);
create table public.pin_and_spin_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.pin_and_spin_rooms on delete cascade,
  token_hash text not null,
  name text not null check (length(name) between 1 and 20),
  seat integer not null,
  ready boolean not null default false,
  active boolean not null default true,
  unique(room_id,token_hash),
  unique(room_id,seat)
);
create table public.pin_and_spin_guesses (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.pin_and_spin_rooms on delete cascade,
  player_id uuid not null references public.pin_and_spin_players on delete cascade,
  puzzle integer not null,
  attempt integer not null check (attempt between 1 and 8),
  colors integer[],
  pins integer not null default 0,
  spins integer not null default 0,
  revealed boolean not null default false,
  submitted_at timestamptz not null default clock_timestamp(),
  unique(room_id,puzzle,player_id,attempt)
);
create index pin_and_spin_guesses_player_idx on public.pin_and_spin_guesses(player_id);
alter table public.pin_and_spin_rooms enable row level security;
alter table public.pin_and_spin_players enable row level security;
alter table public.pin_and_spin_guesses enable row level security;
revoke all on public.pin_and_spin_rooms, public.pin_and_spin_players, public.pin_and_spin_guesses from public,anon,authenticated;
grant all on public.pin_and_spin_rooms, public.pin_and_spin_players, public.pin_and_spin_guesses to service_role;
grant usage,select on sequence public.pin_and_spin_guesses_id_seq to service_role;

create function public.pin_and_spin_score(secret integer[], guess integer[])
returns integer[] language sql immutable security invoker set search_path = '' as $$
  with exact as (select count(*)::integer n from generate_subscripts(secret,1) i where secret[i]=guess[i]),
  a as (select c,count(*) n from unnest(secret) c group by c),
  b as (select c,count(*) n from unnest(guess) c group by c)
  select array[exact.n, (select coalesce(sum(least(a.n,b.n)),0)::integer from a join b using(c))-exact.n] from exact;
$$;

-- Caller holds the room lock. Advance deadlines/reveals atomically before accepting input.
create function public.pin_and_spin_advance(rid uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare r public.pin_and_spin_rooms; remaining integer; wins uuid[]; next_player uuid;
begin
  select * into r from public.pin_and_spin_rooms where id=rid;
  if r.status <> 'playing' then return; end if;
  if not exists(select 1 from public.pin_and_spin_players where room_id=rid and active) then
    update public.pin_and_spin_rooms set status='closed' where id=rid; return;
  end if;
  if r.mode in ('reveal','timed-reveal') then
    select count(*) into remaining from public.pin_and_spin_players p where p.room_id=rid and p.active
      and not exists(select 1 from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id and g.attempt=r.round);
    if remaining > 0 and (r.deadline is null or clock_timestamp()<r.deadline) then return; end if;
    insert into public.pin_and_spin_guesses(room_id,player_id,puzzle,attempt,revealed)
      select rid,p.id,r.puzzle,r.round,true from public.pin_and_spin_players p where p.room_id=rid and p.active
      on conflict(room_id,puzzle,player_id,attempt) do nothing;
    update public.pin_and_spin_guesses set revealed=true where room_id=rid and puzzle=r.puzzle and attempt=r.round;
    select array_agg(g.player_id order by p.seat) into wins from public.pin_and_spin_guesses g
      join public.pin_and_spin_players p on p.id=g.player_id
      where g.room_id=rid and g.puzzle=r.puzzle and g.attempt=r.round and g.pins=4 and p.active;
    if wins is not null or r.round=4 then
      update public.pin_and_spin_rooms set status='finished',winners=coalesce(wins,'{}'),deadline=null where id=rid;
    else
      update public.pin_and_spin_rooms set round=round+1,deadline=case when mode='timed-reveal' then clock_timestamp()+interval '3 minutes' end where id=rid;
    end if;
  elsif r.mode='rush' then
    if clock_timestamp()>=r.deadline or not exists(
      select 1 from public.pin_and_spin_players p where p.room_id=rid and p.active and
      (select count(*) from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id)<8
    ) then
      update public.pin_and_spin_rooms set status='finished',deadline=null where id=rid;
    end if;
  else
    if not exists(select 1 from public.pin_and_spin_players p where p.id=r.turn_id and p.active and
      (select count(*) from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id)<4) then
      select p.id into next_player from public.pin_and_spin_players p where p.room_id=rid and p.active and
        (select count(*) from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id)<4
        order by case when p.seat > coalesce((select seat from public.pin_and_spin_players where id=r.turn_id),0) then 0 else 1 end,p.seat limit 1;
      update public.pin_and_spin_rooms set turn_id=next_player,status=case when next_player is null then 'finished' else 'playing' end where id=rid;
    end if;
  end if;
end;
$$;

-- Only service_role can call this gateway. Player tokens are random bearer capabilities,
-- hashed at rest; display capabilities can only read redacted snapshots.
create function public.pin_and_spin_api(p_action text,p_code text default '',p_token text default '',p_data jsonb default '{}',p_origin_hash text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 r public.pin_and_spin_rooms; me public.pin_and_spin_players; pid uuid; next_player uuid;
 v_token_hash text := encode(sha256(convert_to(p_token,'UTF8')),'hex');
 nickname text := left(btrim(p_data->>'name'),20); choices integer[]; score integer[];
 n integer; lim integer; a integer; is_display boolean := false; result jsonb;
begin
 if p_action not in ('create','join','state','ready','start','guess','leave','replay','display') then raise exception 'Unknown action'; end if;
 if p_action <> 'display' and (p_token is null or p_token !~ '^[a-f0-9]{64}$') then raise exception 'Invalid player session'; end if;
 if p_action='create' then
   if nickname is null or length(nickname)<1 then raise exception 'Enter your name'; end if;
   if coalesce(p_data->>'mode','') not in ('classic','reveal','timed-reveal','rush') then raise exception 'Choose a game mode'; end if;
   perform pg_advisory_xact_lock(hashtextextended(p_origin_hash,0));
   if (select count(*) from public.pin_and_spin_rooms where creator_hash=p_origin_hash and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many rooms. Try again later'; end if;
   -- Retrying the same create request returns the existing room, avoiding duplicate rooms.
   select rm.* into r from public.pin_and_spin_rooms rm join public.pin_and_spin_players p on p.room_id=rm.id
     where p.token_hash=v_token_hash and rm.expires_at>now() and rm.status<>'closed' order by rm.created_at desc limit 1;
   if not found then
     loop
       begin
         insert into public.pin_and_spin_rooms(code,mode,creator_hash)
           values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),p_data->>'mode',p_origin_hash) returning * into r;
         exit;
       exception when unique_violation then null;
       end;
     end loop;
     insert into public.pin_and_spin_players(room_id,token_hash,name,seat,ready)
       values(r.id,v_token_hash,nickname,1,true) returning id into pid;
     update public.pin_and_spin_rooms set host_id=pid where id=r.id;
   end if;
   p_code := r.code;
 end if;
 select * into r from public.pin_and_spin_rooms where code=upper(btrim(p_code)) for update;
 if not found or r.expires_at<now() or r.status='closed' then raise exception 'Room not found or expired'; end if;
 if p_action='display' then
   if p_token is null or p_token<>r.display_token then raise exception 'Invalid display link'; end if;
   is_display := true;
 else
   select * into me from public.pin_and_spin_players where room_id=r.id and pin_and_spin_players.token_hash=v_token_hash;
   if p_action='join' and (me.id is null or not me.active) then
     if r.status<>'lobby' then raise exception 'This game has already started'; end if;
     if nickname is null or length(nickname)<1 then raise exception 'Enter your name'; end if;
     if (select count(*) from public.pin_and_spin_players where room_id=r.id and active)>=10 then raise exception 'This room is full'; end if;
     if exists(select 1 from public.pin_and_spin_players where room_id=r.id and active and lower(name)=lower(nickname)) then raise exception 'That name is already taken'; end if;
     if me.id is null then
       insert into public.pin_and_spin_players(room_id,token_hash,name,seat)
       select r.id,v_token_hash,nickname,coalesce(max(seat),0)+1 from public.pin_and_spin_players where room_id=r.id returning * into me;
     else
       update public.pin_and_spin_players set active=true,ready=false,name=nickname where id=me.id returning * into me;
     end if;
   end if;
   if me.id is null or not me.active then raise exception 'Your seat is no longer in this room'; end if;
 end if;
 perform public.pin_and_spin_advance(r.id);
 select * into r from public.pin_and_spin_rooms where id=r.id;
 if p_action='ready' then
   if r.status<>'lobby' then raise exception 'Game has already started'; end if;
   update public.pin_and_spin_players set ready=coalesce((p_data->>'ready')::boolean,false) where id=me.id;
 elsif p_action='replay' then
   if me.id<>r.host_id or r.status<>'finished' then raise exception 'Only the host can start a rematch after the game'; end if;
   update public.pin_and_spin_rooms set status='lobby',secret=null,winners='{}',deadline=null,turn_id=null where id=r.id;
   update public.pin_and_spin_players set ready=(id=r.host_id) where room_id=r.id and active;
 elsif p_action='start' then
   if me.id<>r.host_id or r.status<>'lobby' then raise exception 'Only the host can start from the lobby'; end if;
   select count(*) into n from public.pin_and_spin_players where room_id=r.id and active;
   if n<2 then raise exception 'At least two players are needed'; end if;
   if exists(select 1 from public.pin_and_spin_players where room_id=r.id and active and not ready) then raise exception 'Wait for everyone to be ready'; end if;
   select array_agg(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,2))::bit(8)::integer % 6) into choices from generate_series(1,4);
   select id into next_player from public.pin_and_spin_players where room_id=r.id and active order by seat offset (r.starter % n) limit 1;
   update public.pin_and_spin_rooms set status='playing',secret=choices,puzzle=puzzle+1,round=1,starter=starter+1,turn_id=next_player,winners='{}',
     deadline=case when mode in ('rush','timed-reveal') then clock_timestamp()+interval '3 minutes' end where id=r.id;
 elsif p_action='guess' then
   -- A late request returns current state without accepting or rolling back deadline advancement.
   if r.status='playing' and (p_data->>'puzzle')::integer=r.puzzle then
     select count(*)+1 into a from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id;
     lim := case when r.mode='rush' then 8 else 4 end;
     if r.mode in ('reveal','timed-reveal') then a:=r.round; end if;
     if (p_data->>'attempt')::integer=a and a<=lim and (r.mode<>'classic' or r.turn_id=me.id)
       and not exists(select 1 from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id and attempt=a) then
       if jsonb_typeof(p_data->'colors')<>'array' or jsonb_array_length(p_data->'colors')<>4 then raise exception 'Choose four colors'; end if;
       select array_agg(value::integer) into choices from jsonb_array_elements_text(p_data->'colors');
       if choices is null or exists(select 1 from unnest(choices) c where c is null or c<0 or c>5) then raise exception 'Invalid color'; end if;
       score:=public.pin_and_spin_score(r.secret,choices);
       insert into public.pin_and_spin_guesses(room_id,player_id,puzzle,attempt,colors,pins,spins,revealed)
         values(r.id,me.id,r.puzzle,a,choices,score[1],score[2],r.mode in ('classic','rush'));
       if r.mode in ('classic','rush') and score[1]=4 then
         update public.pin_and_spin_rooms set status='finished',winners=array[me.id],deadline=null where id=r.id;
       elsif r.mode='classic' then
         select p.id into next_player from public.pin_and_spin_players p where p.room_id=r.id and p.active and
           (select count(*) from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and g.player_id=p.id)<4
           order by case when p.seat>me.seat then 0 else 1 end,p.seat limit 1;
         update public.pin_and_spin_rooms set turn_id=next_player,status=case when next_player is null then 'finished' else 'playing' end where id=r.id;
       end if;
     end if;
   end if;
 elsif p_action='leave' then
   update public.pin_and_spin_players set active=false,ready=false where id=me.id;
   if me.id=r.host_id then
     select id into next_player from public.pin_and_spin_players where room_id=r.id and active order by seat limit 1;
     update public.pin_and_spin_rooms set host_id=next_player,status=case when next_player is null then 'closed' else status end where id=r.id;
   end if;
   perform public.pin_and_spin_advance(r.id);
   return jsonb_build_object('left',true);
 end if;
 perform public.pin_and_spin_advance(r.id);
 select * into r from public.pin_and_spin_rooms where id=r.id;
 select jsonb_build_object(
   'code',r.code,'mode',r.mode,'status',r.status,'hostId',r.host_id,'me',me.id,
   'puzzle',r.puzzle,'round',r.round,'turnId',r.turn_id,'deadline',r.deadline,
   'serverTime',clock_timestamp(),'winners',r.winners,
   'answer',case when r.status='finished' then to_jsonb(r.secret) else null end,
   'displayToken',case when not is_display then r.display_token else null end,
   'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'seat',p.seat,'ready',p.ready,'active',p.active,
     'submitted',exists(select 1 from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and g.player_id=p.id and g.attempt=r.round)) order by p.seat)
     from public.pin_and_spin_players p where p.room_id=r.id and (p.active or r.status<>'lobby')),'[]'::jsonb),
   'guesses',coalesce((select jsonb_agg(jsonb_build_object('playerId',g.player_id,'attempt',g.attempt,'colors',g.colors,
     'pins',case when g.revealed then g.pins else null end,'spins',case when g.revealed then g.spins else null end,'revealed',g.revealed) order by g.id)
     from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and (g.revealed or (not is_display and g.player_id=me.id))),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;
revoke all on function public.pin_and_spin_score(integer[],integer[]), public.pin_and_spin_advance(uuid), public.pin_and_spin_api(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.pin_and_spin_score(integer[],integer[]), public.pin_and_spin_advance(uuid), public.pin_and_spin_api(text,text,text,jsonb,text) to service_role;
