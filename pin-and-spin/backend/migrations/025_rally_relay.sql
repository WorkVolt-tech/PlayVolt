-- Rally Relay uses a shared Rally run per team and a fixed roster for each puzzle.
alter table public.pin_and_spin_rooms drop constraint if exists pin_and_spin_rooms_mode_check;
alter table public.pin_and_spin_rooms add constraint pin_and_spin_rooms_mode_check check (mode in ('classic','reveal','timed-reveal','rush','rally','relay'));
create table if not exists public.pin_and_spin_relay_members (
  room_id uuid not null references public.pin_and_spin_rooms(id) on delete cascade,
  puzzle integer not null,
  player_id uuid not null references public.pin_and_spin_players(id) on delete cascade,
  team integer not null check (team in (0,1)),
  anchor uuid not null,
  primary key(room_id,puzzle,player_id)
);
alter table public.pin_and_spin_relay_members enable row level security;
revoke all on public.pin_and_spin_relay_members from public, anon, authenticated;
grant select,insert on public.pin_and_spin_relay_members to service_role;

-- The last submitting seat is stored on the run so rotation survives stage changes.
alter table public.pin_and_spin_rally_runs add column if not exists relay_last_seat integer;
alter table public.pin_and_spin_rally_codes add column if not exists relay_secret integer[];

create or replace function public.pin_and_spin_rally_start(rid uuid) returns void
language plpgsql set search_path='' as $$
declare r public.pin_and_spin_rooms; s integer; code integer[]; alternate integer[]; stamp timestamptz:=clock_timestamp();
begin
 select * into r from public.pin_and_spin_rooms where id=rid;
 for s in 1..4 loop
   if s=1 then
     select array_agg(c) into code from (select c from generate_series(0,5) c order by random() limit 4) x;
   else
     loop
       select array_agg(floor(random()*6)::integer) into code from generate_series(1,case when s=2 then 4 when s=3 then 5 else 6 end);
       exit when s<>2 or (select count(distinct c) from unnest(code) c)<4;
     end loop;
   end if;
   alternate := null;
   if r.mode='relay' then
     loop
       alternate := public.pin_and_spin_code_n(6,s<>1,cardinality(code));
       exit when alternate<>code and (s<>2 or (select count(distinct c) from unnest(alternate) c)<4);
     end loop;
   end if;
   insert into public.pin_and_spin_rally_codes(room_id,puzzle,stage,secret,relay_secret)
     values(rid,r.puzzle,s,code,alternate);
 end loop;
 if r.mode='relay' then
   insert into public.pin_and_spin_relay_members(room_id,puzzle,player_id,team,anchor)
   select rid,r.puzzle,id,team,first_value(id) over(partition by team order by seat)
   from (select id,seat,((row_number() over(order by seat)-1)%2)::integer team
     from public.pin_and_spin_players where room_id=rid and active) roster;
 end if;
 insert into public.pin_and_spin_rally_runs(room_id,puzzle,player_id,deadline,started_at)
 select rid,r.puzzle,id,stamp+interval '3 minutes',stamp from public.pin_and_spin_players where room_id=rid and active
 and (r.mode<>'relay' or id in (select anchor from public.pin_and_spin_relay_members where room_id=rid and puzzle=r.puzzle));
 update public.pin_and_spin_rooms set colors=6,slots=4,secret=null,deadline=null,turn_id=null where id=rid;
end; $$;

