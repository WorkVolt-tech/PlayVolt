-- Pin & Spin migration 004: instant updates.
-- When a room really changes, broadcast a content-free "changed" signal on the public
-- Realtime topic "pin-and-spin:<ROOM CODE>". Phones then fetch the (redacted) state
-- through the Edge Function as usual. The signal carries no game data.
-- Heartbeat-only updates (players.last_seen) do NOT signal, to avoid refresh loops.
-- Safe to run more than once.
create or replace function public.pin_and_spin_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_code text;
begin
  if tg_table_name = 'pin_and_spin_rooms' then
    v_code := j->>'code';
  else
    select code into v_code from public.pin_and_spin_rooms where id = (j->>'room_id')::uuid;
  end if;
  if v_code is not null then
    begin
      perform realtime.send(jsonb_build_object('at', clock_timestamp()), 'changed', 'pin-and-spin:' || v_code, false);
    exception when others then
      null; -- Realtime is a speed-up only; never block a game action because of it.
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.pin_and_spin_notify() from public, anon, authenticated;

drop trigger if exists pin_and_spin_rooms_signal on public.pin_and_spin_rooms;
create trigger pin_and_spin_rooms_signal after insert or update on public.pin_and_spin_rooms
  for each row execute function public.pin_and_spin_notify();

drop trigger if exists pin_and_spin_players_signal_rows on public.pin_and_spin_players;
create trigger pin_and_spin_players_signal_rows after insert or delete on public.pin_and_spin_players
  for each row execute function public.pin_and_spin_notify();
drop trigger if exists pin_and_spin_players_signal_changes on public.pin_and_spin_players;
create trigger pin_and_spin_players_signal_changes after update on public.pin_and_spin_players
  for each row when ((old.name, old.seat, old.ready, old.active, old.kicked, old.user_id)
    is distinct from (new.name, new.seat, new.ready, new.active, new.kicked, new.user_id))
  execute function public.pin_and_spin_notify();

drop trigger if exists pin_and_spin_guesses_signal on public.pin_and_spin_guesses;
create trigger pin_and_spin_guesses_signal after insert or update on public.pin_and_spin_guesses
  for each row execute function public.pin_and_spin_notify();
