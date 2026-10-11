Nationwide PSGC rollout — 11 October 2026

## 2026-10-12: signup-only location onboarding and private transfer bundle

- Returning login and restored sessions now enter the map directly. Account activation still opens first-time location setup when needed. Existing saved preferences remain server-side and can be edited in Settings; signing in no longer requires redoing a newer three-location onboarding step on legacy accounts.
- Created `BAHABA-Transfer-2026-10-12.local` with the resident source, actual served admin source, a current-data SQL backup, optional collector sources, a Windows launcher and installation instructions. The admin shared API path is relative to the bundle. Original database/SMTP/platform credentials, browser sessions and dependency caches are excluded; the SQL contains the requested current records and password hashes and must be shared privately. Root ignore rules exclude the folder and ZIP from Git.
- Export timestamps use Asia/Manila. The exporter accepts a destination directory and normalizes MySQL 8's 0900 collation to utf8mb4_unicode_ci for XAMPP/MariaDB compatibility. Restored the backup into a separate validation database and tested existing resident/admin login, report/profile loading, local notification-trigger setup, team listing and Excel export.
- Resident build/lint and browser preference regression checks pass, including immediate map entry for returning login, explicit settings edits and saved preferences on reload.

## 2026-10-12: resident login on restricted managed databases

- Managed MySQL refused notification-trigger creation with error 1419. That optional setup previously aborted bootstrap and emitted an HTML fatal error, preventing resident login.
- Core PSGC migration now completes when trigger installation encounters a recognized privilege denial (1419/1227/1142). Trigger installation is separately retried and checked by the notification endpoint, with an advisory lock to serialize setup. Other migration failures still fail the request. No global database settings or account privileges were changed.
- Notifications return an explicit JSON 503 until capture triggers can be installed, rather than claiming live delivery works. Core account/profile/map access remains available. The API exception handler returns JSON instead of exposing an HTML stack trace.
- Actual localhost:5173 checks passed: seeded resident login 200, profile 200, map reports 200, invalid login JSON 401, and notifications JSON 503 explaining the missing privilege. Standard PSGC API regression checks cover the fully privileged database path, including trigger-captured report/advisory events.

## 2026-10-12: actual served checkout corrected; team deployments added

- The local PHP process serves `C:/Users/Jakes/Downloads/BAHABA-ADMIN` at `http://localhost:8001`, rather than `preview.local/full-admin`. Earlier changes had only reached the workspace preview. The prepared update was applied to the served checkout with its original files backed up under `live-admin-backup.local`; private configuration and existing records were preserved. Asset versions were updated to invalidate old browser scripts.
- The served report manager now excludes rejected reports, removes status controls, and allows Reports editors to delete within their existing geographic assignment. The Excel collection-history/export panel appears near the top of Summary & Analytics.
- Evacuees now includes team deployments: barangay, team name, personnel, optional contact, and deployed/standby/withdrawn status. Editors can create, edit and delete within their assigned area; viewers cannot mutate. Server checks include geographic and barangay assignments, supported barangay names, CSRF, input limits and transaction-held row locks. Changes are recorded in `team_deployment_audit`. Command Center team counts use deployed records. No teams are invented when none have been recorded.
- Broken province label separators are also formatted in evacuation selectors and the scope banner without altering stored identifiers. Apply source updates with `update-team-deployments.mjs`; Cloudflare packaging includes the handler, client script and validation directory.
- Disposable integration checks passed for team CRUD, invalid personnel/unknown barangay rejection, CSRF rejection, cross-location denial, editor report deletion and Excel export. Read-only verification against actual localhost:8001 passed: seeded LGU login, `can_delete=true`, no rejected rows, team form, clean labels, clickable Delete confirmation (cancelled), visible Excel button and workbook download. No real report or team records were edited or deleted during live verification.

## 2026-10-12: searchable Barangay Status with ten-row pages

