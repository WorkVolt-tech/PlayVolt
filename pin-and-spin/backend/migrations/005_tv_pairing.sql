-- Pin & Spin migration 005: connect a TV with a short code instead of typing a long link.
--   1. The TV opens /tv and asks for a code (tv_start) with its own random TV token.
--   2. A player in a room types that code on their phone (tv_pair).
--   3. The TV checks its code (tv_check) and receives the room code + display token.
-- The TV gets only the room's read-only display capability, never a player seat.
-- A separate function, so pin_and_spin_api() is untouched. Safe to run more than once.
create table if not exists public.pin_and_spin_tv_pairings (
  code text primary key check (code ~ '^[A-Z0-9]{4}$'),
  tv_hash text not null unique,
  room_id uuid references public.pin_and_spin_rooms on delete cascade,
  origin_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index if not exists pin_and_spin_tv_pairings_origin_idx on public.pin_and_spin_tv_pairings(origin_hash, created_at);
comment on table public.pin_and_spin_tv_pairings is 'Short-lived 4-letter codes that connect a TV screen to a room''s read-only display';

-- Wrong-code counter per network address, so TV codes cannot be guessed by trying them all.
create table if not exists public.pin_and_spin_tv_pair_misses (
  origin_hash text primary key,
  misses integer not null default 0,
  window_start timestamptz not null default now()
);
comment on table public.pin_and_spin_tv_pair_misses is 'Recent wrong TV codes per network address (rate limit)';

alter table public.pin_and_spin_tv_pairings enable row level security;
alter table public.pin_and_spin_tv_pair_misses enable row level security;

create or replace function public.pin_and_spin_tv(p_action text, p_pair text default '', p_token text default '',
  p_room text default '', p_origin_hash text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 -- No 0/O, 1/I/L, 2/Z, 5/S, 8/B or G/6 look-alikes: easy to read across a room.
 alphabet constant text := 'ACDEFHJKMNPRTUVWXY34679';
 v_hash text; v_code text; v_pair public.pin_and_spin_tv_pairings; r public.pin_and_spin_rooms;
 me public.pin_and_spin_players; m public.pin_and_spin_tv_pair_misses; tries integer := 0; taken boolean;
begin
 if p_action not in ('tv_start','tv_check','tv_pair') then raise exception 'Unknown action'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invalid session'; end if;
 v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
 v_code := upper(btrim(coalesce(p_pair,'')));

 if p_action='tv_start' then
   delete from public.pin_and_spin_tv_pairings where expires_at < now() - interval '1 hour';
   select * into v_pair from public.pin_and_spin_tv_pairings where tv_hash=v_hash;
   -- Reloading the TV keeps its current code while it is still good.
   if found and v_pair.room_id is null and v_pair.expires_at > now() + interval '1 minute' then
     return jsonb_build_object('pairCode',v_pair.code,'expiresAt',v_pair.expires_at,'serverTime',now());
   end if;
   delete from public.pin_and_spin_tv_pairings where tv_hash=v_hash;
   perform pg_advisory_xact_lock(hashtextextended('pin_and_spin_tv:'||p_origin_hash,0));
   if (select count(*) from public.pin_and_spin_tv_pairings where origin_hash=p_origin_hash and created_at>now()-interval '1 hour')>=60 then
     raise exception 'Too many TV codes. Try again later';
   end if;
   loop
     tries := tries + 1;
     if tries > 25 then raise exception 'Could not make a TV code. Try again'; end if;
     select string_agg(substr(alphabet, 1 + (('x'||substr(md5(gen_random_uuid()::text),1,6))::bit(24)::integer % length(alphabet)), 1), '')
       into v_code from generate_series(1,4);
     begin
       insert into public.pin_and_spin_tv_pairings(code,tv_hash,origin_hash) values(v_code,v_hash,p_origin_hash) returning * into v_pair;
       exit;
     exception when unique_violation then null;
     end;
   end loop;
   return jsonb_build_object('pairCode',v_pair.code,'expiresAt',v_pair.expires_at,'serverTime',now());
 end if;

 if v_code !~ '^[A-Z0-9]{4}$' then raise exception 'Enter the 4-letter code shown on the TV'; end if;

 if p_action='tv_check' then
   -- Only the TV that asked for the code (it holds the TV token) can collect the room link.
   select * into v_pair from public.pin_and_spin_tv_pairings where code=v_code and tv_hash=v_hash;
   if not found or (v_pair.room_id is null and v_pair.expires_at < now()) then raise exception 'TV code expired'; end if;
   if v_pair.room_id is null then
     return jsonb_build_object('paired',false,'pairCode',v_pair.code,'expiresAt',v_pair.expires_at,'serverTime',now());
   end if;
   select * into r from public.pin_and_spin_rooms where id=v_pair.room_id;
   if not found or r.expires_at<now() or r.status='closed' then raise exception 'Room not found or expired'; end if;
   return jsonb_build_object('paired',true,'code',r.code,'displayToken',r.display_token);
 end if;

 -- tv_pair: a player in the room connects the TV showing this code.
 select * into r from public.pin_and_spin_rooms where code=upper(btrim(coalesce(p_room,'')));
 if not found or r.expires_at<now() or r.status='closed' then raise exception 'Room not found or expired'; end if;
 select * into me from public.pin_and_spin_players p where p.room_id=r.id and p.token_hash=v_hash;
 if not found or not me.active or me.kicked then raise exception 'Join the room before connecting a TV'; end if;
 perform pg_advisory_xact_lock(hashtextextended('pin_and_spin_tv_miss:'||p_origin_hash,0));
 select * into m from public.pin_and_spin_tv_pair_misses where origin_hash=p_origin_hash;
 if found and m.window_start > now() - interval '10 minutes' and m.misses >= 10 then
   raise exception 'Too many wrong TV codes. Wait a few minutes and try again';
 end if;
 select * into v_pair from public.pin_and_spin_tv_pairings where code=v_code and expires_at>now() for update;
 taken := found and v_pair.room_id is not null and v_pair.room_id<>r.id;
 if v_pair.code is null or taken then
   -- Returned, not raised, so the wrong-code count is kept.
   insert into public.pin_and_spin_tv_pair_misses as t(origin_hash,misses,window_start) values(p_origin_hash,1,now())
     on conflict (origin_hash) do update set
       misses = case when t.window_start > now() - interval '10 minutes' then t.misses + 1 else 1 end,
       window_start = case when t.window_start > now() - interval '10 minutes' then t.window_start else now() end;
   return jsonb_build_object('error', case when taken
     then 'That TV is already connected to another room. Reload the TV for a new code.'
     else 'That TV code is not right or has expired. Check the code on the TV.' end);
 end if;
 update public.pin_and_spin_tv_pairings set room_id=r.id where code=v_code;
 return jsonb_build_object('paired',true);
end;
$$;

revoke all on public.pin_and_spin_tv_pairings, public.pin_and_spin_tv_pair_misses from public, anon, authenticated;
revoke all on function public.pin_and_spin_tv(text,text,text,text,text) from public, anon, authenticated;
grant all on public.pin_and_spin_tv_pairings, public.pin_and_spin_tv_pair_misses to service_role;
grant execute on function public.pin_and_spin_tv(text,text,text,text,text) to service_role;
