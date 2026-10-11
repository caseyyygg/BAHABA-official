# BAHABA

## Report retention and permanent flood history

Raw rows in `reports` are retained for 30 days. Run `php scripts/archive-reports.php`
daily. Each expired batch is locked, added to `report_monthly_summary`, and deleted
in the same transaction. Failed summary writes roll back deletion. Repeated runs
do not duplicate totals. Months use Asia/Manila (UTC+08:00).

Permanent summaries retain month, LGU location, city, barangay, severity, review
status, source, and count. They contain no descriptions, reporter identities,
precise coordinates, or source links. They are never deleted by this job.
Existing retained reports are combined with archived summaries in the admin's
Command Center history, including monthly severity counts, verified/pending
counts, calendar-month peaks, and the ten most frequently reported barangays.
Rejected reports are excluded from dashboard trends. Counts reflect reports,
not confirmed flood frequency or extent; incomplete months are still in progress.
The summary cannot reconstruct reports already deleted before this feature.

The admin Operations menu also includes **Summary & Analytics**, with location
and year filters, all report counts (including a separate rejected count), monthly
history, barangay rankings, and NLP collection totals grouped by month/platform.
NLP totals include flood/non-flood classifications, flood severity, and weighted
average classification confidence. They are separate from submitted-report
counts to avoid implying that a collected social post is another LGU report.
LGUs can view only their assigned location; platform admins can switch locations.

The local Windows task `BAHABA-ReportRetention` runs daily at 00:15 in the host's
timezone, while the current Windows user is signed in. The computer must be on.
The admin history endpoint also performs cleanup when loading trends. Schedule
the CLI job independently on deployed hosting; the Windows task does not transfer.
Only `reports` are covered by this policy; `nlp_events` and unrelated tables are
not modified. Database backups have their own retention policy.

Run `php scripts/test-report-retention.php` to test expiry, batching, reruns,
summary totals, LGU scoping, and rollback using temporary tables that shadow the
real report tables only for the test connection. Live reports are untouched.

## Map setup

`src/assets/targeted-barangay-geometry.json` uses original unsimplified NAMRIA
polygons dated 2023-11-06, extracted from
[altcoder/philippines-psgc-shapefiles](https://github.com/altcoder/philippines-psgc-shapefiles/tree/main/data/2023/BgySubMuns).
Existing PSGC IDs and all 51 Malolos barangays are preserved. The previous
0.005-degree simplified polygons cut across streets and left gaps. Both the
resident map and admin report validation now use the detailed polygons.
The source license is in `src/assets/BOUNDARY-SOURCE-LICENSE.txt`. These shapes
represent the source's 2023 snapshot, rather than later legal boundary changes.

The app uses MapLibre GL JS with OpenFreeMap's Liberty style. No map API key or Google billing setup is needed. Run npm install and npm run dev as usual. The map requires internet access and a browser with WebGL enabled.

The user's selected location sets the starting view. The resident map displays barangay borders and the same city/province border as the admin report map. `src/assets/lgu-boundaries.json` contains the five supported LGUs extracted from the same source's 2023 Municities and Provdists datasets. Keep it identical to the admin's `map-data/lgu-boundaries.json` when updating boundaries.

Flood posts mentioning a matched barangay in their text highlight that barangay's border with a light fill. A verified landmark uses its exact mapped dot instead. City-only and hashtag-only mentions do not create highlights. Highlights identify the reported location, not a verified flood extent, and expire 24 hours after receipt unless a newer matching post keeps the location active. Run `node scripts/test-flood-locations.mjs` to verify these rules. The barangay list and Locate buttons still focus the map. Map attribution remains visible above navigation.

Setup guide: https://openfreemap.org/quick_start/

## Real authentication setup

Authentication uses the PHP API in `api/` and MySQL. Signup accepts only `@gmail.com` addresses, hashes passwords on the server, and sends a 24-hour activation link through Gmail SMTP.

1. Install and start MySQL/MariaDB, then import `api/schema.sql` into your database (for example, use MySQL Workbench or phpMyAdmin).
2. Install PHP with the PDO MySQL extension. Copy `api/config.example.php` to `api/config.php` and set its database credentials.
3. From `bahaba-app`, run `php api/seed-test-accounts.php`. It creates or updates 10 verified regular-user accounts, hashes their shared test password, and assigns their configured locations. This is for local testing only; do not run it against a production database.
4. Start the PHP API from `bahaba-app` with `php -S localhost:8000`.
5. In a second terminal, start the React app with `npm run dev`.

The default frontend/API URLs are `http://localhost:5173` and `http://localhost:8000/api`. Change `VITE_API_URL` if the API runs elsewhere.

Do not commit `api/config.php`; it is already ignored because it contains SMTP credentials.

The schema includes `admin_users` because the regular login API checks it to distinguish reserved admin addresses. The supplied LGU test accounts are regular app accounts, not admin-role accounts.
Install the mail dependency with `composer install --working-dir=api` only if you also want to use signup and email verification.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

### Flood landmark markers

Social posts create map dots only when a specific named place matches the local verified landmark index. City/barangay-only mentions and hashtag-only locations are skipped on the map. Duplicate branches or road sections are treated as ambiguous rather than assigned invented coordinates. These rules apply to future collected posts automatically. Explicit LGU area reports retain their selected barangay polygons.

The current verified index contains Anilao Barangay Hall. Broader OSM downloads encountered upstream errors during setup, so other places remain skipped until an index refresh succeeds. Run `python scripts/refresh-flood-landmarks.py` from this directory to refresh all five supported areas. The script validates OSM administrative boundaries, preserves the existing index on failure, and sends no post text or login credentials. Curated corrections belong in `src/assets/flood-landmark-overrides.json`. Map data is © OpenStreetMap contributors under ODbL; source links are retained with the markers.

Markers have an expanding outer ring, with a static halo for users who request reduced motion. Marker locations represent mapped landmarks or streets; they do not establish the precise extent of flooding.

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