- Command Center Barangay Status now shows ten rows per page, with Previous/Next, a page count, and accent-insensitive search across barangay and municipality names. Search resets to page one; changing account/location scope clears the search. Command Center totals still cover the full authorized scope.
- Imported province labels contain a literal ` ? ` separator. Display uses a comma, e.g. `Abangan Norte, Marilao`, while retaining existing stored identifiers and assignments. No data or permissions are rewritten.
- Apply with `node bahaba-app/scripts/update-barangay-status.mjs path/to/full-admin`. Local full-admin updated and Cloudflare packaging includes the script.
- Browser smoke checks pass: ten-row limit, next/previous, exact barangay search, municipality search, empty results, clean labels and single assigned-barangay scope. JavaScript syntax checks pass. Preview: `preview.local/barangay-status-pagination.png`.

## 2026-10-12: 24-hour collector feed, monthly/yearly history and Excel

- The LGU social feed loads every page of a frozen 24-hour collection window instead of silently stopping at 100 rows. The platform feed also excludes older collected posts.
- After 24 hours, collected posts are available in Summary & Analytics. Source rows remain stored; summary queries count each stored event once without a destructive move or a second copy. Existing source/post-ID ingestion deduplication remains in place.
- Collection history defaults to the latest 12 calendar months and supports a selected calendar year. Monthly and yearly tables group by barangay, distinguish flood/non-flood classifications and show flood severity. Collection months use Asia/Manila; they describe when data was collected, not a confirmed flood occurrence date. Current live-feed posts are excluded until 24 hours old. Previously missing or deleted collector data cannot be recovered by this change.
- Download Excel creates a real `.xlsx` workbook with Read me, Monthly, Yearly and Source detail sheets. Strings are encoded as text, not spreadsheet formulas. PHP ZIP is required. Export and summary APIs enforce Reports view access, LGU location and assigned barangay scope. Downloads are private and never automatically published externally.
- Apply with `node bahaba-app/scripts/update-collected-history.mjs path/to/full-admin`. Cloudflare packaging includes the new server helper, API handler and client script. Local full-admin preview updated; production was not deployed.
- Validation: disposable MySQL/API/browser test passed for 205 live records across three pages, 24-hour separation, three historical records over two months/barangays, exclusion outside the latest year window, monthly/yearly totals, cross-location denials, invalid year rejection, valid four-sheet XLSX XML, and browser download. Resident lint/build and PHP/JavaScript syntax checks pass.

## 2026-10-12: trusted social publishers and report management

- Report management excludes rejected records and removes the status column/filter. Reports editors can delete within their existing location/barangay scope, with CSRF, confirmation and audit preserved; view-only accounts cannot delete.
- Authenticated NLP ingestion accepts `publisher_id` from the collector. Exact platform/account entries in private `trusted_social_publishers` configuration, with type `news` or `government`, create verified barangay reports immediately, bypassing the 20-post threshold and cooldown. Flood classification and unambiguous mapped barangay are still required. Publisher display names and caller-supplied type labels never grant trust. Retries do not recreate deleted/hidden reports. The allowlist defaults empty: configure verified IDs and update the collector before this bypass is active.
- Apply versioned sources to the full admin checkout with `node bahaba-app/scripts/update-report-workflow.mjs path/to/admin`. Applied locally to `preview.local/full-admin`; no production deployment performed.
- Syntax checks, resident lint and build pass. Database/browser regressions could not run because the MySQL fixture service on port 33317 is unavailable. Added trusted-account/impersonation/retry/non-flood coverage and adjusted deletion coverage for scoped editors.

This implementation is not ready to claim complete, current nationwide coverage.
The bundled catalogue is a **provisional PSGC mirror**, containing 1,634 cities and
municipalities. The latest official PSA release available on its website is
30 June 2026. Its workbook download returned a browser challenge through both
HTTP clients and a normal browser session. The mirror has not been reconciled
against that workbook; newer municipalities, regions and renamed places may be
missing or outdated. The selection screen explicitly marks the catalogue provisional.

