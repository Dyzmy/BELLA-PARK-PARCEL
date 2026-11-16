-- BELLA PARK: managed rider accounts for SPX, J&T and NINJA only.
begin;
alter table public.staff_profiles
  add column if not exists phone text,
  add column if not exists courier text,
  add column if not exists is_active boolean not null default true;
alter table public.staff_profiles drop constraint if exists staff_profiles_courier_check;
alter table public.staff_profiles add constraint staff_profiles_courier_check
  check (courier is null or courier in ('SPX', 'J&T', 'NINJA'));
alter table public.pickup_sessions drop constraint if exists pickup_sessions_courier_check;
alter table public.pickup_sessions add constraint pickup_sessions_courier_check
  check (courier in ('SPX', 'J&T', 'NINJA'));
create index if not exists staff_profiles_role_courier_idx
  on public.staff_profiles (role, courier, display_name);
create or replace function public.current_staff_active()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_active from public.staff_profiles where user_id = auth.uid()), false) $$;
revoke all on function public.current_staff_active() from public;
grant execute on function public.current_staff_active() to authenticated;
drop policy if exists "Staff can read own profile" on public.staff_profiles;
create policy "Staff can read own profile" on public.staff_profiles for select to authenticated
  using (user_id = auth.uid() or public.current_staff_role() = 'admin');
drop policy if exists "Staff can read pickup sessions" on public.pickup_sessions;
create policy "Staff can read pickup sessions" on public.pickup_sessions for select to authenticated
  using (public.current_staff_active() and public.current_staff_role() in ('admin','scanner','viewer'));
drop policy if exists "Scanners and admins can add pickup sessions" on public.pickup_sessions;
create policy "Scanners and admins can add pickup sessions" on public.pickup_sessions for insert to authenticated
  with check (
    public.current_staff_active() and created_by = auth.uid()
    and public.current_staff_role() in ('admin','scanner')
    and (public.current_staff_role() = 'admin' or exists (
      select 1 from public.staff_profiles p where p.user_id = auth.uid()
      and p.role = 'scanner' and p.courier = pickup_sessions.courier
      and p.display_name = pickup_sessions.driver_name
    ))
  );
drop policy if exists "Staff can read parcel records" on public.parcel_records;
create policy "Staff can read parcel records" on public.parcel_records for select to authenticated
  using (public.current_staff_active() and public.current_staff_role() in ('admin','scanner','viewer'));
drop policy if exists "Scanners and admins can add parcel records" on public.parcel_records;
create policy "Scanners and admins can add parcel records" on public.parcel_records for insert to authenticated
  with check (
    public.current_staff_active() and public.current_staff_role() in ('admin','scanner')
    and exists (select 1 from public.pickup_sessions s where s.id = session_id and s.created_by = auth.uid())
  );
commit;
