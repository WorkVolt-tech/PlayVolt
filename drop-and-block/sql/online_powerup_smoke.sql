-- Safe, account-independent rule smoke tests.
-- For pre-deployment verification: BEGIN; [online_powerup_draft.sql]; [this file]; ROLLBACK;
-- Does not simulate or impersonate any real accounts.
do $check$
declare
  v_winners integer[]; v_threats integer; v_rls boolean;
begin
  v_winners:=public.drop_block_power_winners(
    '[1,1,1,1,0,0,0,2,2,2,2,0,0,0]'::jsonb,7,2,2,4);
  if v_winners<>array[1,2] then
    raise exception 'Multiple connections must return a draw: %',v_winners;
  end if;
  v_winners:=public.drop_block_power_winners(
    '[1,1,1,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,7,2,2,4);
  if coalesce(cardinality(v_winners),0)<>0 then
    raise exception 'Three chips must not count as Connect Four';
  end if;
  v_threats:=public.drop_block_power_threats(
    '[0,0,0,0,0,0,0,1,1,1,0,0,0,0]'::jsonb,7,2,2,1,4);
  if v_threats<>1 then
    raise exception 'Missed available winning move: %',v_threats;
  end if;
  select relrowsecurity into v_rls from pg_class
  where oid='public.drop_block_power_state'::regclass;
  if v_rls is distinct from true then
    raise exception 'Power state must have row-level security enabled';
  end if;
  if has_function_privilege('anon',
     'public.drop_block_power_action(text,text,jsonb)','execute') then
    raise exception 'Anonymous users must not access Power-Up actions';
  end if;
  if not has_function_privilege('authenticated',
     'public.drop_block_power_action(text,text,jsonb)','execute') then
    raise exception 'Authenticated players need Power-Up RPC access';
  end if;
end $check$;
select 'drop_block_online_powerup_checks_passed' as status;