create or replace function public.pin_and_spin_rally_advance(rid uuid) returns void
language plpgsql set search_path='' as $$
declare r public.pin_and_spin_rooms; wins uuid[];
begin
 select * into r from public.pin_and_spin_rooms where id=rid;
 if r.status<>'playing' then return; end if;
 update public.pin_and_spin_rally_runs x set state='out',deadline=null
 where x.room_id=rid and x.puzzle=r.puzzle and x.state='racing' and
 (x.deadline<=clock_timestamp() or not exists(select 1 from public.pin_and_spin_players p where p.active and
   ((r.mode<>'relay' and p.id=x.player_id) or
    (r.mode='relay' and exists(select 1 from public.pin_and_spin_relay_members m
     where m.room_id=rid and m.puzzle=r.puzzle and m.anchor=x.player_id and m.player_id=p.id)))));
 if not exists(select 1 from public.pin_and_spin_rally_runs where room_id=rid and puzzle=r.puzzle and state='racing') then
   -- Equal results share the win. Zero solved codes is a no-winner match.
   select array_agg(player_id) into wins from (
     select x.player_id,x.completed, dense_rank() over(order by x.completed desc,x.total_guesses,x.progress_at-x.started_at) place
     from public.pin_and_spin_rally_runs x join public.pin_and_spin_players p on p.id=x.player_id
     where x.room_id=rid and x.puzzle=r.puzzle and (p.active or (r.mode='relay' and exists (select 1 from public.pin_and_spin_relay_members m join public.pin_and_spin_players member on member.id=m.player_id and member.active where m.room_id=rid and m.puzzle=r.puzzle and m.anchor=x.player_id)))
   ) ranked where place=1 and completed>0;
   if r.mode='relay' then
     select array_agg(m.player_id) into wins from public.pin_and_spin_relay_members m
     join public.pin_and_spin_players p on p.id=m.player_id and p.active
     where m.room_id=rid and m.puzzle=r.puzzle and m.anchor=any(wins);
   end if;
   update public.pin_and_spin_rooms set status='finished',winners=coalesce(wins,'{}') where id=rid;
 end if;
end; $$;

create or replace function public.pin_and_spin_rally_guess(rid uuid,pid uuid,data jsonb) returns void
language plpgsql set search_path='' as $$
declare r public.pin_and_spin_rooms; run public.pin_and_spin_rally_runs; code integer[]; choices integer[]; score integer[]; a integer; stamp timestamptz;
begin
 select * into r from public.pin_and_spin_rooms where id=rid;
 select * into run from public.pin_and_spin_rally_runs where room_id=rid and puzzle=r.puzzle and player_id=pid;
 if r.status<>'playing' or run.state<>'racing' or run.deadline<=clock_timestamp() or
 (data->>'puzzle')::integer is distinct from r.puzzle or (data->>'stage')::integer is distinct from run.stage then return; end if;
 select count(*)+1 into a from public.pin_and_spin_rally_guesses where room_id=rid and puzzle=r.puzzle and player_id=pid and stage=run.stage;
 if a>6 or (data->>'attempt')::integer is distinct from a then return; end if;
 select case when r.mode='relay' and exists(select 1 from public.pin_and_spin_relay_members
   where room_id=rid and puzzle=r.puzzle and player_id=pid and team=1) then relay_secret else secret end
   into code from public.pin_and_spin_rally_codes where room_id=rid and puzzle=r.puzzle and stage=run.stage;
 if jsonb_typeof(data->'colors') is distinct from 'array' or jsonb_array_length(data->'colors')<>cardinality(code) then raise exception 'Fill every slot'; end if;
 select array_agg(value::integer) into choices from jsonb_array_elements_text(data->'colors');
 if exists(select 1 from unnest(choices) c where c is null or c<0 or c>5) then raise exception 'Invalid color'; end if;
 score:=public.pin_and_spin_score(code,choices); stamp:=clock_timestamp();
 insert into public.pin_and_spin_rally_guesses values(rid,r.puzzle,pid,run.stage,a,choices,score[1],score[2]);
 update public.pin_and_spin_rally_runs set total_guesses=total_guesses+1 where room_id=rid and puzzle=r.puzzle and player_id=pid;
 if score[1]=cardinality(code) then
   update public.pin_and_spin_rally_runs set completed=run.stage,progress_at=stamp,
     stage=least(4,run.stage+1),state=case when run.stage=4 then 'finished' else 'racing' end,
     deadline=case when run.stage<4 then stamp+interval '3 minutes' end
     where room_id=rid and puzzle=r.puzzle and player_id=pid;
   if run.stage=4 then
     update public.pin_and_spin_rooms set status='finished',winners=case when r.mode='relay' then array(select m.player_id from public.pin_and_spin_relay_members m
       join public.pin_and_spin_players p on p.id=m.player_id and p.active where m.room_id=rid and m.puzzle=r.puzzle and m.anchor=pid) else array[pid] end where id=rid;
   end if;
 elsif a=6 then
   update public.pin_and_spin_rally_runs set state='out',deadline=null where room_id=rid and puzzle=r.puzzle and player_id=pid;
 end if;
