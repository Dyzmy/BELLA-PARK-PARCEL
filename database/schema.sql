-- BELLA PARK Parcel Management System
-- Run this script in the Supabase SQL Editor.
-- Never place Supabase service-role keys or real parcel data in this repository.

create table if not exists public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null check (role in ('admin', 'scanner', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.pickup_sessions (
  id uuid primary key default gen_random_uuid(),
  client_session_id text not null,
  courier text not null check (courier in ('SPX', 'J&T', 'NINJA')),
  driver_name text not null,
  picked_up_at timestamptz not null,
  month_key date not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint pickup_month_key_first_day check (extract(day from month_key) = 1),
  constraint pickup_month_matches_timestamp check (
    month_key = date_trunc('month', picked_up_at)::date
  ),
  constraint pickup_session_idempotency unique (created_by, client_session_id)
);

create table if not exists public.parcel_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pickup_sessions(id),
  tracking_number text not null check (length(trim(tracking_number)) > 0),
  created_at timestamptz not null default now(),
  constraint parcel_tracking_unique_per_session unique (session_id, tracking_number)
);

create index if not exists pickup_sessions_month_idx
  on public.pickup_sessions (month_key desc, picked_up_at desc);
create index if not exists parcel_records_session_idx
  on public.parcel_records (session_id);

-- A masked view for authorized website queries. Full tracking values remain
-- in parcel_records and must never be exposed through the public website.
create or replace view public.parcel_records_masked
with (security_invoker = true) as
select
  id,
  session_id,
  case
    when length(tracking_number) <= 8 then repeat('*', length(tracking_number))
    else left(tracking_number, 8) || repeat('*', length(tracking_number) - 8)
  end as tracking_masked,
  created_at
from public.parcel_records;

alter table public.staff_profiles enable row level security;
alter table public.pickup_sessions enable row level security;
alter table public.parcel_records enable row level security;

-- Role checks use the authenticated user's own profile.
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.staff_profiles where user_id = auth.uid()
$$;

revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated;

create policy "Staff can read own profile"
  on public.staff_profiles for select
  to authenticated
  using (user_id = auth.uid() or public.current_staff_role() = 'admin');

create policy "Staff can read pickup sessions"
  on public.pickup_sessions for select
  to authenticated
  using (public.current_staff_role() in ('admin', 'scanner', 'viewer'));

create policy "Scanners and admins can add pickup sessions"
  on public.pickup_sessions for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.current_staff_role() in ('admin', 'scanner')
  );

create policy "Staff can read parcel records"
  on public.parcel_records for select
  to authenticated
  using (public.current_staff_role() in ('admin', 'scanner', 'viewer'));

create policy "Scanners and admins can add parcel records"
  on public.parcel_records for insert
  to authenticated
  with check (
    public.current_staff_role() in ('admin', 'scanner')
    and exists (
      select 1 from public.pickup_sessions s
      where s.id = session_id and s.created_by = auth.uid()
    )
  );

-- Block changes to committed records, even if a client attempts direct writes.
create or replace function public.reject_committed_record_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Committed pickup records are read-only';
end;
$$;

drop trigger if exists pickup_sessions_no_update on public.pickup_sessions;
create trigger pickup_sessions_no_update
before update or delete on public.pickup_sessions
for each row execute function public.reject_committed_record_changes();

drop trigger if exists parcel_records_no_update on public.parcel_records;
create trigger parcel_records_no_update
before update or delete on public.parcel_records
for each row execute function public.reject_committed_record_changes();

-- Explicitly remove mutation rights; inserts remain available under RLS.
revoke update, delete on public.pickup_sessions from anon, authenticated;
revoke update, delete on public.parcel_records from anon, authenticated;
revoke all on public.staff_profiles from anon;
revoke all on public.pickup_sessions from anon;
revoke all on public.parcel_records from anon;
grant select on public.staff_profiles to authenticated;
grant select, insert on public.pickup_sessions to authenticated;
grant select, insert on public.parcel_records to authenticated;
grant select on public.parcel_records_masked to authenticated;
