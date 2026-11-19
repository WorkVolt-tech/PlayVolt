-- Pin & Spin migration 020: diverse avatars, existing IDs and saved choices preserved.
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
      if value not in ('initial','bunny','bear','fox','wolf','cat','robot','champion','royal','carrot','crystal','dragon') then raise exception 'Unknown avatar'; end if;
      requirement := case value when 'fox' then 'first_win' when 'wolf' then 'first_try' when 'cat' then 'hard_win' when 'robot' then 'world_2'
        when 'champion' then 'wins_10' when 'royal' then 'wins_50'
        when 'carrot' then 'world_1' when 'crystal' then 'world_4' when 'dragon' then 'world_5' end;
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

