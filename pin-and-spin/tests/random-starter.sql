begin;
do $test$
declare s jsonb; c text; rid uuid; picked uuid; seen uuid[] := '{}'; i integer; j integer; host_token text := repeat('e',64);
begin
s:=public.pin_and_spin_api('create','',host_token,'{"name":"Starter QA","mode":"classic"}','pin-spin-random-starter-qa');
c:=s->>'code';
select id into rid from public.pin_and_spin_rooms where code=c;
for j in 1..9 loop
 perform public.pin_and_spin_api('join',c,lpad(to_hex(100+j),64,'0'),jsonb_build_object('name','QA '||j));
end loop;
perform public.pin_and_spin_api('leave',c,lpad(to_hex(109),64,'0'));
for i in 1..40 loop
 for j in 1..8 loop
  perform public.pin_and_spin_api('ready',c,lpad(to_hex(100+j),64,'0'),'{"ready":true}');
 end loop;
 s:=public.pin_and_spin_api('start',c,host_token);
 picked:=(s->>'turnId')::uuid;
 assert exists(select 1 from public.pin_and_spin_players where id=picked and room_id=rid and active),'Inactive starter chosen';
 seen:=array_append(seen,picked);
 s:=public.pin_and_spin_api('state',c,host_token);
 assert (s->>'turnId')::uuid=picked,'Polling rerolled starter';
 update public.pin_and_spin_rooms set status='finished' where id=rid;
 perform public.pin_and_spin_api('replay',c,host_token);
end loop;
assert (select count(distinct x) from unnest(seen) x)>1,'Starter never varied across 40 starts/rematches';
end;
$test$;
rollback;
