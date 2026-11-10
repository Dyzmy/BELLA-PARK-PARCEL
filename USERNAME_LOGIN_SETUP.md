# BELLA PARK — Username Login Setup

## 1. Apply the database migration
Run `database/username_login_migration.sql` in the Supabase SQL Editor.

## 2. Deploy the Edge Function
Deploy `supabase/functions/login-by-username/index.ts` as a function named `login-by-username`.

Set Edge Function secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Keep the service-role secret server-side. Never put it in website JavaScript, HTML, or GitHub.

## 3. Create the two Auth users
In Supabase Dashboard → Authentication → Users → Add user, create:
- `admin@internal.bellapark.invalid` with temporary password `Admin321`
- `eddy@internal.bellapark.invalid` with temporary password `Eddy321`

These are internal identities and cannot receive email. They are not recovery addresses. The account owner must add a real, accessible recovery email in the profile popup. Mark the initial internal identities as confirmed if the project requires email confirmation.

## 4. Link the Auth UUIDs
Copy each user's UUID from Authentication → Users, then run this SQL after replacing the UUID placeholders:

```sql
insert into public.staff_profiles (user_id, display_name, role, username)
values ('ADMIN_AUTH_UUID', 'BELLA PARK ADMIN', 'admin', 'Admin')
on conflict (user_id) do update
set display_name = excluded.display_name, role = 'admin', username = 'Admin';

insert into public.staff_profiles (user_id, display_name, role, username)
values ('EDDY_AUTH_UUID', 'EDDY', 'admin', 'Eddy')
on conflict (user_id) do update
set display_name = excluded.display_name, role = 'admin', username = 'Eddy';
```

## 5. Verify
Test both usernames on the website. The existing `dyzmy88@gmail.com` admin account is preserved. Username login resolves the current Auth email through the stable profile UUID, so changing the recovery email does not change the username.

Creating Auth users and deploying Edge Functions still require project-owner actions in Supabase; the website repository cannot perform those privileged operations.
