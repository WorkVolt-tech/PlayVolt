-- Pin & Spin migration 019: earn most cosmetic choices through real trophies and story progress.
-- Automatic room colors remain available to keep up to ten players visually distinct.
create or replace function public.pin_and_spin_valid_cosmetics(p_value jsonb, p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v jsonb := coalesce(p_value,'{}'::jsonb); k text; value text; requirement text; result jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(v) <> 'object' then raise exception 'Choose a valid style'; end if;
  for k, value in select key, val from jsonb_each_text(jsonb_build_object(
    'avatar',coalesce(v->>'avatar','initial'), 'board',coalesce(v->>'board','nebula'),
    'piece',coalesce(v->>'piece','round'), 'pin',coalesce(v->>'pin','round'),
    'accent',coalesce(v->>'accent','violet'))) as c(key,val)
  loop
    requirement := null;
    if k='avatar' then
      if value not in ('initial','bunny','fox','cat','champion','royal','carrot','crystal') then raise exception 'Unknown avatar'; end if;
      requirement := case value when 'fox' then 'first_win' when 'cat' then 'hard_win'
        when 'champion' then 'wins_10' when 'royal' then 'wins_50'
        when 'carrot' then 'world_1' when 'crystal' then 'world_4' end;
    elsif k='board' then
      if value not in ('nebula','arcade','waves','gold','prism','crystal') then raise exception 'Unknown board style'; end if;
      requirement := case value when 'arcade' then 'first_win' when 'waves' then 'world_2'
        when 'gold' then 'wins_10' when 'prism' then 'all_modes' when 'crystal' then 'world_4' end;
    elsif k='piece' then
      if value not in ('round','square','star','gem','hex','crown') then raise exception 'Unknown piece shape'; end if;
      requirement := case value when 'square' then 'first_win' when 'star' then 'world_1'
        when 'gem' then 'world_3' when 'hex' then 'hard_win' when 'crown' then 'wins_50' end;
    elsif k='pin' then
      if value not in ('round','square','star') then raise exception 'Unknown result pin shape'; end if;
      requirement := case value when 'square' then 'world_2' when 'star' then 'perfectionist' end;
    else
      if value not in ('violet','teal','amber','rose','blue','lime','coral','ice','gold','orchid') then raise exception 'Unknown board color'; end if;
      requirement := case value when 'teal' then 'first_win' when 'amber' then 'world_1'
        when 'rose' then 'daily_first' when 'blue' then 'hard_win' when 'lime' then 'world_2'
        when 'coral' then 'big_room' when 'ice' then 'world_3' when 'gold' then 'wins_10'
        when 'orchid' then 'world_4' end;
    end if;
    if requirement is not null and (p_user is null or not exists(
      select 1 from public.pin_and_spin_achievements where user_id=p_user and code=requirement)) then
      raise exception 'Unlock this style by earning its trophy first';
    end if;
    result := jsonb_set(result,array[k],to_jsonb(value));
  end loop;
  return result;
end;
$$;

-- Preferences saved under the earlier free-choice rules fall back to free styles when read.
-- This keeps old accounts usable without claiming trophies they have not earned.
create or replace function public.pin_and_spin_unlocked_cosmetics(p_value jsonb, p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare k text; v text; result jsonb := '{}'::jsonb;
begin
  foreach k in array array['avatar','board','piece','pin','accent'] loop
    v := p_value->>k;
    if v is not null then
      begin
        perform public.pin_and_spin_valid_cosmetics(jsonb_build_object(k,v),p_user);
        result := jsonb_set(result,array[k],to_jsonb(v));
      exception when others then null;
      end;
    end if;
  end loop;
  return public.pin_and_spin_valid_cosmetics(result,p_user);
end;
$$;

create or replace function public.pin_and_spin_cosmetic_preferences(p_action text, p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v jsonb;
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to save your style'; end if;
  if p_action='get' then
    select appearance into v from public.pin_and_spin_cosmetics where user_id=p_account;
    return jsonb_build_object('appearance',public.pin_and_spin_unlocked_cosmetics(v,p_account));
  elsif p_action='save' then
    v := public.pin_and_spin_valid_cosmetics(p_data->'appearance',p_account);
    insert into public.pin_and_spin_cosmetics(user_id,appearance) values(p_account,v)
      on conflict(user_id) do update set appearance=excluded.appearance;
    return jsonb_build_object('appearance',v);
  end if;
  raise exception 'Unknown style action';
end;
$$;
revoke all on function public.pin_and_spin_valid_cosmetics(jsonb,uuid),
  public.pin_and_spin_cosmetic_preferences(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pin_and_spin_valid_cosmetics(jsonb,uuid),
  public.pin_and_spin_cosmetic_preferences(text,uuid,jsonb) to service_role;

create or replace function public.pin_and_spin_api(p_action text,p_code text default '',p_token text default '',p_data jsonb default '{}',p_origin_hash text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
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
   if coalesce(p_data->>'mode','') not in ('classic','reveal','timed-reveal','rush') then raise exception 'Choose a game mode'; end if;
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
   update public.pin_and_spin_rooms set status='playing',secret=choices,colors=v_colors,slots=v_slots,puzzle=puzzle+1,round=1,starter=starter+1,turn_id=next_player,winners='{}',
     deadline=case when mode in ('rush','timed-reveal') then clock_timestamp()+interval '3 minutes' end where id=r.id;
 elsif p_action='guess' then
   -- A late request returns current state without accepting or rolling back deadline advancement.
   if r.status='playing' and (p_data->>'puzzle')::integer=r.puzzle then
     select count(*)+1 into a from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id;
     lim := case when r.mode='rush' then 8 else 4 end;
     if r.mode in ('reveal','timed-reveal') then a:=r.round; end if;
     if (p_data->>'attempt')::integer=a and a<=lim and (r.mode<>'classic' or r.turn_id=me.id)
       and not exists(select 1 from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id and attempt=a) then
       if jsonb_typeof(p_data->'colors')<>'array' or jsonb_array_length(p_data->'colors')<>r.slots then raise exception 'Choose % colors', r.slots; end if;
       select array_agg(value::integer) into choices from jsonb_array_elements_text(p_data->'colors');
       if choices is null or exists(select 1 from unnest(choices) c where c is null or c<0 or c>=r.colors) then raise exception 'Invalid color'; end if;
       score:=public.pin_and_spin_score(r.secret,choices);
       insert into public.pin_and_spin_guesses(room_id,player_id,puzzle,attempt,colors,pins,spins,revealed)
         values(r.id,me.id,r.puzzle,a,choices,score[1],score[2],r.mode in ('classic','rush'));
       if r.mode in ('classic','rush') and score[1]=r.slots then
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
     'away',p.active and p.last_seen<clock_timestamp()-interval '45 seconds',
     'submitted',exists(select 1 from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and g.player_id=p.id and g.attempt=r.round)) order by p.seat)
     from public.pin_and_spin_players p where p.room_id=r.id and (p.active or r.status<>'lobby')),'[]'::jsonb),
   'guesses',coalesce((select jsonb_agg(jsonb_build_object('playerId',g.player_id,'attempt',g.attempt,'colors',g.colors,
     'pins',case when g.revealed then g.pins else null end,'spins',case when g.revealed then g.spins else null end,'revealed',g.revealed) order by g.id)
     from public.pin_and_spin_guesses g where g.room_id=r.id and g.puzzle=r.puzzle and (g.revealed or (not is_display and g.player_id=me.id))),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;

revoke all on function public.pin_and_spin_unlocked_cosmetics(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.pin_and_spin_unlocked_cosmetics(jsonb,uuid) to service_role;
