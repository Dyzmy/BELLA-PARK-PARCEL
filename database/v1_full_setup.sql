-- BELLA PARK DATABASE V1 - SAFE MIGRATION
-- Run once in the Supabase SQL Editor for the existing Parcel Pickup project.
-- This script preserves existing tables and the existing admin profile.
-- Do not add passwords, API secrets, or real parcel data to this file.

begin;

-- Confirm the required tables exist before applying the migration.
do $$
begin
  if to_regclass('public.staff_profiles') is null
     or to_regclass('public.pickup_sessions') is null
     or to_regclass('public.parcel_records') is null then
    raise exception 'Required BELLA PARK tables are missing. Run database/schema.sql first.';
  end if;
end;
$$;

-- Make role lookup safe for use in row-level security policies.
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.staff_profiles
  where user_id = auth.uid()
$$;

revoke all on function public.current_staff_role() from public;
grant execute on function public.current_staff_role() to authenticated;

-- Remove the previous broad full-tracking read policy and replace it.
drop policy if exists "Staff can read parcel records" on public.parcel_records;
drop policy if exists "Only admin and scanners can read full tracking" on public.parcel_records;

create policy "Only admin and scanners can read full tracking"
on public.parcel_records
for select
to authenticated
using (public.current_staff_role() in ('admin', 'scanner'));

-- Rebuild the masked view. It exposes masked values only, and only to signed-in
-- staff with an assigned role. The view owner executes the underlying read.
create or replace view public.parcel_records_masked
with (security_invoker = false) as
select
  p.id,
  p.session_id,
  case
    when length(p.tracking_number) <= 8
      then repeat('*', length(p.tracking_number))
    else left(p.tracking_number, 8)
      || repeat('*', length(p.tracking_number) - 8)
  end as tracking_masked,
  p.created_at
from public.parcel_records p
where public.current_staff_role() in ('admin', 'scanner', 'viewer');

revoke all on public.parcel_records_masked from anon;
grant select on public.parcel_records_masked to authenticated;

-- Keep the underlying tables unavailable to anonymous visitors.
alter table public.staff_profiles enable row level security;
alter table public.pickup_sessions enable row level security;
alter table public.parcel_records enable row level security;

revoke all on public.staff_profiles from anon;
revoke all on public.pickup_sessions from anon;
revoke all on public.parcel_records from anon;

grant select on public.staff_profiles to authenticated;
grant select, insert on public.pickup_sessions to authenticated;
grant select, insert on public.parcel_records to authenticated;

-- Remove direct update/delete privileges. Committed rows remain read-only.
revoke update, delete on public.pickup_sessions from anon, authenticated;
revoke update, delete on public.parcel_records from anon, authenticated;

-- Atomic, idempotent pickup commit for the Android scanner.
-- A retry with the same user + client_session_id returns the existing session
-- and does not append duplicate parcels.
create or replace function public.commit_pickup_session(
  p_client_session_id text,
  p_courier text,
  p_driver_name text,
  p_picked_up_at timestamptz,
  p_tracking_numbers text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_month_key date;
  v_tracking_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if public.current_staff_role() not in ('admin', 'scanner') then
    raise exception 'Admin or scanner role required';
  end if;

  if nullif(trim(p_client_session_id), '') is null then
    raise exception 'Client session ID is required';
  end if;

  if p_courier not in ('SPX', 'J&T', 'NINJA') then
    raise exception 'Unsupported courier';
  end if;

  if nullif(trim(p_driver_name), '') is null then
    raise exception 'Driver or rider name is required';
  end if;

  if p_picked_up_at is null then
    raise exception 'Pickup date and time are required';
  end if;

  if p_tracking_numbers is null or cardinality(p_tracking_numbers) = 0 then
    raise exception 'At least one tracking number is required';
  end if;

  select count(distinct trim(x))
  into v_tracking_count
  from unnest(p_tracking_numbers) as x
  where nullif(trim(x), '') is not null;

  if v_tracking_count = 0 then
    raise exception 'No valid tracking numbers were supplied';
  end if;

  v_month_key := date_trunc(
    'month',
    p_picked_up_at at time zone 'Asia/Kuala_Lumpur'
  )::date;

  insert into public.pickup_sessions (
    client_session_id,
    courier,
    driver_name,
    picked_up_at,
    month_key,
    created_by
  )
  values (
    trim(p_client_session_id),
    p_courier,
    trim(p_driver_name),
    p_picked_up_at,
    v_month_key,
    v_user_id
  )
  on conflict (created_by, client_session_id) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select id into v_session_id
    from public.pickup_sessions
    where created_by = v_user_id
      and client_session_id = trim(p_client_session_id);

    return v_session_id;
  end if;

  insert into public.parcel_records (session_id, tracking_number)
  select
    v_session_id,
    clean_tracking
  from (
    select distinct trim(x) as clean_tracking
    from unnest(p_tracking_numbers) as x
    where nullif(trim(x), '') is not null
  ) cleaned;

  return v_session_id;
end;
$$;

revoke all on function public.commit_pickup_session(text, text, text, timestamptz, text[]) from public;
grant execute on function public.commit_pickup_session(text, text, text, timestamptz, text[]) to authenticated;

commit;

-- Verification query (run separately after this script):
-- select table_name from information_schema.tables
-- where table_schema = 'public' order by table_name;
