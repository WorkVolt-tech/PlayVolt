-- Read-only TV pairing for Fire TV and TVs with awkward remote controls.
-- Host issues a fresh, one-use, 10-character temporary code (40-bit entropy).
-- Redemption is anonymous but requires BOTH the room code and the secret,
-- valid only for ten minutes; it yields the existing short-lived TV token.
-- There is no new public room state/table access or guest move capability.
create table if not exists public.drop_block_tv_pairings(
 room_id uuid primary key references public.drop_block_rooms(id) on delete cascade,
 pair_secret text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.drop_block_tv_pairings enable row level security;
revoke all on public.drop_block_tv_pairings from public,anon,authenticated;

create or replace function public.drop_block_create_tv_pair(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_uid uuid:=auth.uid();
 v_room public.drop_block_rooms;
 v_pin text;
 v_until timestamptz:=clock_timestamp()+interval '10 minutes';
begin
 if v_uid is null then raise exception 'Sign in to create a TV pairing code'; end if;
 if coalesce(p_code,'') !~* '^[A-F0-9]{6}$' then raise exception 'Invalid room code'; end if;
 select * into v_room from public.drop_block_rooms
 where code=upper(p_code) and host_id=v_uid
 and created_at>clock_timestamp()-interval '24 hours'
 and status in ('lobby','playing','finished')
 for update;
 if not found then raise exception 'Only the room host can pair the TV'; end if;
 v_pin:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.drop_block_tv_pairings(room_id,pair_secret,expires_at,created_at)
 values(v_room.id,v_pin,v_until,clock_timestamp())
 on conflict(room_id) do update
 set pair_secret=excluded.pair_secret,expires_at=excluded.expires_at,
 created_at=excluded.created_at;
 return jsonb_build_object('roomCode',v_room.code,'pairCode',v_pin,
    'expiresAt',v_until,'validMinutes',10);
end;
$$;
revoke all on function public.drop_block_create_tv_pair(text) from public,anon,authenticated;
grant execute on function public.drop_block_create_tv_pair(text) to authenticated;

create or replace function public.drop_block_redeem_tv_pair(p_code text,p_pair text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_room public.drop_block_rooms;
 v_pair public.drop_block_tv_pairings;
begin
 if coalesce(p_code,'') !~* '^[A-F0-9]{6}$'
 or coalesce(p_pair,'') !~* '^[A-F0-9]{10}$' then
   raise exception 'Invalid TV pairing code';
 end if;
 select * into v_room from public.drop_block_rooms
 where code=upper(p_code) and created_at>clock_timestamp()-interval '24 hours'
 and status in ('lobby','playing','finished') for update;
 if not found then raise exception 'Invalid or expired TV pairing code'; end if;
 select * into v_pair from public.drop_block_tv_pairings
 where room_id=v_room.id and pair_secret=upper(p_pair)
 and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Invalid or expired TV pairing code'; end if;
 delete from public.drop_block_tv_pairings where room_id=v_room.id;
 -- Keep the existing display token restricted to the TV spectator RPC;
 -- the TV can never call drop_block_action without a player login.
 return jsonb_build_object('roomCode',v_room.code,
 'displayToken',v_room.display_token);
end;
$$;
revoke all on function public.drop_block_redeem_tv_pair(text,text) from public,anon,authenticated;
grant execute on function public.drop_block_redeem_tv_pair(text,text) to anon,authenticated;
