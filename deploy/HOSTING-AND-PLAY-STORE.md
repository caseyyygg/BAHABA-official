# BANTALA hosting and Android release

Updated 2026-10-15. Hosting bundle now targets AlwaysData for the PHP API and MariaDB; no cloud hosting changes or live data migration have been performed from this workspace.

## Hosting layout

| Component | Host |
| --- | --- |
| Resident and admin web app | Cloudflare Pages |
| PHP resident/admin API | AlwaysData PHP site (`deploy/alwaysdata/output/api-site`) |
| MariaDB persistent data | AlwaysData MariaDB (create a new database for migration) |
| NLP classifier and social collectors | Not deployed; free Render is insufficient for the current stack |

The current NLP service needs PyTorch/Transformers, a browser, and collector state; social collection and browser sessions need a separate compatible service with persistent storage. The main site can operate with the last saved reports while collection is offline.

AlwaysData Free has limited shared resources and is intended for noncommercial use. Confirm terms and available database/storage quota in the account before public launch. Free hosting is suitable for a small demonstration, not a reliability guarantee for emergency operations.

## Deployment sequence

1. In AlwaysData, create a **new** MariaDB database and a dedicated database user. Leave the current database intact.
2. Export a fresh dump from the current source database. The local transfer folder has an older snapshot that may be missing later changes. Do not commit the SQL dump or put it in a public web directory. Import the fresh dump into the new database using AlwaysData's private database tools. Check table/account counts privately before switching traffic.
3. Prepare the PHP API with `node deploy/alwaysdata/prepare-api.mjs` and deploy `deploy/alwaysdata/output/api-site` as an AlwaysData PHP site (PHP 8.3+, Composer dependencies installed). Prepare and deploy the Cloudflare Pages bundle separately when ready.
4. Configure the AlwaysData site's `api/config.php` from `deploy/alwaysdata/config.example.php`: database details, Pages URLs, random `NLP_INGEST_TOKEN`, and optional SMTP credentials. Set site environment variable `PUBLIC_APP_URL` to the exact Pages origin.
5. Set the Cloudflare Worker variable `BACKEND_ORIGIN` to the AlwaysData PHP site HTTPS origin, with no path. Keep frontend API calls at `/api`.
6. Only after checking migrated data and credentials on the new deployment, switch the public URL. Keep a private backup of the source database until the new service is confirmed.

Never place database credentials, SQL dumps, credentials.txt, NLP `.env` files, model caches, browser sessions, or saved social-login state in Git or the Pages bundle. The public Alwaysdata site URL is not the database password/hostname; use the DB connection details displayed in its dashboard.

See [deploy/cloudflare/README.md](cloudflare/README.md) for the Pages/API/database wiring. Live deployment remains pending because AlwaysData dashboard access and a fresh source database export are not available in this workspace; enter secrets only in the hosting dashboards. `render.yaml` and `deploy/render-api` are retained as the previous deployment setup and are not used by this AlwaysData plan.
## 6. Google Play

The resident React/Vite app now has Capacitor Android configuration in
`bahaba-app/capacitor.config.json`. Its Android build uses
`https://bantalafloodapp.pages.dev/api` from `bahaba-app/.env.android`; the
Cloudflare Pages Worker must have `BACKEND_ORIGIN` configured and route that
path to the live PHP API. The LGU admin console stays on the web.

1. Confirm the public API responds at
   `https://bantalafloodapp.pages.dev/api/location-data.php` (or update
   `.env.android` if the API uses a different URL). Keep API and
   database credentials out of the Android app; only the public API URL belongs
   there.
2. Install Node.js and Android Studio, then from `bahaba-app` run:
   `npm install`, `npx cap add android`, `npm run build:android`, and
   `npm run android`. Build and test the signed-in flows on a physical Android
   phone, including login persistence, signup verification, password reset,
   geolocation, and report submission. Capacitor native HTTP is enabled for the
   API requests. The package id `com.bantala.floodapp` is a proposed identifier;
   confirm it is available and keep it unchanged after first Play publication.
3. Replace the generated Capacitor launcher icon with the approved BANTALA app
   icon. The current Android project still contains the starter icon.
4. Add account deletion both inside the app and on a public web page before
   release. The app currently supports account creation but has no account
   deletion flow. Google Play requires both paths and deletion of associated
   account data: https://support.google.com/googleplay/android-developer/answer/10144311
5. Implement native push if notifications must arrive after the app closes; the
   current browser-only notification flow does not supply this capability.
6. Provide a public privacy policy, accurate Data safety declaration, support
   contact, content rating, app-access review instructions, and account deletion
   details. Prepare the store name/descriptions, screenshots, and feature graphic.
7. Create and verify the Play Console account. The registration fee is US$25 once.
8. Generate and securely retain the signing/upload keys, build a signed Android
   App Bundle (`.aab`), and upload it to internal testing first.
9. New standard phone-app submissions currently require Android 16 / API 36 or
   higher. Recheck the requirement on the submission date.
10. Personal developer accounts created after 2023-11-13 require at least 12
   testers opted in continuously for 14 days before applying for production access.
11. Resolve test/review issues, apply for production access when required, then
    submit the production release. Store approval is not automatic.

## Official references

- https://help.alwaysdata.com/en/docs/admin-billing/billing/public-cloud-prices/
- https://render.com/docs/free
- https://render.com/docs/disks
- https://render.com/docs/docker
- https://capacitorjs.com/docs/android/deploying-to-google-play
- https://support.google.com/googleplay/android-developer/answer/6112435
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/13327111
