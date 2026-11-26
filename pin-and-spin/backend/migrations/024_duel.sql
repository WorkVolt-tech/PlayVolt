-- Asynchronous, private two-player challenges between existing PlayVolt friends.
create table if not exists public.pin_and_spin_duels (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null, recipient uuid not null check (sender <> recipient),
  secret integer[] not null,
  status text not null default 'pending' check (status in ('pending','playing','finished','declined','cancelled')),
  created_at timestamptz not null default now(),
  winner uuid
);
create index if not exists pin_and_spin_duels_sender_idx on public.pin_and_spin_duels(sender, created_at desc);
create index if not exists pin_and_spin_duels_recipient_idx on public.pin_and_spin_duels(recipient, created_at desc);
create table if not exists public.pin_and_spin_duel_runs (
  duel_id uuid references public.pin_and_spin_duels(id) on delete cascade,
  player uuid,
  guesses jsonb not null default '[]',
  solved boolean not null default false,
  done boolean not null default false,
  primary key (duel_id, player)
);
alter table public.pin_and_spin_duels enable row level security;
alter table public.pin_and_spin_duel_runs enable row level security;
revoke all on public.pin_and_spin_duels, public.pin_and_spin_duel_runs from public, anon, authenticated;
grant select, insert, update on public.pin_and_spin_duels, public.pin_and_spin_duel_runs to service_role;

create or replace function public.pin_and_spin_duel_view(d public.pin_and_spin_duels, viewer uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', d.id, 'incoming', d.recipient = viewer, 'status', d.status, 'createdAt', d.created_at,
    'opponent', coalesce((select p.nickname from public.profiles p
      where p.id = case when d.sender = viewer then d.recipient else d.sender end), 'PlayVolt friend'),
    'answer', case when d.status = 'finished' then to_jsonb(d.secret) end,
    'result', case when d.status = 'finished' then
      case when d.winner = viewer then 'win' when d.winner is not null then 'loss'
        when exists (select 1 from public.pin_and_spin_duel_runs r where r.duel_id=d.id and r.solved) then 'tie'
        else 'unsolved' end end,
    'mine', (select jsonb_build_object('guesses',r.guesses,'done',r.done,'solved',r.solved)
      from public.pin_and_spin_duel_runs r where r.duel_id=d.id and r.player=viewer),
    'theirs', (select jsonb_build_object('done',r.done) ||
      case when d.status='finished' then jsonb_build_object('guesses',r.guesses,'solved',r.solved) else '{}'::jsonb end
      from public.pin_and_spin_duel_runs r where r.duel_id=d.id and r.player<>viewer)
  ) where viewer in (d.sender,d.recipient);
$$;

