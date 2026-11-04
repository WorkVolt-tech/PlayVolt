-- Run on Game DB as postgres. Every fixture is rolled back, including failed runs.
begin;
do $$
declare s jsonb; t jsonb; c text; rid uuid; host uuid; guest uuid; display_key text;
 mode_name text; i integer; j integer; tok text; denied boolean; first_starter uuid;
begin
 assert public.pin_and_spin_score(array[0,0,1,2],array[0,1,0,0])=array[1,2], 'Duplicate colors must not double count';
 assert public.pin_and_spin_score(array[1,1,1,1],array[1,1,1,1])=array[4,0];
 assert not has_table_privilege('anon','public.pin_and_spin_rooms','select'), 'Secret table publicly readable';
 assert not has_function_privilege('anon','public.pin_and_spin_api(text,text,text,jsonb,text)','execute'), 'RPC publicly callable';
 assert not has_function_privilege('authenticated','public.pin_and_spin_api(text,text,text,jsonb,text)','execute');
 foreach mode_name in array array['classic','reveal','timed-reveal','rush'] loop
   tok := lpad(to_hex(array_position(array['classic','reveal','timed-reveal','rush'],mode_name)),64,'0');
   s:=public.pin_and_spin_api('create','',tok,jsonb_build_object('name','Host','mode',mode_name),'pin-and-spin-test');
   c:=s->>'code';host:=(s->>'me')::uuid;display_key:=s->>'displayToken';
   select id into rid from public.pin_and_spin_rooms where code=c;
   t:=public.pin_and_spin_api('join',c,repeat('b',64),'{"name":"Guest"}');guest:=(t->>'me')::uuid;
   denied:=false;
   begin perform public.pin_and_spin_api('start',c,repeat('b',64));exception when raise_exception then denied:=true;end;
   assert denied,'Guest was allowed to start';
   perform public.pin_and_spin_api('ready',c,repeat('b',64),'{"ready":true}');
   s:=public.pin_and_spin_api('start',c,tok);first_starter:=(s->>'turnId')::uuid;
   assert s->'answer'='null'::jsonb,'Answer leaked';
   update public.pin_and_spin_rooms set secret=array[0,1,2,3] where id=rid;
   if mode_name='classic' then
     t:=public.pin_and_spin_api('guess',c,repeat('b',64),'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert jsonb_array_length(t->'guesses')=0,'Out-of-turn guess accepted';
     s:=public.pin_and_spin_api('guess',c,tok,'{"colors":[5,5,5,5],"attempt":1,"puzzle":1}');
     assert (s->>'turnId')::uuid=guest;
     s:=public.pin_and_spin_api('guess',c,tok,'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert jsonb_array_length(s->'guesses')=1,'Duplicate accepted';
     s:=public.pin_and_spin_api('guess',c,repeat('b',64),'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert s->>'status'='finished' and s->'answer'='[0,1,2,3]'::jsonb;
     perform public.pin_and_spin_api('replay',c,tok);
     perform public.pin_and_spin_api('ready',c,repeat('b',64),'{"ready":true}');
     s:=public.pin_and_spin_api('start',c,tok);
     assert (s->>'turnId')::uuid<>first_starter,'Starter not rotated';
   elsif mode_name='reveal' then
     s:=public.pin_and_spin_api('guess',c,tok,'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert s->>'status'='playing' and s->'guesses'->0->'pins'='null'::jsonb,'Early feedback leaked';
     t:=public.pin_and_spin_api('state',c,repeat('b',64));
     assert jsonb_array_length(t->'guesses')=0,'Opponent guess leaked';
     t:=public.pin_and_spin_api('display',c,display_key);
     assert jsonb_array_length(t->'guesses')=0 and t->'answer'='null'::jsonb,'Display leaked secret';
     denied:=false;
     begin perform public.pin_and_spin_api('start',c,display_key);exception when raise_exception then denied:=true;end;
     assert denied,'Display token mutated game';
     s:=public.pin_and_spin_api('guess',c,repeat('b',64),'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert s->>'status'='finished' and jsonb_array_length(s->'winners')=2,'Simultaneous solvers must tie';
   elsif mode_name='timed-reveal' then
     update public.pin_and_spin_rooms set deadline=now()-interval '1 second' where id=rid;
     s:=public.pin_and_spin_api('guess',c,tok,'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert (s->>'round')::integer=2 and jsonb_array_length(s->'guesses')=2,'Timeout did not record missed guesses';
     assert (s->>'deadline')::timestamptz>now()+interval '179 seconds','Not a fresh three-minute timer';
     assert s->'guesses'->0->'colors'='null'::jsonb,'Late submission was accepted';
     for i in 2..4 loop
       update public.pin_and_spin_rooms set deadline=now()-interval '1 second' where id=rid;
       s:=public.pin_and_spin_api('state',c,tok);
     end loop;
     assert s->>'status'='finished' and jsonb_array_length(s->'winners')=0;
   else
     for i in 1..8 loop
       s:=public.pin_and_spin_api('guess',c,tok,jsonb_build_object('colors',array[5,5,5,5],'attempt',i,'puzzle',1));
     end loop;
     assert s->>'status'='playing','Rush ended while another player still has guesses';
     t:=public.pin_and_spin_api('state',c,repeat('b',64));
     assert jsonb_array_length(t->'guesses')=8,'Rush results not shared';
     s:=public.pin_and_spin_api('guess',c,tok,'{"colors":[0,1,2,3],"attempt":9,"puzzle":1}');
     assert jsonb_array_length(s->'guesses')=8,'Ninth guess accepted';
     update public.pin_and_spin_rooms set deadline=now()-interval '1 second' where id=rid;
     s:=public.pin_and_spin_api('guess',c,repeat('b',64),'{"colors":[0,1,2,3],"attempt":1,"puzzle":1}');
     assert s->>'status'='finished' and jsonb_array_length(s->'winners')=0,'Late Rush solve accepted';
   end if;
 end loop;
 s:=public.pin_and_spin_api('create','',repeat('c',64),'{"name":"Host","mode":"reveal"}','pin-and-spin-test');
 c:=s->>'code';
 for i in 1..9 loop
   perform public.pin_and_spin_api('join',c,lpad(to_hex(i+20),64,'0'),jsonb_build_object('name','Guest '||i));
 end loop;
 denied:=false;
 begin perform public.pin_and_spin_api('join',c,repeat('d',64),'{"name":"Eleventh"}');exception when raise_exception then denied:=true;end;
 assert denied,'Eleventh player accepted';
 perform public.pin_and_spin_api('leave',c,repeat('c',64));
 s:=public.pin_and_spin_api('state',c,lpad(to_hex(21),64,'0'));
 assert s->>'hostId'=s->>'me','Host not transferred';
end;
$$;
rollback;
