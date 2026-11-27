-- Drop & Block Guest Play
-- Existing Game DB only. This does not change other PlayVolt games.
-- Anonymous Supabase Auth sessions may play, but must not receive
-- ranked results, achievements, or collectible unlocks.
--
-- Run on the Game DB once, after reviewing. Idempotent.
create or replace function public.drop_block_guest_reward_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- auth.users.is_anonymous is a trusted Auth-owned flag, not
  -- client-editable nickname or user_metadata.
  if exists (
    select 1 from auth.users u
    where u.id = new.user_id and u.is_anonymous is true
  ) then
    return null; -- discard competitive progress for a guest
  end if;
  return new;
end;
$function$;

drop trigger if exists drop_block_guest_results_guard on public.drop_block_results;
create trigger drop_block_guest_results_guard
before insert on public.drop_block_results
for each row execute function public.drop_block_guest_reward_guard();

drop trigger if exists drop_block_guest_achievements_guard on public.drop_block_achievements;
create trigger drop_block_guest_achievements_guard
before insert on public.drop_block_achievements
for each row execute function public.drop_block_guest_reward_guard();

-- Helper exists only for database triggers; not an exposed browser RPC.
revoke all on function public.drop_block_guest_reward_guard() from public, anon, authenticated;
