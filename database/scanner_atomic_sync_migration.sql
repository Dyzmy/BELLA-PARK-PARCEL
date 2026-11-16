-- BELLA PARK SCANNER: global duplicate protection and atomic batch sync.
-- Intentionally stops if historical duplicate tracking values exist.

begin;

do $$
declare duplicate_groups integer;
begin
  select count(*) into duplicate_groups
  from (
    select upper(regexp_replace(btrim(tracking_number), '[[:space:]]+', '', 'g')) as normalized
    from public.parcel_records
    group by upper(regexp_replace(btrim(tracking_number), '[[:space:]]+', '', 'g'))
    having count(*) > 1
  ) d;

  if duplicate_groups > 0 then
    raise exception
      'Migration stopped: % duplicated tracking-number groups already exist. Review them first; no historical records were changed.',
      duplicate_groups;
  end if;
end $$;

create unique index if not exists parcel_records_tracking_global_uidx
  on public.parcel_records (
    upper(regexp_replace(btrim(tracking_number), '[[:space:]]+', '', 'g'))
  );

drop policy if exists "Staff can read pickup sessions" on public.pickup_sessions;
create policy "Staff can read pickup sessions"
  on public.pickup_sessions for select to authenticated
  using (
    public.current_staff_active()
    and (public.current_staff_role() = 'admin' or created_by = auth.uid())
  );

drop policy if exists "Staff can read parcel records" on public.parcel_records;
create policy "Staff can read parcel records"
  on public.parcel_records for select to authenticated
  using (
    public.current_staff_active()
    and (
      public.current_staff_role() = 'admin'
      or exists (
        select 1 from public.pickup_sessions s
        where s.id = parcel_records.session_id and s.created_by = auth.uid()
      )
    )
  );

create or replace function public.scanner_commit_batch(
  p_client_session_id text,
  p_courier text,
  p_driver_name text,
  p_picked_up_at timestamptz,
  p_tracking_numbers text[]
)
returns table(session_id uuid, inserted_count integer, duplicate_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_active boolean;
  v_profile_courier text;
  v_profile_name text;
  v_session_id uuid;
  v_inserted integer := 0;
  v_requested integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select p.role, p.is_active, p.courier, p.display_name
    into v_role, v_active, v_profile_courier, v_profile_name
  from public.staff_profiles p where p.user_id = v_uid;

  if not found or not coalesce(v_active, false) then
    raise exception 'Staff account is inactive or unavailable';
  end if;
  if v_role not in ('admin', 'scanner') then
    raise exception 'This account is not allowed to submit parcel batches';
  end if;
  if p_client_session_id is null or length(trim(p_client_session_id)) < 16
     or length(p_client_session_id) > 100 then
    raise exception 'Invalid client session id';
  end if;
  if p_courier not in ('SPX', 'J&T', 'NINJA') then
    raise exception 'Unsupported courier';
  end if;
  if p_driver_name is null or length(trim(p_driver_name)) = 0 then
    raise exception 'Rider name is required';
  end if;
  if p_picked_up_at is null then raise exception 'Scan date is required'; end if;
  if v_role <> 'admin' and
     (v_profile_courier is distinct from p_courier
      or v_profile_name is distinct from p_driver_name) then
    raise exception 'Courier or rider identity does not match the signed-in profile';
  end if;

  select coalesce(array_agg(t.tracking), array[]::text[])
    into p_tracking_numbers
  from (
    select distinct upper(regexp_replace(btrim(u.value), '[[:space:]]+', '', 'g')) as tracking
    from unnest(coalesce(p_tracking_numbers, array[]::text[])) as u(value)
    where u.value is not null and length(btrim(u.value)) > 0
  ) t;

  v_requested := coalesce(array_length(p_tracking_numbers, 1), 0);
  if v_requested = 0 then raise exception 'No valid parcel tracking numbers were supplied'; end if;

  insert into public.pickup_sessions (
    client_session_id, courier, driver_name, picked_up_at, month_key, created_by
  )
  values (
    p_client_session_id, p_courier, p_driver_name, p_picked_up_at,
    date_trunc('month', p_picked_up_at)::date, v_uid
  )
  on conflict (created_by, client_session_id) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select s.id into v_session_id from public.pickup_sessions s
    where s.created_by = v_uid and s.client_session_id = p_client_session_id;
    if not found then raise exception 'Could not resolve existing scanner session'; end if;
    if exists (
      select 1 from public.pickup_sessions s
      where s.id = v_session_id
        and (s.courier <> p_courier or s.driver_name <> p_driver_name
             or s.picked_up_at <> p_picked_up_at)
    ) then raise exception 'Session id was reused with different batch details'; end if;
  end if;

  insert into public.parcel_records (session_id, tracking_number)
  select v_session_id, n.value
  from unnest(p_tracking_numbers) as n(value)
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  return query select v_session_id, v_inserted, (v_requested - v_inserted);
end;
$$;

revoke all on function public.scanner_commit_batch(text, text, text, timestamptz, text[]) from public;
grant execute on function public.scanner_commit_batch(text, text, text, timestamptz, text[]) to authenticated;

commit;
