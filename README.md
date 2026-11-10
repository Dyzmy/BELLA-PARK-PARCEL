# BELLA PARK — Parcel Management System

Premium gold-and-navy dashboard prototype for Bella Park pickup records.

## Current preview
- Responsive dashboard for mobile and desktop.
- Summary totals by courier.
- Pickup record table with date, time, total, courier and driver/rider.
- Click a TOTAL value to open its tracking-number list.
- Search, courier filter and CSV export.
- Website interface is read-only (no edit/delete controls).

## Important: prototype data
The records currently shown in `assets/js/dashboard.js` are clearly marked demo data. They are not real pickup records and are not connected to a live database yet.

## Next development phase
1. Add a secure online database and authenticated write endpoint for the scanner app.
2. Store offline pickup sessions on the Android device until internet is available.
3. Sync each saved session using a unique session ID to prevent duplicate submissions.
4. Keep the public website read-only; enforce this with database/API permissions, not just by hiding buttons.

## Publish with GitHub Pages
Repository Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save.
