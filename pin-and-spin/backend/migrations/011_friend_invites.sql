-- Pin & Spin migration 011: invite a friend into your room.
-- The friends list itself is the shared PlayVolt one (public.friendships / public.blocks,
-- managed by Dekabess's functions). Pin & Spin only READS it here; game invites have their
-- own table, so Dekabess never shows Pin & Spin invites (its friend_challenges table points
-- at Dekabess rooms). Safe to run more than once.
create table if not exists public.pin_and_spin_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null,
  to_user uuid not null,
  room_id uuid not null references public.pin_and_spin_rooms on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
create index if not exists pin_and_spin_invites_to_idx on public.pin_and_spin_invites(to_user, created_at);
create index if not exists pin_and_spin_invites_from_idx on public.pin_and_spin_invites(from_user, created_at);
comment on table public.pin_and_spin_invites is 'A friend invited into a Pin & Spin room (valid for 10 minutes)';
alter table public.pin_and_spin_invites enable row level security;

-- New invite: a content-free "invited" signal on the friend's own topic, so their phone
-- checks right away (it still has to ask the server, signed in, to see the invite).
create or replace function public.pin_and_spin_invite_signal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform realtime.send(jsonb_build_object('at', clock_timestamp()), 'invited', 'pin-and-spin-invites:' || new.to_user, false);
  exception when others then null;
  end;
  return null;
end;
$$;
revoke all on function public.pin_and_spin_invite_signal() from public, anon, authenticated;
drop trigger if exists pin_and_spin_invites_signal on public.pin_and_spin_invites;
create trigger pin_and_spin_invites_signal after insert on public.pin_and_spin_invites
  for each row execute function public.pin_and_spin_invite_signal();

-- invite: send an invite (you must be in the room's lobby and friends with them)
-- invites: my pending invites from the last 10 minutes, for rooms still waiting to start
-- invite_respond: accept (returns the room code) or decline
create or replace function public.pin_and_spin_social(p_action text, p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.pin_and_spin_rooms; v_friend uuid; inv public.pin_and_spin_invites;
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to invite friends'; end if;
  if p_action not in ('invite', 'invites', 'invite_respond') then raise exception 'Unknown action'; end if;

  if p_action = 'invite' then
    v_friend := nullif(p_data->>'friend', '')::uuid;
    select * into r from public.pin_and_spin_rooms where code = upper(btrim(coalesce(p_data->>'code', '')));
    if not found or r.expires_at < now() or r.status <> 'lobby' then raise exception 'Invite friends while the room is waiting to start'; end if;
    if not exists (select 1 from public.pin_and_spin_players p where p.room_id = r.id and p.active and not p.kicked and p.user_id = p_account) then
      raise exception 'Join the room before inviting friends';
    end if;
    if v_friend is null or not exists (select 1 from public.friendships f where f.status = 'accepted'
        and least(f.requester, f.addressee) = least(p_account, v_friend) and greatest(f.requester, f.addressee) = greatest(p_account, v_friend)) then
      raise exception 'You can only invite your friends';
    end if;
    if exists (select 1 from public.pin_and_spin_players p where p.room_id = r.id and p.active and p.user_id = v_friend) then
      raise exception 'Your friend is already in this room';
    end if;
    if (select count(*) from public.pin_and_spin_invites where from_user = p_account and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'Too many invites. Try again in a few minutes';
    end if;
    -- Blocked either way: say "sent" but deliver nothing (as Dekabess does).
    if exists (select 1 from public.blocks b where (b.blocker = v_friend and b.blocked = p_account) or (b.blocker = p_account and b.blocked = v_friend)) then
      return jsonb_build_object('sent', true);
    end if;
    delete from public.pin_and_spin_invites where from_user = p_account and to_user = v_friend and room_id = r.id;
    insert into public.pin_and_spin_invites(from_user, to_user, room_id) values (p_account, v_friend, r.id);
    return jsonb_build_object('sent', true);
  end if;

  if p_action = 'invites' then
    return jsonb_build_object('invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', rm.code, 'mode', rm.mode,
        'from', coalesce(nullif(left(btrim(pr.nickname), 20), ''), 'A friend'), 'at', i.created_at) order by i.created_at desc)
      from public.pin_and_spin_invites i
      join public.pin_and_spin_rooms rm on rm.id = i.room_id
      left join public.profiles pr on pr.id = i.from_user
      where i.to_user = p_account and i.status = 'pending' and i.created_at > now() - interval '10 minutes'
        and rm.status = 'lobby' and rm.expires_at > now()), '[]'::jsonb));
  end if;

  -- invite_respond
  select * into inv from public.pin_and_spin_invites where id = nullif(p_data->>'id', '')::uuid and to_user = p_account for update;
  if not found or inv.status <> 'pending' or inv.created_at < now() - interval '10 minutes' then raise exception 'That invite has expired'; end if;
  update public.pin_and_spin_invites set status = case when coalesce((p_data->>'accept')::boolean, false) then 'accepted' else 'declined' end
    where id = inv.id;
  if not coalesce((p_data->>'accept')::boolean, false) then return jsonb_build_object('declined', true); end if;
  select * into r from public.pin_and_spin_rooms where id = inv.room_id;
  if r.status <> 'lobby' or r.expires_at < now() then raise exception 'That game has already started'; end if;
  return jsonb_build_object('code', r.code);
end;
$$;

revoke all on public.pin_and_spin_invites from public, anon, authenticated;
revoke all on function public.pin_and_spin_social(text, uuid, jsonb) from public, anon, authenticated;
grant all on public.pin_and_spin_invites to service_role;
grant execute on function public.pin_and_spin_social(text, uuid, jsonb) to service_role;