Official source: https://psa.gov.ph/classification/psgc
Official workbook: https://psa.gov.ph/system/files/scd/PSGC-2Q-2026-Publication-Datafile.xlsx
Official API documentation: https://psa.gov.ph/classifications-api/psgc
The official API requires a PSA access token; no token was available or invented.

Implemented behavior

- Login/session restoration routes accounts with fewer than three valid PSGC
  preferences to a searchable selection screen. Settings edits the same list;
  the API rejects fewer than three distinct municipalities and unknown codes.
- Preferences are stored on the server as 10-digit PSGC strings, separate from
  legacy selected_location and ephemeral GPS state. Map searches never write
  account preferences. Returning accounts with complete preferences enter the map.
- The resident map reads only verified reports through an authenticated,
  paginated nationwide endpoint. It uses viewport queries and MapLibre
  clustering, capped at 500 reports per page with an explicit load-more control.
  Turn off “Limit reports to visible map” to browse all available nationwide
  records, including reports without coordinates. Municipality searches also
  list reports without coordinates. Raw NLP, pending/rejected reports, draft
  advisories, reporter identity, admin accounts and audit data are not exposed.
- Notifications include verified reports and published advisories for the union
  of current municipality and preferred municipalities. One event per source
  record prevents overlap duplicates. Flood settings affect flood events; browser
  settings and permissions control browser notifications. In-app advisories remain
  available. Browser permission denial never prevents access.
- Database triggers capture report verification and advisory publication,
  including writes from another connected API. A transaction-held clock row
  serializes event creation so cursor order follows commit order. First login
  polling establishes a baseline. Preference saves also establish a server-side
  event watermark, protecting other devices with older polling cursors.
  Subsequent polling uses 200-event pages; browsing an unrelated location does
  not alter notification scope. Updates to an already-notified record do not
  constitute a new record and do not generate another event.
- GPS uses watchPosition with permission. Coordinates are matched by polygon
  containment, never a nearest-city or fuzzy name match. Unknown, overlapping,
  failed or near-boundary results return no current municipality and leave
  saved preferences active. Coordinates are not saved as preferences.

Migration and compatibility

`api/psgc.php` runs an idempotent additive migration, guarded by a database
advisory lock and versioned by the catalogue checksum. Existing tables, records,
legacy location IDs and administrator assignments are retained. Only these
legacy mappings are explicit:

| Legacy ID | PSGC | Municipality |
| --- | --- | --- |
| navotas | 1380900000 | City of Navotas |
| marikina | 1380700000 | City of Marikina |
| malolos | 0301410000 | City of Malolos |
| bulacan | unmapped | Province-wide legacy scope; needs review |
| pampanga | unmapped | Province-wide legacy scope; needs review |

The migration seeds a known legacy preference as one preference, requiring its
owner to choose two additional locations. It does not invent three preferences.
`location_mapping_review` records unresolved accounts, reports, announcements,
NLP records and admin assignments. Province-wide admin scopes remain intact.
Unmapped NLP content never receives a municipality merely from a name match.
Existing province-level reports with verified coordinates can still appear on
the nationwide map, but are excluded from municipality notifications until reviewed.

Back up the database before rollout. The deployment DB user needs CREATE, ALTER,
INDEX and TRIGGER privileges for the migration, in addition to normal data access.
Run the migration during a maintenance window before enabling admin writes.
The triggers require reports.psgc_id/location_id and announcements.psgc_id/location_id
to be assigned correctly by the admin API. Resolved mappings must use a catalogue
ID and preserve the writer's existing server-side geographic authorization.
Do not treat a resident's requested/current PSGC ID as authority to write admin data.
Do not drop the additive columns/tables during a frontend rollback.

Administrative checkout limitation

