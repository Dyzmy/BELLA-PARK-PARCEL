# BELLA PARK — Parcel Management System

BELLA PARK is a responsive parcel pickup dashboard hosted on Firebase Hosting. The dashboard authenticates staff with Supabase Auth and reads pickup sessions, parcel records and parcel operation statuses from Supabase.

## Live website
- Firebase Hosting: https://bella-park.web.app
- Previous GitHub Pages address: https://dyzmy.github.io/BELLA-PARK-PARCEL/

## Current website features
- Staff login and logout through Supabase Auth.
- Role-aware dashboard for admin, scanner and viewer accounts.
- Admin rider account management (create, list and activate/deactivate scanner accounts).
- Pickup history grouped by rider, month, date and courier.
- Parcel tracking detail view; full tracking is restricted to authorized admin/scanner roles while viewer records are masked.
- Search, courier filter and CSV export.
- Admin review actions (RIGHT / PANGKAH) with the original pickup rows retained.
- Malaysia local date and time display.

## Important boundaries
- The website is the management dashboard; parcel scanning and batch submission are performed by the separate Android scanner application.
- A successful Firebase deployment confirms that the static website files were published. It does not by itself prove that every Supabase migration, Edge Function, account role or Android scanner workflow is configured.
- The Supabase database remains the source of truth. Do not place service-role keys or other server secrets in website files or this repository.
- The website does not delete original pickup sessions or parcel records. Administrative parcel cancellation/review is handled through protected database functions.

## Backend setup checklist
The Supabase project must have the schema and migrations required by the current application. Review and apply the SQL scripts in database/ in the intended order for the existing project; do not blindly rerun migrations or reset the database. In particular, verify the staff profile role/active fields, username login support, parcel operation functions and scanner batch RPC before enabling all workflows.

Supabase Edge Functions are deployed by GitHub Actions when files under supabase/functions/ change. The repository secret SUPABASE_ACCESS_TOKEN must be configured in GitHub Actions. Supabase project secrets such as SUPABASE_SERVICE_ROLE_KEY remain in Supabase and must never be committed.

## Deployment
Firebase Hosting is deployed by the GitHub Actions workflow .github/workflows/deploy-firebase-hosting.yml. It uses the GitHub Actions secret FIREBASE_SERVICE_ACCOUNT_BELLA_PARK.

Supabase Edge Functions are deployed by .github/workflows/deploy-login-function.yml. Check the Actions run result after each backend change.

## Verification before production use
1. Sign in with an authorized staff account.
2. Confirm the dashboard loads live records from Supabase (not placeholder counts).
3. Test a small, clearly identified parcel batch from the Android scanner.
4. Confirm the batch appears once in the dashboard and retry protection prevents duplicates.
5. Verify rider accounts see only their own records and admins see the intended management view.
6. Verify RIGHT / PANGKAH and DONE status changes, while preserving original pickup history.