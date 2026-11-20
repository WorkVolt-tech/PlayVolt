-- Drop & Block Team Battle (2v2,3v3,4v4), game-specific-only migration.
-- Only modifies objects named drop_block_*. No existing PlayVolt auth/games changed.
-- Odd seats = Team Gold, even seats = Team Blue. All four same-team discs may
-- connect even when different teammates placed the discs.
alter table public.drop_block_rooms drop constraint if exists drop_block_rooms_mode_check;
alter table public.drop_block_rooms add constraint drop_block_rooms_mode_check
 check (mode in ('classic','territory','elimination','collapse','chaos','team'));

-- New earned trophy for both teammates on the winning team.
alter table public.drop_block_achievements
 drop constraint if exists drop_block_achievements_code_check;
alter table public.drop_block_achievements
 add constraint drop_block_achievements_code_check check (code in (
 'first_match','first_win','wins_5','wins_20','streak_3',
 'party_win','chaos_win','elimination_win','collapse_win',
 'territory_win','classic_win','five_modes','team_win'
 ));

create or replace function public.drop_block_action(
 p_action text, p_code text default '', p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid := auth.uid();
 v_room public.drop_block_rooms;
 v_seat integer;
 v_name text;
 v_max integer;
 v_width integer;
 v_height integer;
 v_col integer;
 v_row integer;
 v_board jsonb;
 v_points integer := 0;
 v_winner integer := null;
 v_next integer := null;
 v_total integer;
 v_dx integer;
 v_dy integer;
 v_x integer;
 v_y integer;
 v_length integer;
 v_dir integer;
 v_sign integer;
 v_code text;
 v_count integer;
 v_best integer;
 v_ties integer;
 v_target integer;
 v_left integer;
 v_round integer;
 v_floor integer;
 v_event text;
 v_newboard jsonb;
 v_sequence integer;
 v_starter integer;
 v_kind text;
 v_cell integer;
begin
 if v_uid is null then raise exception 'Sign in to your PlayVolt account first'; end if;
 if p_action not in ('create','join','get','ready','start','drop','rematch') then raise exception 'Unknown action'; end if;

 if p_action='create' then
   select left(nullif(btrim(nickname),''),24) into v_name from public.profiles where id=v_uid;
   if v_name is null then raise exception 'Open Dekabess to finish setting up your PlayVolt profile'; end if;
   if (select count(*) from public.drop_block_rooms where host_id=v_uid and created_at>now()-interval '1 day')>=20 then
     raise exception 'Too many rooms created today';
   end if;
   v_max := coalesce((p_data->>'maxPlayers')::integer,4);
   if v_max not between 2 and 8 then raise exception 'Choose 2 to 8 players'; end if;
   if p_data->>'mode'='team' and v_max not in (4,6,8) then
     raise exception 'Team Battle requires a maximum of 4, 6 or 8 players';
   end if;
   if coalesce(p_data->>'mode','') not in ('classic','territory','elimination','collapse','chaos','team') then raise exception 'Choose a game mode'; end if;
   v_width := case when v_max=2 then 7 when v_max<=4 then 9 when v_max<=6 then 12 else 14 end;
   v_height := case when v_max=2 then 6 when v_max<=4 then 8 when v_max<=6 then 9 else 10 end;
   for v_count in 1..8 loop
     v_code := upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
     begin
       insert into public.drop_block_rooms(code,host_id,mode,max_players,width,height,board)
         values(v_code,v_uid,p_data->>'mode',v_max,v_width,v_height,to_jsonb(array_fill(0,array[v_width*v_height])))
         returning * into v_room;
       exit;
     exception when unique_violation then
       if v_count=8 then raise exception 'Unable to create a room code. Please retry'; end if;
     end;
   end loop;
   insert into public.drop_block_players(room_id,user_id,seat,name,ready) values(v_room.id,v_uid,1,v_name,true);
   p_code:=v_room.code;
 end if;

 if p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{6}$' then raise exception 'Enter a six-character room code'; end if;
 select * into v_room from public.drop_block_rooms where code=upper(btrim(p_code)) for update;
 if not found or v_room.created_at<now()-interval '24 hours' then raise exception 'This room does not exist or has expired'; end if;

 select seat into v_seat from public.drop_block_players where room_id=v_room.id and user_id=v_uid;
 if p_action='join' and v_seat is null then
   if v_room.status<>'lobby' then raise exception 'This match has already started'; end if;
   select count(*) into v_count from public.drop_block_players where room_id=v_room.id;
   if v_count>=v_room.max_players then raise exception 'This room is full'; end if;
   select left(nullif(btrim(nickname),''),24) into v_name from public.profiles where id=v_uid;
   if v_name is null then raise exception 'Open Dekabess to finish setting up your PlayVolt profile'; end if;
   select coalesce(max(seat),0)+1 into v_seat from public.drop_block_players where room_id=v_room.id;
   insert into public.drop_block_players(room_id,user_id,seat,name) values(v_room.id,v_uid,v_seat,v_name);
 end if;
 if v_seat is null then raise exception 'Join this room before playing'; end if;

 if p_action='rematch' then
   if v_room.host_id<>v_uid then raise exception 'Only the room host can start a rematch'; end if;
   if v_room.status<>'finished' then raise exception 'Finish the current match before starting a rematch'; end if;
   if (select count(*) from public.drop_block_players where room_id=v_room.id)<2 then
     raise exception 'At least two players are needed';
   end if;
   update public.drop_block_rooms
     set match_number=match_number+1, status='lobby',
       board=to_jsonb(array_fill(0,array[width*height])),
       move_count=0,turn_seat=null,winner_seat=null,
       round_number=1,floor_clears=0,last_event='New match: ready up!',updated_at=now()
     where id=v_room.id;
   update public.drop_block_players
     set score=0,eliminated=false,chaos_block_used=false,chaos_blast_used=false,ready=(user_id=v_uid)
     where room_id=v_room.id;
 elsif p_action='ready' then
   if v_room.status<>'lobby' then raise exception 'The match has already started'; end if;
   update public.drop_block_players set ready=coalesce((p_data->>'ready')::boolean,false)
     where room_id=v_room.id and user_id=v_uid;
 elsif p_action='start' then
   if v_room.host_id<>v_uid then raise exception 'Only the room host can start'; end if;
   if v_room.status<>'lobby' then raise exception 'The match is already underway'; end if;
   select count(*) into v_count from public.drop_block_players where room_id=v_room.id;
   if v_count<2 then raise exception 'At least two players are needed'; end if;
   if v_room.mode='team' and v_count not in (4,6,8) then
     raise exception 'Team Battle starts with 4, 6 or 8 players (balanced teams)';
   end if;
   if exists(select 1 from public.drop_block_players where room_id=v_room.id and not ready) then
     raise exception 'Wait until all players are ready';
   end if;
   -- Fairly rotate the first player across consecutive matches.
   select seat into v_starter from public.drop_block_players
     where room_id=v_room.id order by seat
     offset ((v_room.match_number-1)%v_count) limit 1;
   update public.drop_block_rooms
     set status='playing',turn_seat=v_starter,last_event='',updated_at=now()
     where id=v_room.id;
 elsif p_action='drop' then
   if v_room.status<>'playing' then raise exception 'This room is not currently playing'; end if;
   if v_room.turn_seat<>v_seat then raise exception 'Wait for your turn'; end if;
   if exists (select 1 from public.drop_block_players where room_id=v_room.id and user_id=v_uid and eliminated) then
     raise exception 'You have been eliminated. Watch the remaining players!';
   end if;
   v_round:=v_room.round_number;
   v_floor:=v_room.floor_clears;
   v_event:='';
   v_kind:=coalesce(p_data->>'kind','drop');
   if v_kind not in ('drop','block','blast') then raise exception 'Unknown move kind'; end if;
   if v_room.mode<>'chaos' and v_kind<>'drop' then raise exception 'Powers are only available in Chaos Mode'; end if;
   v_col:=(p_data->>'column')::integer;
   if v_col is null or v_col<0 or v_col>=v_room.width then raise exception 'Invalid column'; end if;
   v_board:=v_room.board;
   if v_kind='blast' then
     if exists(select 1 from public.drop_block_players
       where room_id=v_room.id and user_id=v_uid and chaos_blast_used) then
       raise exception 'Your Blast power has already been used this match';
     end if;
     if (v_board->>((v_room.height-1)*v_room.width+v_col))::integer=0 then
       raise exception 'Choose a column that contains at least one chip';
     end if;
     v_row:=v_room.height-1;
     for v_y in reverse (v_room.height-1)..1 loop
       v_board:=jsonb_set(v_board,array[(v_y*v_room.width+v_col)::text],
         to_jsonb((v_board->>(((v_y-1)*v_room.width+v_col)))::integer),false);
     end loop;
     v_board:=jsonb_set(v_board,array[v_col::text],to_jsonb(0),false);
     update public.drop_block_players set chaos_blast_used=true
       where room_id=v_room.id and user_id=v_uid;
     v_event:='Player ' || v_seat || ' used Blast — a bottom chip vanished!';
   else
     v_row:=null;
     for v_y in reverse (v_room.height-1)..0 loop
       if (v_board->>(v_y*v_room.width+v_col))::integer=0 then v_row:=v_y; exit; end if;
     end loop;
     if v_row is null then raise exception 'That column is full'; end if;
     if v_kind='block' then
       if exists(select 1 from public.drop_block_players
         where room_id=v_room.id and user_id=v_uid and chaos_block_used) then
         raise exception 'Your Barrier power has already been used this match';
       end if;
       v_board:=jsonb_set(v_board,array[(v_row*v_room.width+v_col)::text],to_jsonb(9),false);
       update public.drop_block_players set chaos_block_used=true
         where room_id=v_room.id and user_id=v_uid;
       v_event:='Player ' || v_seat || ' dropped a Barrier!';
     else
       v_board:=jsonb_set(v_board,array[(v_row*v_room.width+v_col)::text],to_jsonb(v_seat),false);
       -- Only a normal drop can complete four in a row and win.
       for v_dir in 1..4 loop
         v_dx:=case v_dir when 1 then 1 when 2 then 0 else 1 end;
         v_dy:=case v_dir when 1 then 0 when 2 then 1 when 3 then 1 else -1 end;
         v_length:=1;
         for v_sign in -1..1 loop
           if v_sign=0 then continue; end if;
           v_x:=v_col+v_sign*v_dx;
           v_y:=v_row+v_sign*v_dy;
           while v_x>=0 and v_x<v_room.width and v_y>=0 and v_y<v_room.height loop
             v_cell:=(v_board->>(v_y*v_room.width+v_x))::integer;
             exit when (v_room.mode='team' and (v_cell not between 1 and 8 or mod(v_cell,2)<>mod(v_seat,2)))
                    or (v_room.mode<>'team' and v_cell<>v_seat);
             v_length:=v_length+1;
             v_x:=v_x+v_sign*v_dx;
             v_y:=v_y+v_sign*v_dy;
           end loop;
         end loop;
         if v_length>=4 then v_points:=v_points+1; end if;
       end loop;
     end if;
   end if;
   update public.drop_block_players set score=score+v_points
     where room_id=v_room.id and user_id=v_uid;
   v_total:=v_room.move_count+1;
   v_sequence:=v_room.total_moves+1;
   insert into public.drop_block_moves(room_id,number,user_id,seat,column_number,row_number,earned,match_number,move_kind)
     values(v_room.id,v_sequence,v_uid,v_seat,v_col,v_row,v_points,v_room.match_number,v_kind);

   if v_room.mode in ('classic','collapse','chaos','team') and v_points>0 then
     v_winner:=v_seat;
   elsif v_room.mode='elimination' and v_points>0 then
     -- Knock out the next living opponent clockwise; winner cannot eliminate themselves.
     select seat into v_target from public.drop_block_players
       where room_id=v_room.id and not eliminated and seat>v_seat order by seat limit 1;
     if v_target is null then
       select seat into v_target from public.drop_block_players
         where room_id=v_room.id and not eliminated and seat<>v_seat order by seat limit 1;
     end if;
     if v_target is not null then
       update public.drop_block_players set eliminated=true
         where room_id=v_room.id and seat=v_target;
     end if;
     select count(*) into v_left from public.drop_block_players
       where room_id=v_room.id and not eliminated;
     v_event := 'Player ' || v_target || ' eliminated!';
     if v_left=1 then
       v_winner:=v_seat;
     else
       v_board:=to_jsonb(array_fill(0,array[v_room.width*v_room.height]));
       v_round:=v_room.round_number+1;
       v_event:=v_event || ' New round!';
     end if;
   elsif v_room.mode='elimination' and not exists (select 1 from jsonb_array_elements_text(v_board) as cell(value) where cell.value='0') then
     -- A full round without a connect-four is a redraw, not a knockout.
     v_board:=to_jsonb(array_fill(0,array[v_room.width*v_room.height]));
     v_round:=v_room.round_number+1;
     v_event:='Board full! New round, no eliminations.';
   elsif v_room.mode='collapse' and v_points=0 and v_row<=1 then
     -- Remove exactly the bottom row. All other rows descend one step; top becomes blank.
     v_newboard:=to_jsonb(array_fill(0,array[v_room.width]));
     for v_y in 0..(v_room.height-2) loop
       for v_x in 0..(v_room.width-1) loop
         v_newboard:=v_newboard || jsonb_build_array((v_board->>(v_y*v_room.width+v_x))::integer);
       end loop;
     end loop;
     v_board:=v_newboard;
     v_floor:=v_room.floor_clears+1;
     v_event:='Bottom row cleared — pieces fell one row!';
   elsif v_total=v_room.width*v_room.height and v_room.mode='territory' then
     select max(score) into v_best from public.drop_block_players where room_id=v_room.id;
     select count(*) into v_ties from public.drop_block_players where room_id=v_room.id and score=v_best;
     if v_ties=1 then
       select seat into v_winner from public.drop_block_players where room_id=v_room.id and score=v_best;
     end if;
   end if;
   if v_winner is not null or (v_room.mode in ('classic','territory','chaos','team') and not exists (select 1 from jsonb_array_elements_text(v_board) as cell(value) where cell.value='0')) then
     update public.drop_block_rooms
       set status='finished',board=v_board,move_count=v_total,total_moves=v_sequence,winner_seat=v_winner,
         round_number=v_round,floor_clears=v_floor,last_event=v_event,turn_seat=null,updated_at=now()
       where id=v_room.id;
     insert into public.drop_block_results(room_id,match_number,user_id,score,won)
       select v_room.id,v_room.match_number,user_id,score,
         case when v_room.mode='team' then
            (v_winner is not null and mod(seat,2)=mod(v_winner,2))
         else seat=v_winner end
       from public.drop_block_players
       where room_id=v_room.id on conflict(room_id,match_number,user_id) do nothing;
   else
     select seat into v_next from public.drop_block_players
       where room_id=v_room.id and (v_room.mode<>'elimination' or not eliminated)
         and seat>v_seat order by seat limit 1;
     if v_next is null then
       select seat into v_next from public.drop_block_players
         where room_id=v_room.id and (v_room.mode<>'elimination' or not eliminated)
         order by seat limit 1;
     end if;
     update public.drop_block_rooms
       set board=v_board,turn_seat=v_next,move_count=v_total,total_moves=v_sequence,
           round_number=v_round,floor_clears=v_floor,last_event=v_event,updated_at=now()
       where id=v_room.id;
   end if;
 end if;

 select * into v_room from public.drop_block_rooms where id=v_room.id;
 return jsonb_build_object(
   'code',v_room.code,'mode',v_room.mode,'status',v_room.status,'maxPlayers',v_room.max_players,
   'width',v_room.width,'height',v_room.height,'board',v_room.board,
   'moveCount',v_room.move_count,'turnSeat',v_room.turn_seat,'winnerSeat',v_room.winner_seat,
   'roundNumber',v_room.round_number,'floorClears',v_room.floor_clears,'lastEvent',v_room.last_event,
   'matchNumber',v_room.match_number,
   'winnerTeam',case when v_room.mode='team' and v_room.winner_seat is not null then
      case when mod(v_room.winner_seat,2)=1 then 1 else 2 end else null end,
   'host',v_room.host_id=v_uid,'meSeat',v_seat,
   'displayToken',v_room.display_token,
   'players',coalesce((
      select jsonb_agg(jsonb_build_object('seat',seat,'name',name,'ready',ready,'score',score,'eliminated',eliminated,
        'chaosBlockUsed',chaos_block_used,'chaosBlastUsed',chaos_blast_used,
        'team',case when mod(seat,2)=1 then 1 else 2 end)
                        order by seat)
      from public.drop_block_players where room_id=v_room.id
   ),'[]'::jsonb)
 );
end;
$$;
revoke all on function public.drop_block_action(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.drop_block_action(text,text,jsonb) to authenticated;





create or replace function public.drop_block_tv_state(
  p_code text, p_token text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 r public.drop_block_rooms;
begin
 if p_code is null or p_code !~ '^[A-Fa-f0-9]{6}$'
    or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
   raise exception 'Invalid TV display link';
 end if;
 select * into r from public.drop_block_rooms
  where code=upper(p_code) and display_token=p_token
    and created_at>now()-interval '24 hours';
 if not found then raise exception 'TV display link is unavailable or expired'; end if;
 return jsonb_build_object(
   'code',r.code,'mode',r.mode,'status',r.status,'maxPlayers',r.max_players,
   'width',r.width,'height',r.height,'board',r.board,
   'moveCount',r.move_count,'turnSeat',r.turn_seat,'winnerSeat',r.winner_seat,
   'roundNumber',r.round_number,'floorClears',r.floor_clears,'lastEvent',r.last_event,
   'matchNumber',r.match_number,
   'winnerTeam',case when r.mode='team' and r.winner_seat is not null then
       case when mod(r.winner_seat,2)=1 then 1 else 2 end else null end,
   'players',coalesce((
      select jsonb_agg(jsonb_build_object(
       'seat',seat,'name',name,'ready',ready,'score',score,'eliminated',eliminated,
        'chaosBlockUsed',chaos_block_used,'chaosBlastUsed',chaos_blast_used,
        'team',case when mod(seat,2)=1 then 1 else 2 end)
       order by seat)
      from public.drop_block_players where room_id=r.id
   ),'[]'::jsonb)
 );
end;
$$;
-- No direct table access, and no gameplay actions granted to guests.
revoke all on function public.drop_block_tv_state(text,text) from public,anon,authenticated;
grant execute on function public.drop_block_tv_state(text,text) to anon,authenticated;

create or replace function public.drop_block_award_user(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
 v_played integer;
 v_wins integer;
 v_streak integer;
 v_mode_wins integer;
 v_party boolean;
 v_chaos boolean;
 v_elimination boolean;
 v_collapse boolean;
 v_territory boolean;
 v_classic boolean;
 v_team boolean;
begin
 if p_user is null then return; end if;
 select count(*)::integer,count(*) filter(where won)::integer
   into v_played,v_wins
 from public.drop_block_results where user_id=p_user;
 if v_played=0 then return; end if;
 select count(*)::integer into v_streak from (
  select bool_and(won) over (
   order by created_at desc,room_id desc,match_number desc
   rows between unbounded preceding and current row
  ) as still_winning
  from public.drop_block_results where user_id=p_user
 ) as consecutive where still_winning;
 select count(distinct r.mode)::integer,
   coalesce(bool_or(r.mode='chaos' and s.won),false),
   coalesce(bool_or(r.mode='elimination' and s.won),false),
   coalesce(bool_or(r.mode='collapse' and s.won),false),
   coalesce(bool_or(r.mode='territory' and s.won),false),
   coalesce(bool_or(r.mode='classic' and s.won),false),
   coalesce(bool_or(r.mode='team' and s.won),false)
 into v_mode_wins,v_chaos,v_elimination,v_collapse,v_territory,v_classic,v_team
 from public.drop_block_results s
 join public.drop_block_rooms r on r.id=s.room_id
 where s.user_id=p_user and s.won;
 select exists(
  select 1 from public.drop_block_results s
  where s.user_id=p_user and s.won and (
   select count(*) from public.drop_block_players pp where pp.room_id=s.room_id
  )>=4
 ) into v_party;
 insert into public.drop_block_achievements(user_id,code)
 select p_user,b.code from (values
  ('first_match'::text, v_played>=1),
  ('first_win',v_wins>=1),
  ('wins_5',v_wins>=5),
  ('wins_20',v_wins>=20),
  ('streak_3',v_streak>=3),
  ('party_win',v_party),
  ('chaos_win',v_chaos),
  ('elimination_win',v_elimination),
  ('collapse_win',v_collapse),
  ('territory_win',v_territory),
  ('classic_win',v_classic),
  ('team_win',v_team),
  ('five_modes',v_mode_wins>=5)
 ) b(code,eligible) where b.eligible on conflict(user_id,code) do nothing;
end;
$$;
revoke all on function public.drop_block_award_user(uuid) from public,anon,authenticated;


create or replace function public.drop_block_progress(
 p_mode text default 'all', p_period text default 'all', p_limit integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();
 v_mode text:=lower(coalesce(p_mode,'all'));
 v_period text:=lower(coalesce(p_period,'all'));
 v_limit integer:=least(greatest(coalesce(p_limit,25),1),50);
 v_me jsonb;
 v_leaders jsonb;
 v_earned jsonb;
begin
 if v_user is null then raise exception 'Sign in with your PlayVolt account to view trophies'; end if;
 if v_mode not in ('all','classic','territory','elimination','collapse','chaos','team') then
  raise exception 'Unknown leaderboard mode';
 end if;
 if v_period not in ('all','weekly') then raise exception 'Unknown leaderboard period'; end if;

 select jsonb_build_object(
  'name',coalesce(nullif(left(p.nickname,24),''),'Player'),
  'played',count(s.user_id),
  'wins',count(s.user_id) filter(where s.won),
  'notWon',count(s.user_id) filter(where not s.won),
  'winRate',case when count(s.user_id)=0 then 0 else
    round(100.0*(count(s.user_id) filter(where s.won))::numeric/count(s.user_id),1) end
 ) into v_me
 from public.profiles p
 left join public.drop_block_results s on s.user_id=p.id
 where p.id=v_user
 group by p.id,p.nickname;
 if v_me is null then v_me:='{"name":"Player","played":0,"wins":0,"draws":0,"winRate":0}'::jsonb; end if;

 with filtered as (
  select s.user_id,s.won
  from public.drop_block_results s
  join public.drop_block_rooms r on r.id=s.room_id
  where (v_mode='all' or r.mode=v_mode)
    and (v_period='all' or s.created_at>=now()-interval '7 days')
 ), totals as (
  select user_id,count(*)::integer as played,
   count(*) filter(where won)::integer as wins
  from filtered group by user_id
 ), ranked as (
  select user_id,played,wins,
    round(wins::numeric*100/greatest(played,1),1) as rate,
    row_number() over(order by wins desc,wins::numeric/greatest(played,1) desc,played desc,user_id) as placement
  from totals
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'rank',r.placement,
  'name',coalesce(nullif(left(p.nickname,24),''),'Player'),
  'wins',r.wins,'played',r.played,'winRate',r.rate,
  'isMe',r.user_id=v_user
 ) order by r.placement),'[]'::jsonb)
 into v_leaders
 from ranked r join public.profiles p on p.id=r.user_id
 where r.placement<=v_limit;

 select coalesce(jsonb_agg(jsonb_build_object(
  'code',a.code,'earnedAt',a.earned_at
 ) order by a.earned_at,a.code),'[]'::jsonb)
 into v_earned from public.drop_block_achievements a where a.user_id=v_user;

 return jsonb_build_object('me',v_me,'leaders',v_leaders,'earned',v_earned,
  'mode',v_mode,'period',v_period,'trophyCount',13);
end;
$$;
revoke all on function public.drop_block_progress(text,text,integer) from public,anon,authenticated;
grant execute on function public.drop_block_progress(text,text,integer) to authenticated;
