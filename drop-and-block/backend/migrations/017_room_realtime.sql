-- Drop & Block: server-originated Realtime broadcast invalidations.
-- No player data, usernames, codes or tokens are included in the message.
-- The channel topic itself is scoped by the existing random 64-hex TV
-- capability (already given to room members via the authenticated RPC and
-- to spectators only in the read-only TV URL fragment).
--
-- This is a *notification*, not an alternate data or gameplay API:
-- clients still fetch authoritative state from drop_block_action (members)
-- or drop_block_tv_state (TV with correct room code + token).
-- We use PUBLIC Supabase broadcast channels (private=false) because TV pages
-- are intentionally not signed in. The 256-bit topic token is unguessable.
create or replace function public.drop_block_realtime_emit(p_room_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_token text;
begin
  select r.display_token into v_token
  from public.drop_block_rooms r where r.id=p_room_id;
  if v_token is not null and v_token ~ '^[a-f0-9]{64}$' then
    perform realtime.send('{}'::jsonb, 'refresh', 'drop-block-room:' || v_token, false);
  end if;
exception when others then
  -- Notification failures must never cancel a valid move or join.
  raise warning 'Drop & Block realtime notification unavailable: %', SQLERRM;
end;
$$;
revoke all on function public.drop_block_realtime_emit(uuid) from public,anon,authenticated;

create or replace function public.drop_block_room_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.drop_block_realtime_emit(new.id);
  return new;
end;
$$;
revoke all on function public.drop_block_room_changed() from public,anon,authenticated;

create or replace function public.drop_block_player_changed()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.drop_block_realtime_emit(new.room_id);
  return new;
end;
$$;
revoke all on function public.drop_block_player_changed() from public,anon,authenticated;

drop trigger if exists drop_block_room_realtime on public.drop_block_rooms;
create trigger drop_block_room_realtime
  after insert or update on public.drop_block_rooms
  for each row execute function public.drop_block_room_changed();

-- Notify joins, readiness, knockouts, scores and missed turns.
-- Exclude last_seen_at heartbeats to prevent read/refresh feedback loops.
drop trigger if exists drop_block_player_realtime on public.drop_block_players;
create trigger drop_block_player_realtime
  after insert or update of ready,score,eliminated,chaos_block_used,
    chaos_blast_used,timed_out_turns,name on public.drop_block_players
  for each row execute function public.drop_block_player_changed();

-- Preserve existing restrictions: do not grant browser clients table access,
-- gameplay privileges, the TV token lookup, or direct emitter execution.
