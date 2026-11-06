-- Pin & Spin migration 013: Classic is for 2 players.
-- Classic is turn-based, and with 3+ players the later players learn from everyone else's
-- guesses before their turn, which is unfair. Rooms in Classic mode now take at most 2
-- players (join, friend invites), and a Classic game can't start with more than 2.
-- The other modes keep 2-10 players. pin_and_spin_api is migration 003's version plus these
-- checks; pin_and_spin_social is migration 011's plus the invite check. Safe to run more than once.
create or replace function public.pin_and_spin_api(p_action text,p_code text default '',p_token text default '',p_data jsonb default '{}',p_origin_hash text default '')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 r public.pin_and_spin_rooms; me public.pin_and_spin_players; target public.pin_and_spin_players; pid uuid; next_player uuid;
 v_token_hash text := encode(sha256(convert_to(p_token,'UTF8')),'hex');
 nickname text := left(btrim(p_data->>'name'),20); choices integer[]; score integer[];
 account_id uuid := nullif(p_data->>'_account_id','')::uuid;
 n integer; lim integer; a integer; is_display boolean := false; result jsonb;
begin
 if p_action not in ('create','join','state','ready','start','guess','leave','replay','display','kick') then raise exception 'Unknown action'; end if;
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
 if p_action='ready' then
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
   select array_agg(('x'||substr(replace(gen_random_uuid()::text,'-',''),1,2))::bit(8)::integer % 6) into choices from generate_series(1,4);
   select id into next_player from public.pin_and_spin_players where room_id=r.id and active order by seat offset (case when r.mode='classic' then floor(random() * n)::integer else r.starter % n end) limit 1;
   update public.pin_and_spin_rooms set status='playing',secret=choices,puzzle=puzzle+1,round=1,starter=starter+1,turn_id=next_player,winners='{}',
     deadline=case when mode in ('rush','timed-reveal') then clock_timestamp()+interval '3 minutes' end where id=r.id;
 elsif p_action='guess' then
   -- A late request returns current state without accepting or rolling back deadline advancement.
   if r.status='playing' and (p_data->>'puzzle')::integer=r.puzzle then
     select count(*)+1 into a from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id;
     lim := case when r.mode='rush' then 8 else 4 end;
     if r.mode in ('reveal','timed-reveal') then a:=r.round; end if;
     if (p_data->>'attempt')::integer=a and a<=lim and (r.mode<>'classic' or r.turn_id=me.id)
       and not exists(select 1 from public.pin_and_spin_guesses where room_id=r.id and puzzle=r.puzzle and player_id=me.id and attempt=a) then
       if jsonb_typeof(p_data->'colors')<>'array' or jsonb_array_length(p_data->'colors')<>4 then raise exception 'Choose four colors'; end if;
       select array_agg(value::integer) into choices from jsonb_array_elements_text(p_data->'colors');
       if choices is null or exists(select 1 from unnest(choices) c where c is null or c<0 or c>5) then raise exception 'Invalid color'; end if;
       score:=public.pin_and_spin_score(r.secret,choices);
       insert into public.pin_and_spin_guesses(room_id,player_id,puzzle,attempt,colors,pins,spins,revealed)
         values(r.id,me.id,r.puzzle,a,choices,score[1],score[2],r.mode in ('classic','rush'));
       if r.mode in ('classic','rush') and score[1]=4 then
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
   'serverTime',clock_timestamp(),'winners',r.winners,
   'answer',case when r.status='finished' then to_jsonb(r.secret) else null end,
   'displayToken',case when not is_display then r.display_token else null end,
   'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'seat',p.seat,'ready',p.ready,'active',p.active,
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

create or replace function public.pin_and_spin_social(p_action text, p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.pin_and_spin_rooms; v_friend uuid; inv public.pin_and_spin_invites;
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to invite friends'; end if;
  if p_action not in ('invite', 'invites', 'invite_respond') then raise exception 'Unknown action'; end if;

  if p_action = 'invite' then
    v_friend := nullif(p_data->>'friend', '')::uuid;
    select * into r from public.pin_and_spin_rooms where code = upper(btrim(coalesce(p_data->>'code', '')));
    if not found or r.expires_at < now() or r.status <> 'lobby' then raise exception 'Invite friends while the room is waiting to start'; end if;
    if not exists (select 1 from public.pin_and_spin_players p where p.room_id = r.id and p.active and not p.kicked and p.user_id = p_account) then
      raise exception 'Join the room before inviting friends';
    end if;
    if v_friend is null or not exists (select 1 from public.friendships f where f.status = 'accepted'
        and least(f.requester, f.addressee) = least(p_account, v_friend) and greatest(f.requester, f.addressee) = greatest(p_account, v_friend)) then
      raise exception 'You can only invite your friends';
    end if;
    if exists (select 1 from public.pin_and_spin_players p where p.room_id = r.id and p.active and p.user_id = v_friend) then
      raise exception 'Your friend is already in this room';
    end if;
    if r.mode = 'classic' and (select count(*) from public.pin_and_spin_players p where p.room_id = r.id and p.active) >= 2 then
      raise exception 'Classic is for 2 players and this room is full';
    end if;
    if (select count(*) from public.pin_and_spin_invites where from_user = p_account and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'Too many invites. Try again in a few minutes';
    end if;
    -- Blocked either way: say "sent" but deliver nothing (as Dekabess does).
    if exists (select 1 from public.blocks b where (b.blocker = v_friend and b.blocked = p_account) or (b.blocker = p_account and b.blocked = v_friend)) then
      return jsonb_build_object('sent', true);
    end if;
    delete from public.pin_and_spin_invites where from_user = p_account and to_user = v_friend and room_id = r.id;
    insert into public.pin_and_spin_invites(from_user, to_user, room_id) values (p_account, v_friend, r.id);
    return jsonb_build_object('sent', true);
  end if;

  if p_action = 'invites' then
    return jsonb_build_object('invites', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'code', rm.code, 'mode', rm.mode,
        'from', coalesce(nullif(left(btrim(pr.nickname), 20), ''), 'A friend'), 'at', i.created_at) order by i.created_at desc)
      from public.pin_and_spin_invites i
      join public.pin_and_spin_rooms rm on rm.id = i.room_id
      left join public.profiles pr on pr.id = i.from_user
      where i.to_user = p_account and i.status = 'pending' and i.created_at > now() - interval '10 minutes'
        and rm.status = 'lobby' and rm.expires_at > now()), '[]'::jsonb));
  end if;

  -- invite_respond
  select * into inv from public.pin_and_spin_invites where id = nullif(p_data->>'id', '')::uuid and to_user = p_account for update;
  if not found or inv.status <> 'pending' or inv.created_at < now() - interval '10 minutes' then raise exception 'That invite has expired'; end if;
  update public.pin_and_spin_invites set status = case when coalesce((p_data->>'accept')::boolean, false) then 'accepted' else 'declined' end
    where id = inv.id;
  if not coalesce((p_data->>'accept')::boolean, false) then return jsonb_build_object('declined', true); end if;
  select * into r from public.pin_and_spin_rooms where id = inv.room_id;
  if r.status <> 'lobby' or r.expires_at < now() then raise exception 'That game has already started'; end if;
  return jsonb_build_object('code', r.code);
end;
$$;

revoke all on function public.pin_and_spin_api(text, text, text, jsonb, text), public.pin_and_spin_social(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.pin_and_spin_api(text, text, text, jsonb, text), public.pin_and_spin_social(text, uuid, jsonb) to service_role;