end; $$;


create or replace function public.pin_and_spin_relay_turn(rid uuid, puzzle_no integer, anchor_id uuid, last_seat integer)
returns uuid language sql stable set search_path='' as $$
  select p.id from public.pin_and_spin_relay_members m
  join public.pin_and_spin_players p on p.id=m.player_id
  where m.room_id=rid and m.puzzle=puzzle_no and m.anchor=anchor_id and p.active
  order by (last_seat is not null and p.seat<=last_seat),p.seat limit 1;
$$;

create or replace function public.pin_and_spin_relay_guess(rid uuid,pid uuid,data jsonb)
returns void language plpgsql set search_path='' as $$
declare room public.pin_and_spin_rooms; run public.pin_and_spin_rally_runs; anchor_id uuid;
begin
  select * into room from public.pin_and_spin_rooms where id=rid;
  select anchor into anchor_id from public.pin_and_spin_relay_members where room_id=rid and puzzle=room.puzzle and player_id=pid;
  select * into run from public.pin_and_spin_rally_runs where room_id=rid and puzzle=room.puzzle and player_id=anchor_id;
  if not found or room.status<>'playing' or run.state<>'racing' then return; end if;
  if public.pin_and_spin_relay_turn(rid,room.puzzle,anchor_id,run.relay_last_seat) is distinct from pid then
    raise exception 'Wait for your turn to submit';
  end if;
  perform public.pin_and_spin_rally_guess(rid,anchor_id,data);
  update public.pin_and_spin_rally_runs set relay_last_seat=(select seat from public.pin_and_spin_players where id=pid)
    where room_id=rid and puzzle=room.puzzle and player_id=anchor_id and total_guesses>run.total_guesses;
end;
$$;

create or replace function public.pin_and_spin_relay_view(rid uuid,pid uuid,snapshot jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare puzzle_no integer := (snapshot->>'puzzle')::integer; teams jsonb; own jsonb; own_team integer;
begin
  select team into own_team from public.pin_and_spin_relay_members where room_id=rid and puzzle=puzzle_no and player_id=pid;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.team,'members',t.members,'stage',r.stage,'completed',r.completed,'state',r.state,
    'deadline',r.deadline,'totalGuesses',r.total_guesses,'slots',case r.stage when 3 then 5 when 4 then 6 else 4 end,
    'turnId',case when r.state='racing' then public.pin_and_spin_relay_turn(rid,puzzle_no,r.player_id,r.relay_last_seat) end,
    'guesses',coalesce((select jsonb_agg(jsonb_build_object('attempt',g.attempt,'colors',g.colors,'pins',g.pins,'spins',g.spins,'revealed',true) order by g.attempt)
      from public.pin_and_spin_rally_guesses g where g.room_id=rid and g.puzzle=puzzle_no and g.player_id=r.player_id and g.stage=r.stage),'[]'::jsonb)
  ) order by t.team),'[]'::jsonb) into teams
  from (select team,anchor,jsonb_agg(player_id) members from public.pin_and_spin_relay_members where room_id=rid and puzzle=puzzle_no group by team,anchor) t
  join public.pin_and_spin_rally_runs r on r.room_id=rid and r.puzzle=puzzle_no and r.player_id=t.anchor;
  if snapshot->>'status'='lobby' then teams:='[]'::jsonb; end if;
  own := teams->own_team;
  return snapshot || jsonb_build_object('teams',teams,'team',own_team,'stage',coalesce(own->'stage','1'),
    'slots',coalesce(own->'slots','4'),'colors',6,'deadline',own->'deadline','turnId',own->'turnId',
    'runState',own->'state','answer',null,
    'guesses',coalesce((select jsonb_agg(g || jsonb_build_object('playerId',pid) order by (g->>'attempt')::int)
      from jsonb_array_elements(own->'guesses') g),'[]'::jsonb));
end;
$$;

