-- PlayVolt hub: server-side admin password check (Game DB).
-- The password is stored only as a bcrypt hash in a table no browser role can read.
-- The hub calls playvolt_check_admin(), which answers true/false (with a short delay
-- to slow guessing). Change the password from the Supabase SQL editor with:
--   select public.playvolt_set_admin_password('your new password');
-- Safe to run again.
create table if not exists public.playvolt_admin_secret (
  id smallint primary key default 1 check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);
comment on table public.playvolt_admin_secret is 'PlayVolt hub admin password (bcrypt hash only). Not readable by browser roles.';
alter table public.playvolt_admin_secret enable row level security;
revoke all on public.playvolt_admin_secret from public, anon, authenticated;

create or replace function public.playvolt_check_admin(p_password text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  perform pg_sleep(0.4); -- every attempt is slow, right or wrong
  select password_hash into h from public.playvolt_admin_secret where id = 1;
  return h is not null and p_password is not null and length(p_password) between 1 and 200
    and extensions.crypt(p_password, h) = h;
end;
$$;

create or replace function public.playvolt_set_admin_password(p_new text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_new is null or length(p_new) < 8 then raise exception 'Use at least 8 characters'; end if;
  insert into public.playvolt_admin_secret (id, password_hash, updated_at)
    values (1, extensions.crypt(p_new, extensions.gen_salt('bf', 10)), now())
  on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now();
end;
$$;

-- Grants: browsers may only ask "is this right?"; only the SQL editor can change it.
revoke all on function public.playvolt_check_admin(text) from public;
grant execute on function public.playvolt_check_admin(text) to anon, authenticated;
revoke all on function public.playvolt_set_admin_password(text) from public, anon, authenticated;