`C:/Users/Jakes/BAHABA-ADMIN` was inspected before implementation. It contains
App.js, index.html and style.css, with sample accounts/data and client-side ACLs.
It does **not** contain the api.php, nlp-location.php, report-point.php, map-data
or map-vendor files referenced by the hosting preparer. Its pending LGU
registration now searches the PSGC catalogue and stores assigned_psgc_id without
changing existing active account scopes or ACLs. This is a prototype request
control, not a verified production permission system. Production assignment
approval, report/advisory write validation, ingestion and authorization need
the real administrative backend before this task can be considered complete.
The hosting preparer must not be used to claim a complete release from this checkout.

Coverage and delivery limits

- Catalogue availability does not mean any LGU supplies reports or advisories.
  No reports available never confirms that a place is free of flooding.
- The PSA/NAMRIA 6 November 2023 boundary snapshot matches 1,597 provisional
  catalogue entries. Other municipalities have no matched geometry. New or
  changed municipal boundaries need a current reviewed boundary source.
- Source geometry is simplified at 0.0002 degrees. GPS detection rejects points
  within 50 metres plus the device-reported accuracy of every boundary ring;
  this deliberately trades some detection coverage for conservative matching.
  The older snapshot cannot certify post-2023 boundary changes.
- Reports without trustworthy coordinates appear as location details, without
  invented pins. Unreviewed NLP is not published as a resident flood report.
- Notifications are polled every five seconds while the resident page is running.
  The service worker displays notifications requested by that page. There is no
  Push API subscription, server push delivery or verified delivery after the app
  is closed. Hidden tabs may be throttled; offline pages cannot receive new events.
  Login intentionally baselines existing records rather than replaying closed-app
  history. Alerts/Command summaries remain bounded, while map browsing is paginated.
- Legacy Command Center contact panels continue to use the account's legacy
  selected_location; the change does not synthesize contacts for all municipalities.

Refresh official data before release

1. Obtain the official PSA workbook through its download page or authorized API.
2. From bahaba-app run:
   `py scripts/import-psgc.py path/to/PSGC-2Q-2026-Publication-Datafile.xlsx 2026-Q2`
   The standard-library importer preserves explicit PSGC and correspondence codes,
   checks completeness/uniqueness, and records the source checksum. It is included
   for the refresh but could not be validated against the inaccessible real workbook.
3. Review municipality hierarchy and official changes, including new municipalities,
   region reorganizations and retired IDs. The migration retains old rows rather
   than silently deleting assignments. Manually reconcile retired preferences and
   location_mapping_review entries. Rebuild reviewed boundaries where needed.
4. Run `node scripts/update-admin-psgc.mjs C:/Users/Jakes/BAHABA-ADMIN` to copy the
   refreshed catalogue into admin registration. Deploy the same registry alongside
   the PHP API and frontend. The Cloudflare preparation code includes the new files.
5. Integrate the real admin API and rerun the validation below before publishing.

Boundary source and reproduction

Source: https://github.com/altcoder/philippines-psgc-shapefiles
Archive: https://media.githubusercontent.com/media/altcoder/philippines-psgc-shapefiles/main/dist/PH_Adm3_MuniCities.shp.zip
Downloaded archive SHA256: 9bb847cfed70656b1ad67ac8648da7867a52df69e3150eff141cd8345b9027c2
License: api/MUNICIPAL-BOUNDARY-LICENSE.txt (existing source MIT attribution).
`py scripts/build-municipal-boundaries.py path/to/archive.zip` rebuilds the compact
server-side municipality index and compressed per-municipality polygons.
The provisional mirror source is https://psgc.gitlab.io/api/ (retrieved 11 October
2026). It is not described as an independently verified current PSA publication.

Validation performed

- `npm run build`, `npm run lint`, PHP syntax checks and existing flood-location tests.
  `py scripts/test-psgc-import.py` checks the importer against synthetic workbook
  hierarchy, code preservation, duplicate-name disambiguation, completeness and
  duplicate-code rejection; it does not certify the real current PSA workbook.
