-- Run against online_gravity_shift.sql in ONE transaction and ROLLBACK.
-- This exercises the actual existing no-signup guest dispatcher and room rules.
do $gravity_test$
declare
 g1 jsonb;g2 jsonb;t1 text;t2 text;c text;c2 text;r jsonb;
 v_id uuid;v_board jsonb;v_old text;v_row integer;v_col integer;v_count integer;
begin
 g1:=public.drop_block_guest_action('register','','{"nickname":"Gravity Tester One"}','');
 g2:=public.drop_block_guest_action('register','','{"nickname":"Gravity Tester Two"}','');
 t1:=g1->>'guestToken';t2:=g2->>'guestToken';
 if length(t1)<>64 or length(t2)<>64 then raise exception 'Missing secure guest token';end if;
 r:=public.drop_block_guest_action('create','','{"mode":"gravity","maxPlayers":2}',t1);
 c:=r->>'code';
 if r->>'mode'<>'gravity' or r->'gravity'->>'nextDirection'<>'left' then
    raise exception 'Gravity room create failed: %',r;
 end if;
 r:=public.drop_block_guest_action('join',c,'{}',t2);
 if jsonb_array_length(r->'players')<>2 then raise exception 'Guest join failed';end if;
 r:=public.drop_block_guest_action('ready',c,'{"ready":true}',t2);
 r:=public.drop_block_guest_action('start',c,'{}',t1);
 if r->>'status'<>'playing' or (r->>'winLength')::integer<>4 then
   raise exception 'Gravity start failed: %',r;end if;

 -- Alternating guest turns, 4th move must shift LEFT, not sooner.
 for v_count in 1..8 loop
   v_col:=case when v_count<=4 then
       case when v_count%2=1 then 2 else 4 end
     else case when v_count%2=1 then 5 else 6 end end;
   r:=public.drop_block_guest_action('drop',c,jsonb_build_object('column',v_col,'kind','drop'),
     case when v_count%2=1 then t1 else t2 end);
   if (r->'gravity'->>'drops')::integer<>v_count then
     raise exception 'Move count mismatch on move %',v_count;end if;
   if v_count in (4,8) then
     if (r->'lastMove'->>'shifted')::boolean is distinct from true then
       raise exception 'Expected shift on move %',v_count;end if;
     if (v_count=4 and r->'lastMove'->>'shiftDirection'<>'left') or
        (v_count=8 and r->'lastMove'->>'shiftDirection'<>'right') then
       raise exception 'Shift direction wrong at move %: %',v_count,r->'lastMove';end if;
   elsif (r->'lastMove'->>'shifted')::boolean is distinct from false then
     raise exception 'Early/unexpected shift on move %',v_count;
   end if;
 end loop;
 if r->>'status'<>'playing' or r->'gravity'->>'nextDirection'<>'left' then
   raise exception 'Shift parity/turn failed after 8 moves';end if;
 v_board:=r->'board';
 if (v_board->>(5*7+3))::integer<>1
    or (v_board->>(5*7+4))::integer<>2
    or (v_board->>(5*7+5))::integer<>1
    or (v_board->>(5*7+6))::integer<>2 then
   raise exception 'RIGHT shift final arrangement incorrect: %',v_board;
 end if;

 -- The old RPC may read or manage a lobby, but must not bypass gravity moves.
 perform set_config('drop_block.guest_uid',g1->>'guestId',true);
 perform set_config('drop_block.gravity_write','off',true);
 begin
   perform public.drop_block_action('drop',c,'{"column":0}');
   raise exception 'UNPROTECTED_GRAVITY_BOARD';
 exception when others then
   get stacked diagnostics v_old=message_text;
   if v_old not like '%Gravity Shift moves must use%' then
     raise exception 'Old RPC bypass guard did not trigger: %',v_old;end if;
 end;

 -- Direct Connect 4 on the fourth move wins before any automatic shift.
 r:=public.drop_block_guest_action('create','','{"mode":"gravity","maxPlayers":2}',t1);
 c2:=r->>'code';
 r:=public.drop_block_guest_action('join',c2,'{}',t2);
 r:=public.drop_block_guest_action('ready',c2,'{"ready":true}',t2);
 r:=public.drop_block_guest_action('start',c2,'{}',t1);
 select id into v_id from public.drop_block_rooms where code=c2;
 v_board:=to_jsonb(array_fill(0,array[42]));
 v_board:=jsonb_set(v_board,'{35}','1'::jsonb);
 v_board:=jsonb_set(v_board,'{36}','1'::jsonb);
 v_board:=jsonb_set(v_board,'{37}','1'::jsonb);
 perform set_config('drop_block.gravity_write','on',true);
 update public.drop_block_rooms
   set board=v_board,move_count=3,total_moves=3,turn_seat=1
 where id=v_id;
 r:=public.drop_block_guest_action('drop',c2,'{"column":3,"kind":"drop"}',t1);
 if r->>'status'<>'finished' or (r->>'winnerSeat')::integer<>1
    or (r->'lastMove'->>'shifted')::boolean is distinct from false then
   raise exception 'Direct win incorrectly shifted or failed: %',r;
 end if;
 select count(*) into v_count from public.drop_block_results
 where room_id=v_id;
 if v_count<>0 then raise exception 'Guests received competitive results';end if;
 raise notice 'Online Gravity guest moves, LEFT/RIGHT shifts, anti-bypass, direct win and reward rules passed; ROLLBACK';
