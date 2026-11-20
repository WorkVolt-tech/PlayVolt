-- Drop & Block trophies and leaderboard; no changes to other PlayVolt games.
-- Results are server-written only. A local demo never writes results.
create table if not exists public.drop_block_achievements (
 user_id uuid not null references public.profiles(id) on delete cascade,
 code text not null check (code in (
  'first_match','first_win','wins_5','wins_20','streak_3',
  'party_win','chaos_win','elimination_win','collapse_win',
  'territory_win','classic_win','five_modes'
 )),
 earned_at timestamptz not null default now(),
 primary key (user_id,code)
);
comment on table public.drop_block_achievements is 'Drop & Block only: server-awarded trophies unlocked by authenticated online matches';
alter table public.drop_block_achievements enable row level security;
revoke all on public.drop_block_achievements from public,anon,authenticated;

create index if not exists drop_block_results_user_created_idx
 on public.drop_block_results(user_id,created_at desc);
create index if not exists drop_block_achievements_earned_idx
 on public.drop_block_achievements(user_id,earned_at desc);

-- Private award helper; callable internally by the results trigger, not by browsers.
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
   coalesce(bool_or(r.mode='classic' and s.won),false)
 into v_mode_wins,v_chaos,v_elimination,v_collapse,v_territory,v_classic
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
  ('five_modes',v_mode_wins>=5)
 ) b(code,eligible) where b.eligible on conflict(user_id,code) do nothing;
end;
$$;
revoke all on function public.drop_block_award_user(uuid) from public,anon,authenticated;

create or replace function public.drop_block_award_on_result()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.drop_block_award_user(new.user_id);
 return new;
end;
$$;
revoke all on function public.drop_block_award_on_result() from public,anon,authenticated;
drop trigger if exists drop_block_award_result on public.drop_block_results;
create trigger drop_block_award_result
 after insert on public.drop_block_results
 for each row execute function public.drop_block_award_on_result();

-- Backfill any real matches completed before this feature was installed.
do $$
declare u record;
begin
 for u in select distinct user_id from public.drop_block_results loop
  perform public.drop_block_award_user(u.user_id);
 end loop;
end
$$;

-- One read-only, filtered endpoint for signed-in players. No direct table grants.
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
 if v_mode not in ('all','classic','territory','elimination','collapse','chaos') then
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
  'mode',v_mode,'period',v_period,'trophyCount',12);
end;
$$;
revoke all on function public.drop_block_progress(text,text,integer) from public,anon,authenticated;
grant execute on function public.drop_block_progress(text,text,integer) to authenticated;