- `npm run test:psgc:api`: isolated MariaDB 10.4 database on loopback port 33317,
  real PHP HTTP endpoints, account/report/admin preservation, idempotent migration,
  explicit/ambiguous/NLP mappings, minimum-three and unknown-code rejection,
  saved preferences, unauthorized access, current/preferred union, duplicates,
  flood/advisory filtering, draft-to-published transitions, login/preference baselines,
  old-cursor protection across devices, privacy, independent nationwide browsing,
  valid/outside-country GPS, 500-report map pages and a 520-event notification burst.
- `npm run test:psgc:browser`: Edge through Playwright against Vite on port 33319,
  mocked API/tiles/browser notifications, actual login and selection UI,
  duplicate San Jose labels, minimum-three selection/settings edits, session
  restoration, independent Davao map search, denied GPS fallback, in-app/browser
  flood and advisory display, disabled flood preference and no notification replay.
  Region/province filters, denied browser permission and a synthetic 500-report
  clustered map page are also exercised.
  Browser notification calls are tested; real OS delivery/background delivery is
  not claimed. API integration is separately exercised against the real database.
- The map uses clustered GeoJSON rather than a DOM marker per report. Query/page
  bounds are tested; nationwide production load and low-end mobile benchmarks
  remain deployment validation, not a guarantee inferred from local tests.

Test setup never reads the application's private api/config.php. Initialize an
isolated MariaDB datadir, bind it to 127.0.0.1:33317, and use its passwordless test
root account. The fixture drops only bahaba_psgc_integration_test on that instance.
Use only the isolated test instance for this command. Start Vite at 127.0.0.1:33319
for browser tests; set BAHABA_BROWSER_PATH if Edge is installed elsewhere.

## Local admin accounts and registration preview

The admin at http://localhost:8080 now uses `local-api.php`, backed by the isolated MariaDB preview on 127.0.0.1:33317 (`bahaba_local_preview`). Its private ignored `local-config.php` references `preview.local/api/config.php`. Keep the MariaDB preview running. The API refuses non-loopback clients; this is not a production authentication deployment.

The five explicitly seeded `bahaba.lgu.{navotas,bulacan,marikina,pampanga,malolos}@example.com` identities are imported from the preview `users` table with their existing password hashes and original assigned scopes. No arbitrary resident identity is promoted. Bulacan and Pampanga remain province scopes without an invented municipality PSGC code. Existing demo identities remain available; Miguel is the existing team approver.

Both LGU and BAHABA team registrations persist as pending requests. Only an active team account can list or decide requests, with session and CSRF validation on the server and recorded reviewer decisions. Registration never logs in or grants active team access. Review via **System Logs & Security → Registration requests**. Approvals activate the requested role and unchanged requested PSGC assignment; pending and rejected identities cannot log in. Existing administration sample reports remain prototype data, not a production data integration. No registration email delivery is implemented.

Validation: `node scripts/test-admin-approval.mjs` exercises all five seeded LGU accounts, scope preservation, pending denial, team-only approvals, repeated-review rejection, accepted login, rejected login, pending team requests, and logout. `node scripts/test-admin-registration-browser.mjs` checks Navotas login/session restore and the team approval queue. Test requests have unique `approval-check-*` / `team-check-*` email addresses in the isolated preview only.

## Original full admin located and restored

The full original admin is **C:/Users/Jakes/Downloads/BAHABA-ADMIN**, not the three-file prototype at C:/Users/Jakes/BAHABA-ADMIN. The original PHP admin is running at **http://localhost:8001**; port 8080 now redirects there. It retains Summary & Analytics, NLP API, the Reports flood map, All Reports, resident account checks, LGU account approvals/assignment, Command Center, evacuation centers, announcements and logs. Existing NLP service on port 8002 remains running. The original live service uses its original database, while the resident development server still uses the isolated preview database described above. These are separate datasets; do not claim live NLP ingestion is connected to the isolated resident preview.