end $gravity_test$;
do $mixed_gravity$
declare
 v_registered uuid;g jsonb;t text;c text;r jsonb;v_room_id uuid;v_board jsonb;
 v_count integer;
begin
 select p.id into v_registered from public.profiles p
 join auth.users u on u.id=p.id
 where length(btrim(p.nickname))>0 order by p.id limit 1;
 if v_registered is null then raise exception 'Registered player fixture missing';end if;
 perform set_config('request.jwt.claim.sub',v_registered::text,true);
 r:=public.drop_block_gravity_action('create','','{"mode":"gravity","maxPlayers":2}');
 c:=r->>'code';
 if r->>'mode'<>'gravity' then raise exception 'Registered user cannot create Gravity room';end if;
 perform set_config('request.jwt.claim.sub','',true);
 g:=public.drop_block_guest_action('register','','{"nickname":"Gravity Guest"}','');
 t:=g->>'guestToken';
 r:=public.drop_block_guest_action('join',c,'{}',t);
 r:=public.drop_block_guest_action('ready',c,'{"ready":true}',t);
 perform set_config('request.jwt.claim.sub',v_registered::text,true);
 r:=public.drop_block_gravity_action('start',c,'{}');
 r:=public.drop_block_gravity_action('drop',c,'{"column":2}');
 if (r->>'turnSeat')::integer<>2 then raise exception 'Registered seat did not advance turn';end if;
 perform set_config('request.jwt.claim.sub','',true);
 r:=public.drop_block_guest_action('drop',c,'{"column":4}',t);
 if (r->>'turnSeat')::integer<>1 then raise exception 'Guest seat did not advance turn';end if;

 -- Seed a direct fourth-chip win for a registered player inside the
 -- rolled-back test; it must count only for the registered account.
 v_board:=to_jsonb(array_fill(0,array[42]));
 v_board:=jsonb_set(v_board,'{35}','1'::jsonb);
 v_board:=jsonb_set(v_board,'{36}','1'::jsonb);
 v_board:=jsonb_set(v_board,'{37}','1'::jsonb);
 perform set_config('drop_block.gravity_write','on',true);
 update public.drop_block_rooms
   set board=v_board,move_count=3,total_moves=3,turn_seat=1
 where code=c returning id into v_room_id;
 perform set_config('request.jwt.claim.sub',v_registered::text,true);
 r:=public.drop_block_gravity_action('drop',c,'{"column":3}');
 if r->>'status'<>'finished' or (r->>'winnerSeat')::int<>1
   or (r->'lastMove'->>'shifted')::boolean then
   raise exception 'Registered player direct win failed: %',r;
 end if;
 select count(*) into v_count from public.drop_block_results
 where room_id=v_room_id and user_id=v_registered and won=true;
 if v_count<>1 then raise exception 'Registered winner result missing';end if;
 select count(*) into v_count from public.drop_block_results where room_id=v_room_id;
 if v_count<>1 then raise exception 'Guest erroneously received a ranked result';end if;

 r:=public.drop_block_gravity_action('rematch',c,'{}');
 if (r->'gravity'->>'drops')::integer<>0
    or r->'gravity'->>'nextDirection'<>'left'
    or r->>'status'<>'lobby' then
   raise exception 'Gravity rematch did not reset: %',r;
 end if;
 perform set_config('request.jwt.claim.sub','',true);
 r:=public.drop_block_guest_action('ready',c,'{"ready":true}',t);
 perform set_config('request.jwt.claim.sub',v_registered::text,true);
 r:=public.drop_block_gravity_action('start',c,'{}');
 if r->>'status'<>'playing' or (r->'gravity'->>'drops')::integer<>0 then
   raise exception 'Gravity rematch did not restart';end if;
 raise notice 'Registered+guest rooms, ranked results and rematch reset passed; ROLLBACK';
end $mixed_gravity$;

select 'online_gravity_shift_smoke_passed' as status;
