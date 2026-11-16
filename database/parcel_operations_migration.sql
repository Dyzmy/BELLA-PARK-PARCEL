-- BELLA PARK parcel operations: delivery state, admin review, cancellation and audit.
-- Original pickup/parcel rows remain immutable. "Delete" in admin UI is a soft-cancel
-- operation so the history remains visible as "Dibatalkan Oleh Admin".

begin;

create table if not exists public.parcel_operations (
  parcel_id uuid primary key references public.parcel_records(id) on delete cascade,
  delivery_status text not null default 'pickup'
    check (delivery_status in ('pickup','done','cancelled')),
  review_status text not null default 'right'
    check (review_status in ('right','pangkah')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id)
);

create table if not exists public.parcel_operation_audit (
  id bigint generated always as identity primary key,
  parcel_id uuid not null references public.parcel_records(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('right','pangkah','cancelled','done')),
  previous_delivery_status text,
  new_delivery_status text,
  previous_review_status text,
  new_review_status text,
  created_at timestamptz not null default now()
);

alter table public.parcel_operations enable row level security;
alter table public.parcel_operation_audit enable row level security;

drop policy if exists "Staff read parcel operations" on public.parcel_operations;
create policy "Staff read parcel operations" on public.parcel_operations
for select to authenticated using (
  public.current_staff_active()
  and (
    public.current_staff_role() = 'admin'
    or exists (
      select 1 from public.parcel_records pr
      join public.pickup_sessions ps on ps.id = pr.session_id
      where pr.id = parcel_operations.parcel_id and ps.created_by = auth.uid()
    )
  )
);

drop policy if exists "Staff read parcel operation audit" on public.parcel_operation_audit;
create policy "Staff read parcel operation audit" on public.parcel_operation_audit
for select to authenticated using (
  public.current_staff_active()
  and (
    public.current_staff_role() = 'admin'
    or exists (
      select 1 from public.parcel_records pr
      join public.pickup_sessions ps on ps.id = pr.session_id
      where pr.id = parcel_operation_audit.parcel_id and ps.created_by = auth.uid()
    )
  )
);

revoke all on public.parcel_operations from anon, authenticated;
revoke all on public.parcel_operation_audit from anon, authenticated;
grant select on public.parcel_operations, public.parcel_operation_audit to authenticated;

create or replace function public.ensure_parcel_operation()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.parcel_operations(parcel_id)
  values (new.id)
  on conflict (parcel_id) do nothing;
  return new;
end;
$$;

drop trigger if exists parcel_operation_after_insert on public.parcel_records;
create trigger parcel_operation_after_insert
after insert on public.parcel_records
for each row execute function public.ensure_parcel_operation();

insert into public.parcel_operations(parcel_id)
select id from public.parcel_records
on conflict (parcel_id) do nothing;

create or replace function public.admin_set_parcel_review(
  p_parcel_id uuid,
  p_review_status text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_old_review text;
  v_delivery text;
begin
  if auth.uid() is null or public.current_staff_role() <> 'admin'
     or not public.current_staff_active() then
    raise exception 'Admin access required';
  end if;
  if p_review_status not in ('right','pangkah') then
    raise exception 'Invalid review status';
  end if;

  insert into public.parcel_operations(parcel_id)
  values (p_parcel_id) on conflict (parcel_id) do nothing;

  select review_status, delivery_status into v_old_review, v_delivery
  from public.parcel_operations where parcel_id = p_parcel_id for update;
  if not found then raise exception 'Parcel not found'; end if;

  update public.parcel_operations
  set review_status = p_review_status, updated_at = now(), updated_by = auth.uid()
  where parcel_id = p_parcel_id;

  insert into public.parcel_operation_audit(
    parcel_id, actor_id, action, previous_delivery_status, new_delivery_status,
    previous_review_status, new_review_status
  ) values (
    p_parcel_id, auth.uid(), p_review_status, v_delivery, v_delivery,
    v_old_review, p_review_status
  );
end;
$$;

create or replace function public.admin_cancel_parcel(p_parcel_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_old_delivery text;
  v_old_review text;
begin
  if auth.uid() is null or public.current_staff_role() <> 'admin'
     or not public.current_staff_active() then
    raise exception 'Admin access required';
  end if;

  insert into public.parcel_operations(parcel_id)
  values (p_parcel_id) on conflict (parcel_id) do nothing;

  select delivery_status, review_status into v_old_delivery, v_old_review
  from public.parcel_operations where parcel_id = p_parcel_id for update;
  if not found then raise exception 'Parcel not found'; end if;

  update public.parcel_operations
  set delivery_status = 'cancelled', cancelled_at = now(),
      cancelled_by = auth.uid(), updated_at = now(), updated_by = auth.uid()
  where parcel_id = p_parcel_id;

  insert into public.parcel_operation_audit(
    parcel_id, actor_id, action, previous_delivery_status, new_delivery_status,
    previous_review_status, new_review_status
  ) values (
    p_parcel_id, auth.uid(), 'cancelled', v_old_delivery, 'cancelled',
    v_old_review, v_old_review
  );
end;
$$;

create or replace function public.rider_mark_parcels_done(p_parcel_ids uuid[])
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
  v_id uuid;
  v_old_delivery text;
  v_review text;
begin
  if v_uid is null or not public.current_staff_active()
     or public.current_staff_role() not in ('scanner','admin') then
    raise exception 'Active rider access required';
  end if;
  if coalesce(array_length(p_parcel_ids,1),0) = 0 then
    raise exception 'No parcel selected';
  end if;

  for v_id in select distinct unnest(p_parcel_ids) loop
    if not exists (
      select 1 from public.parcel_records pr
      join public.pickup_sessions ps on ps.id = pr.session_id
      where pr.id = v_id and (ps.created_by = v_uid or public.current_staff_role() = 'admin')
    ) then
      raise exception 'Parcel not found or not owned by this rider';
    end if;

    insert into public.parcel_operations(parcel_id)
    values (v_id) on conflict (parcel_id) do nothing;

    select delivery_status, review_status into v_old_delivery, v_review
    from public.parcel_operations where parcel_id = v_id for update;

    if v_old_delivery <> 'cancelled' and v_old_delivery <> 'done' then
      update public.parcel_operations
      set delivery_status = 'done', updated_at = now(), updated_by = v_uid
      where parcel_id = v_id;

      insert into public.parcel_operation_audit(
        parcel_id, actor_id, action, previous_delivery_status, new_delivery_status,
        previous_review_status, new_review_status
      ) values (v_id, v_uid, 'done', v_old_delivery, 'done', v_review, v_review);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.admin_set_parcel_review(uuid,text) from public;
revoke all on function public.admin_cancel_parcel(uuid) from public;
revoke all on function public.rider_mark_parcels_done(uuid[]) from public;
grant execute on function public.admin_set_parcel_review(uuid,text) to authenticated;
grant execute on function public.admin_cancel_parcel(uuid) to authenticated;
grant execute on function public.rider_mark_parcels_done(uuid[]) to authenticated;

commit;