The earlier claim that no full admin API source was available is superseded: it was in Downloads. The earlier prototype local-admin-api and request queue are no longer the active admin. The full admin uses its existing **Account Manager** for LGU approval and user management. Original code was preserved; changes add the missing role/id to the login UI session (fixing blank platform summaries), change the registration button wording, and expose the PSGC catalogue alongside existing legacy scopes. No administrator assignment is rewritten. The original admin API reads the updated shared helpers and PSGC registry; completion of the earlier failed notification-trigger migration on the original MySQL database still requires suitable privileges. The isolated preview remains available in preview.local/full-admin for testing.

`node scripts/test-restored-admin-api.mjs` validates all five LGU logins and server-side platform restrictions plus users, app-users, All Reports, trends, NLP feed and health. `node scripts/test-restored-admin-browser.mjs` checks all nine original sections, populated summary metrics, report-map visibility, Account Manager and JavaScript errors. Tests support BAHABA_ADMIN_URL; their default is port 8001. The browser checks passed on both the isolated preview and the original server. Live collector coverage is not universal: current Facebook status may report unreadable posts; no new paid Apify collection was enabled by this restoration.

## Report pin visibility and deletion

The original full admin now has clickable reported pins with **Hide from map** and, where permitted, **Delete report** actions. Report rows also provide **Show on map** to restore hidden pins. `reports.map_hidden` is additive and defaults to false. Hiding preserves review status, history, and notification eligibility; it only removes the report's geometry from maps. The resident nationwide map excludes hidden reports. Deleting removes the report from lists, maps and current report totals; an internal `report_management_audit` snapshot retains the actor and previous report for audit. Historical monthly summaries already archived by the existing retention job are unchanged.

The server requires an active authenticated admin, a session CSRF token, and the report's existing assigned geographic scope. Existing ACL rules remain: full/edit report permissions can hide/show, while deletion requires full report permissions. Original LGU editors therefore see hide/show rather than a newly granted deletion capability. `report-management.php` is included by the full admin API; its reviewed source copy is `scripts/admin-report-management.php`. Hosting preparation includes the new server file.

Run `node scripts/test-report-actions.mjs` with the isolated MariaDB test server on port 33317. It creates and drops only `bahaba_report_actions_test`, serves test copies on port 33320, checks unauthenticated/CSRF/read-only/editor/full permissions, cross-LGU denial, persistent hide/show, resident map exclusion/restoration, audit preservation, clickable pin controls, reload persistence, delete cancellation and confirmed deletion. It never mutates real reports. As documented above, original admin and resident development databases are separate; visibility changes propagate to resident maps only when the admin and resident APIs use the same database.

## 2026-10-11: post threshold, password recovery and Command Center cleanup

