-- BELLA PARK: private rider dashboard access.
-- Admins can read all pickup sessions and parcel records.
-- Non-admin staff can read only sessions created by their own login UID,
-- and parcel records attached to those sessions.
begin;

drop policy if exists "Staff can read pickup sessions" on public.pickup_sessions;
drop policy if exists "Active staff read own pickup sessions or admin reads all" on public.pickup_sessions;
create policy "Active staff read own pickup sessions or admin reads all"
  on public.pickup_sessions
  for select
  to authenticated
  using (
    public.current_staff_active()
    and (
      public.current_staff_role() = 'admin'
      or (
        public.current_staff_role() in ('scanner', 'viewer')
        and created_by = auth.uid()
      )
    )
  );

drop policy if exists "Staff can read parcel records" on public.parcel_records;
drop policy if exists "Active staff read own parcel records or admin reads all" on public.parcel_records;
create policy "Active staff read own parcel records or admin reads all"
  on public.parcel_records
  for select
  to authenticated
  using (
    public.current_staff_active()
    and (
      public.current_staff_role() = 'admin'
      or (
        public.current_staff_role() in ('scanner', 'viewer')
        and exists (
          select 1
          from public.pickup_sessions s
          where s.id = parcel_records.session_id
            and s.created_by = auth.uid()
        )
      )
    )
  );

commit;
