-- Pin & Spin migration 012: admin peek. PlayVolt admins (the shared public.admins list, the
-- same one Dekabess uses) can see the secret code of a game in progress, like Dekabess's
-- admin view. The server checks the admin list itself, so nobody else can get the code by
-- calling this. Pin & Spin only READS public.admins. Safe to run more than once.
create or replace function public.pin_and_spin_admin_peek(p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.pin_and_spin_rooms; g public.pin_and_spin_solo_games;
begin
  if p_account is null or not exists (select 1 from public.admins a where a.user_id = p_account) then
    raise exception 'Not available';
  end if;
  -- A multiplayer room (by code), while it is being played.
  if coalesce(p_data->>'code', '') <> '' then
    select * into r from public.pin_and_spin_rooms where code = upper(btrim(p_data->>'code'));
    if not found or r.status <> 'playing' or r.secret is null then return jsonb_build_object('secret', null); end if;
    return jsonb_build_object('secret', to_jsonb(r.secret), 'puzzle', r.puzzle);
  end if;
  -- One of the admin's own solo / daily / story games (by id).
  select * into g from public.pin_and_spin_solo_games where id = nullif(p_data->>'id', '')::uuid and user_id = p_account;
  if not found or g.status <> 'playing' then return jsonb_build_object('secret', null); end if;
  return jsonb_build_object('secret', to_jsonb(g.secret));
end;
$$;

revoke all on function public.pin_and_spin_admin_peek(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pin_and_spin_admin_peek(uuid, jsonb) to service_role;