- Original admin `nlp-threshold.php` creates one **pending barangay-level report** after 20 distinct Flood posts in a rolling 15-minute window for the same explicitly mapped municipality and unambiguous barangay. Raw individual posts remain in the NLP feed. Source-post duplicates, non-flood classifications, stale/future timestamps and unmapped/ambiguous locations do not meet the threshold. Missing post IDs use a deterministic text fingerprint. Replay does not advance the original post timestamp. Legacy and PSGC municipality IDs are grouped explicitly. A durable window ledger prevents repeat creation, including after hiding/deleting its report. Exact coordinates are not fabricated; barangay-only evidence creates an area report awaiting LGU verification. Existing/manual reports are preserved. Resident public visibility still requires verification. Legacy resident flood geometry helper also requires 20 distinct posts in 15 minutes.
- Password recovery now exists in both resident and original admin. Reset tokens are random, stored hashed, valid for 30 minutes, scoped to resident/admin, and consumed atomically once. Reissuing replaces an earlier token. Requests have database-backed email/IP limits. Password resets revoke prior authenticated sessions using a version counter; they do not activate accounts or change geographic assignments/ACLs. Reset pages include password visibility and confirmation. Never expose reset tokens in API responses or logs.
- PHPMailer from the existing Composer lockfile has been installed locally. SMTP credentials are **not configured** in the local shared configuration; actual email delivery is therefore unavailable and has not been verified. The request screens report the configuration problem. Set `smtp.host`, `smtp.port`, `smtp.username`, `smtp.password`, `mail_from`, and public `api_url` in the private config (never commit credentials). Original admin additionally needs the correct public `admin_url` (local default http://localhost:8001). On a packaged deployment with `admin-api.php`, configure `admin_api_url` to that complete public endpoint. Test real mailbox delivery only after configuration. No test sent email to real accounts.
- Command Center keeps its three analytics charts and removes the duplicate history tables/calendar progress bars. Summary & Analytics remains available. Contact form spacing and small-screen layout are improved.
- Evacuees now has available Bulacan/Pampanga barangays from the existing NAMRIA boundary snapshot, qualified by municipality to distinguish duplicate names. Existing city barangay labels are preserved. LGU scope/permissions stay assigned; platform evacuation forms follow the selected location. The boundary snapshot is not a fresh official nationwide barangay directory; municipalities without available barangay data are not guessed.
- Validation: isolated MySQL fixtures exercise 19/20 posts, stale posts, duplicate IDs, other barangays, non-flood/unmapped exclusion, repeated above-threshold ingestion, pending report precision, token expiry/one-use, weak passwords, account-type isolation, old password rejection and session revocation. Browser checks cover charts without old tables/bars, Bulacan qualified barangay selection and saving an evacuation center. Existing hide/show/delete, audit and geographic permission regression tests remain passing. Real original admin navigation/API and resident/admin recovery UI are checked locally. Production build and lint pass; existing MapLibre bundle-size warnings remain.
- Expanding the barangay selector no longer generates synthetic fallback flood/evacuation statistics. Missing Command Center metrics show a dash and unavailable barangay status shows “No data”. Older pre-existing sample data in the original admin is not a verified live metrics source.

## 2026-10-12: evacuation choices, hidden-report recovery and compact tables

- Barangay selection now resolves the admin's actual stable location ID. Existing legacy city names are preserved, explicitly mapped PSGC city assignments use municipality lists, and province scopes retain municipality-qualified names. Malolos no longer inherits the whole Bulacan map list. A small `map-data/barangay-options.json` index is generated from the existing 2023 NAMRIA snapshot and matched against the bundled municipality registry: 1,597 municipalities represented; 594 boundary records remain unmapped rather than being guessed. This is not a refreshed nationwide barangay directory. Missing data is shown as unavailable; “All barangays” is never offered as a barangay for creating a center. A platform location selector is now available directly in Evacuees. LGU assignments and existing barangay restrictions remain in force.
- Reports now has a separate **Manage all report pins** panel. It includes hidden, pending, verified and rejected reports across all barangays; platform admins can see all LGU locations and LGU admins are restricted server-side to their existing assignment. Search, map visibility, status filters, and 50-row pagination operate independently of the map's barangay/status filter. Hidden records have **Show on map**; hiding is reversible and deleting remains permission-checked with the existing audit trail. Long descriptions expand for reading. Raw individual NLP posts remain in their existing NLP monitors; this panel manages stored flood reports/pins, including threshold-generated NLP candidates. Original raw-data retention still applies, so “all” means all currently stored records, not deleted/expired raw posts. Removing map hiding does not override rejected status or invent missing coordinates; public resident maps still require verification.
- Summary history tables now use 6px cell padding, smaller caption gaps and a narrower barangay table. The old dashboard-specific `!important` padding is overridden explicitly. The report manager uses compact rows, a scrollable table and pagination.
- Validation uses disposable fixtures only: PSGC-assigned Malolos selection and evacuation-center save, platform switching between Malolos/Bulacan, manager search and pagination beyond 50 records, LGU geographic access restrictions, hidden-filter restoration and pin reappearance, reload persistence, deletion/audit regression, and computed compact table padding. Original admin navigation across all nine screens still passes. No real reports or evacuation centers were edited or deleted by testing.