revoke all on function public.pin_and_spin_relay_turn(uuid,integer,uuid,integer), public.pin_and_spin_relay_guess(uuid,uuid,jsonb), public.pin_and_spin_relay_view(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pin_and_spin_relay_turn(uuid,integer,uuid,integer), public.pin_and_spin_relay_guess(uuid,uuid,jsonb), public.pin_and_spin_relay_view(uuid,uuid,jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.pin_and_spin_advance(rid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r public.pin_and_spin_rooms; remaining integer; wins uuid[]; next_player uuid; rush_revealed integer;
begin
  select * into r from public.pin_and_spin_rooms where id=rid;
  if r.status <> 'playing' then return; end if;
  if not exists(select 1 from public.pin_and_spin_players where room_id=rid and active) then
    update public.pin_and_spin_rooms set status='closed' where id=rid; return;
  end if;
  if r.mode in ('rally','relay') then
    perform public.pin_and_spin_rally_advance(rid); return;
  end if;
  if r.mode in ('reveal','timed-reveal') then
    select count(*) into remaining from public.pin_and_spin_players p where p.room_id=rid and p.active
      and not exists(select 1 from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id and g.attempt=r.round);
    if remaining > 0 and (r.deadline is null or clock_timestamp()<r.deadline) then return; end if;
    insert into public.pin_and_spin_guesses(room_id,player_id,puzzle,attempt,revealed)
      select rid,p.id,r.puzzle,r.round,true from public.pin_and_spin_players p where p.room_id=rid and p.active
      on conflict(room_id,puzzle,player_id,attempt) do nothing;
    update public.pin_and_spin_guesses set revealed=true where room_id=rid and puzzle=r.puzzle and attempt=r.round;
    select array_agg(g.player_id order by p.seat) into wins from public.pin_and_spin_guesses g
      join public.pin_and_spin_players p on p.id=g.player_id
      where g.room_id=rid and g.puzzle=r.puzzle and g.attempt=r.round and g.pins=r.slots and p.active;
    if wins is not null or r.round=4 then
      update public.pin_and_spin_rooms set status='finished',winners=coalesce(wins,'{}'),deadline=null where id=rid;
    else
      update public.pin_and_spin_rooms set round=round+1,deadline=case when mode='timed-reveal' then clock_timestamp()+interval '3 minutes' end where id=rid;
    end if;
  elsif r.mode='rush' then
    -- Players may submit all five rows anytime; clues stay sealed until that
    -- row's scheduled reveal: row 1 at minute 1 ... row 5 at minute 5.
    if r.deadline is null then return; end if;
    rush_revealed := least(5, greatest(0,
      floor(extract(epoch from (clock_timestamp() -
        (r.deadline - interval '5 minutes')))/60)::integer));
    if rush_revealed > r.round then
      update public.pin_and_spin_guesses set revealed=true
        where room_id=rid and puzzle=r.puzzle and attempt<=rush_revealed;
      update public.pin_and_spin_rooms set round=rush_revealed where id=rid;
    end if;
    -- All five scheduled reveals run even when somebody has already solved.
    if clock_timestamp()>=r.deadline then
      update public.pin_and_spin_guesses set revealed=true
        where room_id=rid and puzzle=r.puzzle;
      select g.player_id into next_player
        from public.pin_and_spin_guesses g
        where g.room_id=rid and g.puzzle=r.puzzle and g.colors is not null
          and g.pins=r.slots
        order by g.id limit 1;
      update public.pin_and_spin_rooms set status='finished',round=5,
        winners=case when next_player is null then '{}'::uuid[] else array[next_player] end,
        deadline=null where id=rid;
    end if;
  else
    if not exists(select 1 from public.pin_and_spin_players p where p.id=r.turn_id and p.active and
      (select count(*) from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id)<4) then
      select p.id into next_player from public.pin_and_spin_players p where p.room_id=rid and p.active and
        (select count(*) from public.pin_and_spin_guesses g where g.room_id=rid and g.puzzle=r.puzzle and g.player_id=p.id)<4
        order by case when p.seat > coalesce((select seat from public.pin_and_spin_players where id=r.turn_id),0) then 0 else 1 end,p.seat limit 1;
      update public.pin_and_spin_rooms set turn_id=next_player,status=case when next_player is null then 'finished' else 'playing' end where id=rid;
    end if;
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.pin_and_spin_api(p_action text, p_code text DEFAULT ''::text, p_token text DEFAULT ''::text, p_data jsonb DEFAULT '{}'::jsonb, p_origin_hash text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 r public.pin_and_spin_rooms; me public.pin_and_spin_players; target public.pin_and_spin_players; pid uuid; next_player uuid;
 v_token_hash text := encode(sha256(convert_to(p_token,'UTF8')),'hex');
 nickname text := left(btrim(p_data->>'name'),20); choices integer[]; score integer[];
 account_id uuid := nullif(p_data->>'_account_id','')::uuid;
 n integer; lim integer; a integer; is_display boolean := false; result jsonb; v_colors integer; v_slots integer; v_appearance jsonb; v_accent text;
begin
 if p_action not in ('create','join','state','ready','start','guess','leave','replay','display','kick','appearance') then raise exception 'Unknown action'; end if;
 if p_action <> 'display' and (p_token is null or p_token !~ '^[a-f0-9]{64}$') then raise exception 'Invalid player session'; end if;
 if account_id is not null and p_action in ('create','join') then
   select left(btrim(p.nickname),20) into nickname from public.profiles p where p.id=account_id;
   if nickname is null or length(nickname)=0 then raise exception 'Your Domino profile is unavailable. Open Dekabess to finish your profile'; end if;
 end if;
 if p_action='create' then
   if nickname is null or length(nickname)<1 then raise exception 'Enter your name'; end if;
   if coalesce(p_data->>'mode','') not in ('classic','reveal','timed-reveal','rush','rally','relay') then raise exception 'Choose a game mode'; end if;
   perform pg_advisory_xact_lock(hashtextextended(p_origin_hash,0));
   if (select count(*) from public.pin_and_spin_rooms where creator_hash=p_origin_hash and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many rooms. Try again later'; end if;
   -- Retrying the same create request returns the existing room, avoiding duplicate rooms.
   select rm.* into r from public.pin_and_spin_rooms rm join public.pin_and_spin_players p on p.room_id=rm.id
     where p.token_hash=v_token_hash and p.active and rm.expires_at>now() and rm.status<>'closed' order by rm.created_at desc limit 1;
   if not found then
     loop
       begin
         insert into public.pin_and_spin_rooms(code,mode,creator_hash)
           values(upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),p_data->>'mode',p_origin_hash) returning * into r;
         exit;
       exception when unique_violation then null;
       end;
     end loop;
     insert into public.pin_and_spin_players(room_id,token_hash,name,seat,ready)
       values(r.id,v_token_hash,nickname,1,true) returning id into pid;
     update public.pin_and_spin_rooms set host_id=pid where id=r.id;
   end if;
   p_code := r.code;
 end if;
 select * into r from public.pin_and_spin_rooms where code=upper(btrim(p_code)) for update;
 if not found or r.expires_at<now() or r.status='closed' then raise exception 'Room not found or expired'; end if;
 if p_action='display' then
   if p_token is null or p_token<>r.display_token then raise exception 'Invalid display link'; end if;
   is_display := true;
 else
   select * into me from public.pin_and_spin_players where room_id=r.id and pin_and_spin_players.token_hash=v_token_hash;
   if me.kicked then raise exception 'The host removed you from this room'; end if;
   if me.user_id is not null and me.user_id is distinct from account_id then
     raise exception 'ACCOUNT_REQUIRED: Sign in with the Domino account used to join this room';
   end if;
   if account_id is not null and p_action in ('create','join') and exists(
     select 1 from public.pin_and_spin_players p where p.room_id=r.id and p.active and p.user_id=account_id and p.id is distinct from me.id
   ) then raise exception 'This account already has a seat in this room. Return to the original device'; end if;
   if p_action='join' and (me.id is null or not me.active) then
     if r.status<>'lobby' then raise exception 'This game has already started'; end if;
     if nickname is null or length(nickname)<1 then raise exception 'Enter your name'; end if;
     if (select count(*) from public.pin_and_spin_players where room_id=r.id and active)>=10 then raise exception 'This room is full'; end if;
     -- Classic is turn-based, so it is for exactly 2 players (more would make it unfair).
     if r.mode='classic' and (select count(*) from public.pin_and_spin_players where room_id=r.id and active)>=2 then
       raise exception 'Classic is for 2 players and this room is full. Ask for a Reveal or Rush room to play with more friends';
     end if;
     if exists(select 1 from public.pin_and_spin_players where room_id=r.id and active and lower(name)=lower(nickname)) then raise exception 'That name is already taken'; end if;
     if me.id is null then
       insert into public.pin_and_spin_players(room_id,token_hash,name,seat)
       select r.id,v_token_hash,nickname,coalesce(max(seat),0)+1 from public.pin_and_spin_players where room_id=r.id returning * into me;
     else
       update public.pin_and_spin_players set active=true,ready=false,name=nickname where id=me.id returning * into me;
     end if;
   end if;
   if me.id is null or not me.active then raise exception 'Your seat is no longer in this room'; end if;
   if account_id is not null and p_action in ('create','join') then
     update public.pin_and_spin_players set user_id=account_id,name=nickname where id=me.id;
   end if;
   -- A saved account style follows its player into the room. Guests use this device's style.
   if p_action in ('create','join') then
     if account_id is not null then
       select appearance into v_appearance from public.pin_and_spin_cosmetics where user_id=account_id;
     else
       v_appearance := p_data->'appearance';
     end if;
     if account_id is not null then
       v_appearance := public.pin_and_spin_unlocked_cosmetics(v_appearance, account_id);
     else
       v_appearance := public.pin_and_spin_valid_cosmetics(v_appearance, account_id);
     end if;
     v_accent := v_appearance->>'accent';
     if exists(select 1 from public.pin_and_spin_players p where p.room_id=r.id and p.active and p.id<>me.id and p.appearance->>'accent'=v_accent) then
       select color into v_accent from unnest(array['violet','teal','amber','rose','blue','lime','coral','ice','gold','orchid']) color
       where not exists(select 1 from public.pin_and_spin_players p where p.room_id=r.id and p.active and p.id<>me.id and p.appearance->>'accent'=color)
       limit 1;
     end if;
     update public.pin_and_spin_players set appearance=jsonb_set(v_appearance,'{accent}',to_jsonb(v_accent)) where id=me.id;
   end if;
   -- Presence: every request from a player's device counts as a heartbeat.
   update public.pin_and_spin_players set last_seen=clock_timestamp() where id=me.id;
   -- If the host's device has been silent for 60 seconds, hand the room to the next connected player.
   if exists(select 1 from public.pin_and_spin_players where id=r.host_id and (not active or last_seen<clock_timestamp()-interval '60 seconds')) then
     select id into next_player from public.pin_and_spin_players where room_id=r.id and active and last_seen>=clock_timestamp()-interval '60 seconds'
       order by seat limit 1;
     if next_player is not null then update public.pin_and_spin_rooms set host_id=next_player where id=r.id; end if;
   end if;
 end if;
 perform public.pin_and_spin_advance(r.id);
 select * into r from public.pin_and_spin_rooms where id=r.id;
 if p_action='appearance' then
   -- An automatically assigned room accent may be kept, but selecting a new accent
   -- still requires its trophy. All other cosmetic choices are always checked.
   v_accent := coalesce(p_data->'appearance'->>'accent','violet');
   v_appearance := public.pin_and_spin_valid_cosmetics(
     jsonb_set(p_data->'appearance','{accent}','"violet"'::jsonb), account_id);
   if v_accent is distinct from me.appearance->>'accent' then
     perform public.pin_and_spin_valid_cosmetics(jsonb_build_object('accent',v_accent), account_id);
   end if;
   v_appearance := jsonb_set(v_appearance,'{accent}',to_jsonb(v_accent));
   if exists(select 1 from public.pin_and_spin_players p where p.room_id=r.id and p.active and p.id<>me.id and p.appearance->>'accent'=v_appearance->>'accent') then
     raise exception 'That board color is in use in this room. Choose another.';
   end if;
   update public.pin_and_spin_players set appearance=v_appearance where id=me.id;
   if account_id is not null then
     insert into public.pin_and_spin_cosmetics(user_id,appearance) values(account_id,public.pin_and_spin_unlocked_cosmetics(v_appearance, account_id))
       on conflict(user_id) do update set appearance=excluded.appearance;
   end if;
 elsif p_action='ready' then
   if r.status<>'lobby' then raise exception 'Game has already started'; end if;
   update public.pin_and_spin_players set ready=coalesce((p_data->>'ready')::boolean,false) where id=me.id;
 elsif p_action='replay' then
   if me.id<>r.host_id or r.status<>'finished' then raise exception 'Only the host can start a rematch after the game'; end if;
   update public.pin_and_spin_rooms set status='lobby',secret=null,winners='{}',deadline=null,turn_id=null where id=r.id;
   update public.pin_and_spin_players set ready=(id=r.host_id) where room_id=r.id and active;
 elsif p_action='start' then
   if me.id<>r.host_id or r.status<>'lobby' then raise exception 'Only the host can start from the lobby'; end if;
   select count(*) into n from public.pin_and_spin_players where room_id=r.id and active;
   if n<2 then raise exception 'At least two players are needed'; end if;
   if r.mode='relay' and n<4 then raise exception 'Rally Relay needs at least four players'; end if;
   if r.mode='classic' and n>2 then raise exception 'Classic is for 2 players. Remove players, or start a Reveal or Rush room'; end if;
   if exists(select 1 from public.pin_and_spin_players where room_id=r.id and active and not ready) then raise exception 'Wait for everyone to be ready'; end if;
   -- 4 or more players: 8 colors instead of 6, so the code is harder to crack together.
   -- Only when the host's app can show 8 colors ("maxColors": 8): an older app (open from
   -- before this update) keeps 6, so it never gets a code with colors it can't pick.
   v_colors := case when n>3 and coalesce(p_data->>'maxColors','')='8' then 8 else 6 end;
   -- 7-8 players: a 5-ball code; 9 or more: 6 balls. Again only for a host app that can show
   -- them ("maxSlots"); an older app keeps 4.
   v_slots := case when n>=9 and coalesce((p_data->>'maxSlots')::integer,4)>=6 then 6
                   when n>=7 and coalesce((p_data->>'maxSlots')::integer,4)>=5 then 5 else 4 end;
   select array_agg(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,2))::bit(8)::integer % v_colors) into choices from generate_series(1,v_slots);
   select id into next_player from public.pin_and_spin_players where room_id=r.id and active order by seat offset (case when r.mode='classic' then floor(random() * n)::integer else r.starter % n end) limit 1;
   update public.pin_and_spin_rooms set status='playing',secret=choices,colors=v_colors,slots=v_slots,puzzle=puzzle+1,round=case when mode='rush' then 0 else 1 end,starter=starter+1,turn_id=next_player,winners='{}',
     deadline=case when mode='rush' then clock_timestamp()+interval '5 minutes' when mode='timed-reveal' then clock_timestamp()+interval '3 minutes' end where id=r.id;
   if r.mode in ('rally','relay') then perform public.pin_and_spin_rally_start(r.id); end if;
 elsif p_action='guess' and r.mode='relay' then
   perform public.pin_and_spin_relay_guess(r.id,me.id,p_data);
 elsif p_action='guess' and r.mode='rally' then
   perform public.pin_and_spin_rally_guess(r.id,me.id,p_data);
 elsif p_action='guess' then
   -- A late request returns current state without accepting or rolling back deadline advancement.
   if r.status='playing' and (p_data->>'puzzle')::integer=r.puzzle then
     select count(*)+1 into a from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id;
     lim := case when r.mode='rush' then 5 else 4 end;
     if r.mode in ('reveal','timed-reveal') then a:=r.round; end if;
     if (p_data->>'attempt')::integer=a and a<=lim and (r.mode<>'classic' or r.turn_id=me.id)
       and not exists(select 1 from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id and attempt=a) then
       if jsonb_typeof(p_data->'colors')<>'array' or jsonb_array_length(p_data->'colors')<>r.slots then raise exception 'Choose % colors', r.slots; end if;
       select array_agg(value::integer) into choices from jsonb_array_elements_text(p_data->'colors');
       if choices is null or exists(select 1 from unnest(choices) c where c is null or c<0 or c>=r.colors) then raise exception 'Invalid color'; end if;
       score:=public.pin_and_spin_score(r.secret,choices);
       insert into public.pin_and_spin_guesses(room_id,player_id,puzzle,attempt,colors,pins,spins,revealed)
         values(r.id,me.id,r.puzzle,a,choices,score[1],score[2],(r.mode='classic' or (r.mode='rush' and a<=r.round)));
       if r.mode='classic' and score[1]=r.slots then
         update public.pin_and_spin_rooms set status='finished',winners=array[me.id],deadline=null where id=r.id;
       elsif r.mode='classic' then
         select p.id into next_player from public.pin_and_spin_players p where p.room_id=r.id and p.active and
           (select count(*) from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and g.player_id=p.id)<4
           order by case when p.seat>me.seat then 0 else 1 end,p.seat limit 1;
         update public.pin_and_spin_rooms set turn_id=next_player,status=case when next_player is null then 'finished' else 'playing' end where id=r.id;
       end if;
     end if;
   end if;
 elsif p_action='kick' then
   if me.id<>r.host_id then raise exception 'Only the host can remove players'; end if;
   select * into target from public.pin_and_spin_players
     where room_id=r.id and active and id=nullif(p_data->>'playerId','')::uuid;
   if target.id is null then raise exception 'That player is no longer in the room'; end if;
   if target.id=me.id then raise exception 'Use Leave Room to leave'; end if;
   update public.pin_and_spin_players set active=false,ready=false,kicked=true where id=target.id;
 elsif p_action='leave' then
   update public.pin_and_spin_players set active=false,ready=false where id=me.id;
   if me.id=r.host_id then
     select id into next_player from public.pin_and_spin_players where room_id=r.id and active order by seat limit 1;
     update public.pin_and_spin_rooms set host_id=next_player,status=case when next_player is null then 'closed' else status end where id=r.id;
   end if;
   perform public.pin_and_spin_advance(r.id);
   return jsonb_build_object('left',true);
 end if;
 perform public.pin_and_spin_advance(r.id);
 select * into r from public.pin_and_spin_rooms where id=r.id;
 select jsonb_build_object(
   'code',r.code,'mode',r.mode,'status',r.status,'hostId',r.host_id,'me',me.id,
   'puzzle',r.puzzle,'round',r.round,'turnId',r.turn_id,'deadline',r.deadline,
   'serverTime',clock_timestamp(),'winners',r.winners,'colors',r.colors,'slots',r.slots,
   'answer',case when r.status='finished' then to_jsonb(r.secret) else null end,
   'displayToken',case when not is_display then r.display_token else null end,
   'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'seat',p.seat,'ready',p.ready,'active',p.active,'wins',p.wins,'appearance',p.appearance,
     'submittedCount',(select count(*) from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and g.player_id=p.id),
     'away',p.active and p.last_seen<clock_timestamp()-interval '45 seconds',
     'submitted',exists(select 1 from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and g.player_id=p.id and g.attempt=r.round)) order by p.seat)
     from public.pin_and_spin_players p where p.room_id=r.id and (p.active or r.status<>'lobby')),'[]'::jsonb),
   'guesses',coalesce((select jsonb_agg(jsonb_build_object('playerId',g.player_id,'attempt',g.attempt,'colors',g.colors,
     'pins',case when g.revealed then g.pins else null end,'spins',case when g.revealed then g.spins else null end,'revealed',g.revealed) order by g.id)
     from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and (g.revealed or (not is_display and g.player_id=me.id))),'[]'::jsonb)
 ) into result;
 if r.mode='relay' then return public.pin_and_spin_relay_view(r.id,case when is_display then null else me.id end,result); end if;
 if r.mode='rally' then return public.pin_and_spin_rally_view(r.id,case when is_display then null else me.id end,result); end if;
 return result;
end;
$function$
;
revoke all on function public.pin_and_spin_advance(uuid) from public,anon,authenticated;
revoke all on function public.pin_and_spin_api(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.pin_and_spin_api(text,text,text,jsonb,text) to service_role;

