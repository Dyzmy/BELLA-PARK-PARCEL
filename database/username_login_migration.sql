-- BELLA PARK username login support
-- Run in Supabase SQL Editor after the existing schema and v1 setup.
begin;

alter table public.staff_profiles
  add column if not exists username text;

create unique index if not exists staff_profiles_username_lower_uidx
  on public.staff_profiles (lower(username))
  where username is not null;

comment on column public.staff_profiles.username is
  'Stable login alias. Passwords are managed only by Supabase Auth.';

commit;

-- After creating the two Auth users in Supabase Dashboard, link their Auth UUIDs:
-- update public.staff_profiles set username = 'Admin', display_name = 'BELLA PARK ADMIN', role = 'admin'
-- where user_id = '<AUTH-USER-UUID>';
-- update public.staff_profiles set username = 'Eddy', display_name = 'EDDY', role = 'admin'
-- where user_id = '<AUTH-USER-UUID>';