create or replace function public.pin_and_spin_duel(p_action text, p_account uuid, p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  d public.pin_and_spin_duels; run public.pin_and_spin_duel_runs;
  opponent uuid; colors integer[]; score integer[]; attempt int;
begin
  if p_account is null then raise exception 'ACCOUNT_REQUIRED: Sign in to play Duel'; end if;
  if p_action = 'duel_list' then
    return coalesce((select jsonb_agg(public.pin_and_spin_duel_view(q,p_account) order by q.created_at desc)
      from (select * from public.pin_and_spin_duels where p_account in (sender,recipient)
        order by (status in ('pending','playing')) desc, created_at desc limit 50) q), '[]'::jsonb);
  end if;
  if p_action = 'duel_create' then
    -- Serialize reciprocal and repeated challenges between the same friends.
    opponent := (p_data->>'friend')::uuid;
    if opponent is null or opponent = p_account then raise exception 'Choose a friend'; end if;
    perform pg_advisory_xact_lock(hashtextextended(least(opponent,p_account)::text || greatest(opponent,p_account)::text, 0));
    if not exists (select 1 from public.friendships f where f.status='accepted' and
      ((f.requester=p_account and f.addressee=opponent) or (f.addressee=p_account and f.requester=opponent)))
      or exists (select 1 from public.blocks b where
      (b.blocker=p_account and b.blocked=opponent) or (b.blocker=opponent and b.blocked=p_account))
    then raise exception 'This friend is unavailable for a Duel'; end if;
    select * into d from public.pin_and_spin_duels where status in ('pending','playing') and
      ((sender=p_account and recipient=opponent) or (recipient=p_account and sender=opponent)) limit 1;
    if found then return public.pin_and_spin_duel_view(d,p_account); end if;
    if (select count(*) from public.pin_and_spin_duels where sender=p_account and created_at > now()-interval '1 hour') >= 20 then
      raise exception 'Too many challenges. Try again later';
    end if;
    insert into public.pin_and_spin_duels(sender,recipient,secret)
      values (p_account,opponent,public.pin_and_spin_code_n(6,true,4)) returning * into d;
    return public.pin_and_spin_duel_view(d,p_account);
  end if;

  select * into d from public.pin_and_spin_duels where id=(p_data->>'id')::uuid
    and p_account in (sender,recipient) for update;
  if not found then raise exception 'Duel not found'; end if;
  if p_action = 'duel_get' then return public.pin_and_spin_duel_view(d,p_account); end if;

  if p_action = 'duel_respond' then
    if d.status <> 'pending' then return public.pin_and_spin_duel_view(d,p_account); end if;
    if p_account = d.sender then
      if p_data->>'response' is distinct from 'cancel' then raise exception 'Only your friend can accept'; end if;
      d.status := 'cancelled';
    elsif p_data->>'response' = 'decline' then d.status := 'declined';
    elsif p_data->>'response' = 'accept' then
      if not exists (select 1 from public.friendships f where f.status='accepted' and
        ((f.requester=d.sender and f.addressee=d.recipient) or (f.addressee=d.sender and f.requester=d.recipient)))
        or exists (select 1 from public.blocks b where
        (b.blocker=d.sender and b.blocked=d.recipient) or (b.blocker=d.recipient and b.blocked=d.sender))
      then raise exception 'This friend is unavailable for a Duel'; end if;
      d.status := 'playing';
      insert into public.pin_and_spin_duel_runs(duel_id,player) values (d.id,d.sender),(d.id,d.recipient);
    else raise exception 'Choose a response';
    end if;
    update public.pin_and_spin_duels set status=d.status where id=d.id;
    return public.pin_and_spin_duel_view(d,p_account);
  end if;

  if p_action <> 'duel_guess' then raise exception 'Unknown Duel action'; end if;
  if d.status <> 'playing' then return public.pin_and_spin_duel_view(d,p_account); end if;
  select * into strict run from public.pin_and_spin_duel_runs where duel_id=d.id and player=p_account;
  attempt := jsonb_array_length(run.guesses)+1;
  if run.done or attempt > 8 or (p_data->>'attempt')::int is distinct from attempt then
    return public.pin_and_spin_duel_view(d,p_account);
  end if;
  if jsonb_typeof(p_data->'colors') is distinct from 'array' then raise exception 'Choose four colors'; end if;
  if jsonb_array_length(p_data->'colors') <> 4 or exists
    (select 1 from jsonb_array_elements(p_data->'colors') c where c::text !~ '^[0-5]$')
  then raise exception 'Choose four colors'; end if;
  select array_agg(c::int order by n) into colors from jsonb_array_elements_text(p_data->'colors') with ordinality as v(c,n);
  score := public.pin_and_spin_score(d.secret,colors);
  update public.pin_and_spin_duel_runs set
    guesses=guesses || jsonb_build_array(jsonb_build_object('attempt',attempt,'colors',colors,'pins',score[1],'spins',score[2],'revealed',true)),
    solved=score[1]=4, done=score[1]=4 or attempt=8 where duel_id=d.id and player=p_account;
  if not exists (select 1 from public.pin_and_spin_duel_runs where duel_id=d.id and not done) then
    select case when count(*)=1 then (array_agg(player))[1] end into d.winner from (
      select player, dense_rank() over (order by jsonb_array_length(guesses)) position
      from public.pin_and_spin_duel_runs where duel_id=d.id and solved
    ) ranking where position=1;
    update public.pin_and_spin_duels set status='finished',winner=d.winner where id=d.id returning * into d;
  end if;
  return public.pin_and_spin_duel_view(d,p_account);
end;
$$;
revoke all on function public.pin_and_spin_duel_view(public.pin_and_spin_duels,uuid), public.pin_and_spin_duel(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pin_and_spin_duel_view(public.pin_and_spin_duels,uuid), public.pin_and_spin_duel(text,uuid,jsonb) to service_role;
