-- Safe in-place smoke test: run with the DDL prepended inside the SAME transaction.
-- Produces no lasting records: wrap the whole script in BEGIN; ... ROLLBACK;
do $test$
declare
 alice uuid;bob uuid; v_code text; r jsonb; msg text; n integer;
begin
 select p.id into alice from public.profiles p join auth.users u on u.id=p.id
  where nullif(btrim(p.nickname),'') is not null order by p.id limit 1;
 select p.id into bob from public.profiles p join auth.users u on u.id=p.id
  where nullif(btrim(p.nickname),'') is not null and p.id<>alice order by p.id limit 1;
 if alice is null or bob is null then raise exception 'Test needs two existing profiles'; end if;
 perform set_config('request.jwt.claim.sub',alice::text,true);
 r:=public.drop_block_power_action('create','', '{"mode":"power","maxPlayers":2}'::jsonb);
 v_code:=r->>'code';
 if r->>'mode'<>'power' then raise exception 'Create mismatch';end if;
 perform set_config('request.jwt.claim.sub',bob::text,true);
 r:=public.drop_block_power_action('join',v_code);
 r:=public.drop_block_power_action('ready',v_code,'{"ready":true}'::jsonb);
 perform set_config('request.jwt.claim.sub',alice::text,true);
 r:=public.drop_block_power_action('start',v_code);
 if r->>'status'<>'playing' or jsonb_array_length(r->'power'->'energy')<>2 then
   raise exception 'Power startup failed: %',r;
 end if;
 r:=public.drop_block_power_action('drop',v_code,'{"column":0,"kind":"drop"}'::jsonb);
 if (r->'power'->'energy'->>0)::integer<10 or (r->>'turnSeat')::integer<>2 then
   raise exception 'Energy or turn advance failed: %',r;
 end if;
 update public.drop_block_power_state set state=jsonb_set(state,'{energy}','[100,100]'::jsonb)
   where room_id=(select id from public.drop_block_rooms where code=v_code);
 perform set_config('request.jwt.claim.sub',bob::text,true);
 r:=public.drop_block_power_action('drop',v_code,'{"column":4,"kind":"freeze"}'::jsonb);
 if (r->'power'->'frozen'->>'column')::integer<>4 then raise exception 'Freeze not saved';end if;
 perform set_config('request.jwt.claim.sub',alice::text,true);
 begin
   perform public.drop_block_power_action('drop',v_code,'{"column":4,"kind":"drop"}'::jsonb);
   raise exception 'FAILED_BLOCK';
 exception when others then
   get stacked diagnostics msg=message_text;
   if msg<>'This column is frozen' then raise exception 'Freeze rejection wrong: %',msg;end if;
 end;
 update public.drop_block_power_state set state=jsonb_set(state,'{energy}','[100,100]'::jsonb)
   where room_id=(select id from public.drop_block_rooms where code=v_code);
 r:=public.drop_block_power_action('double',v_code);
 if (r->'power'->>'doublePending')::integer<>2 then raise exception 'Double not armed: %',r;end if;
 r:=public.drop_block_power_action('drop',v_code,'{"column":1,"kind":"drop"}'::jsonb);
 if (r->>'turnSeat')::integer<>1 or (r->'power'->>'doublePending')::integer<>1 then
   raise exception 'Double first chip failed: %',r;
 end if;
 r:=public.drop_block_power_action('drop',v_code,'{"column":2,"kind":"drop"}'::jsonb);
 if (r->>'turnSeat')::integer<>2 or (r->'power'->>'doublePending')::integer<>0 then
   raise exception 'Double second chip failed: %',r;
 end if;
 r:=public.drop_block_power_action('get',v_code);
 if (r->'power'->'frozen') <> 'null'::jsonb then
   raise exception 'Freeze did not thaw on owner turn: %',r->'power';
 end if;
 perform set_config('request.jwt.claim.sub',bob::text,true);
 perform set_config('drop_block.power_write','off',true);
 begin
   perform public.drop_block_action('drop',v_code,'{"column":3,"kind":"drop"}'::jsonb);
   raise exception 'GUARD_FAILED';
 exception when others then
   get stacked diagnostics msg=message_text;
   if msg not like '%Power-Up moves must use%' then
     raise exception 'Legacy RPC guard failure: %',msg;
   end if;
 end;
 select count(*) into n from public.drop_block_moves m join public.drop_block_rooms r
   on r.id=m.room_id where r.code=v_code;
 if n<>4 then raise exception 'Expected four logged actions, found %',n;end if;
 raise notice 'Power-up transactional smoke test succeeded';
end $test$;
select 'smoke-test-passed' as status;