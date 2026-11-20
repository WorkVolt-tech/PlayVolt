-- Include Speed Round in existing per-mode leaderboard without changing permissions.
CREATE OR REPLACE FUNCTION public.drop_block_progress(p_mode text DEFAULT 'all'::text, p_period text DEFAULT 'all'::text, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if v_mode not in ('all','classic','speed','territory','elimination','collapse','chaos','team') then
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
$function$;

revoke all on function public.drop_block_progress(text,text,integer) from public,anon,authenticated;
grant execute on function public.drop_block_progress(text,text,integer) to authenticated;