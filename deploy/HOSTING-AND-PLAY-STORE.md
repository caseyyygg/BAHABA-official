# BANTALA hosting and Android release

Prepared 2026-10-13. No hosting services have been created and no live data has been migrated.

## Hosting layout

| Component | Host |
| --- | --- |
| Resident and admin web app | Cloudflare Pages |
| PHP resident/admin API | Render web service (`render.yaml`) |
| MariaDB persistent data | Existing Alwaysdata account (`bahabafloodapp.alwaysdata.net`) |
| NLP classifier and social collectors | Not deployed; free Render is insufficient for the current stack |

Render free web services sleep after inactivity and have ephemeral local storage. Their API can use the external Alwaysdata database, so application records are not stored on Render. The current NLP service needs PyTorch/Transformers, a browser, and collector state; do not expect it to run reliably on a 512 MB free service. Social collection and browser sessions need an always-on host with persistent storage. The main site can operate with the last saved reports while NLP collection is offline.

Alwaysdata Free is limited and noncommercial. Confirm terms and available database/storage quota in the account before public launch. Free hosting is suitable for a small demonstration, not a reliability guarantee for emergency operations.

## Deployment sequence

1. In Alwaysdata, create a **new** MariaDB database and a dedicated database user. Leave any existing database intact.
2. Export a fresh dump from the current source database. The local transfer folder contains an October 12 snapshot, which may be missing later changes. Do not commit the SQL dump or put it in a public web directory. Import the fresh dump into the new database using Alwaysdata's private database tools. Check table/account counts privately before switching traffic.
3. Push the reviewed application code to a Git repository connected to Render. Create a Render Blueprint from `render.yaml`. In the service's environment settings, set DB host/name/user/password from Alwaysdata; set `PUBLIC_APP_URL` to the eventual Cloudflare Pages hostname; and generate a new random `NLP_INGEST_TOKEN`. Keep NLP URLs empty until a compatible service exists. Render Free blocks outbound SMTP ports 25, 465, and 587, so account verification and password recovery email need an HTTPS email provider or a different API host.
4. Wait for Render to publish the API URL, then configure Cloudflare Pages and its Worker. Set Worker secret `BACKEND_ORIGIN` to the Render HTTPS origin, with no path. Keep frontend API calls at `/api`.
5. Build the static bundle using `deploy/cloudflare/prepare.mjs` with the current admin source path, upload `deploy/cloudflare/output/pages` to Pages, and confirm the Pages URL is the same value as `PUBLIC_APP_URL`.
6. Only after checking migrated data and credentials on the new deployment, switch the public URL. Keep a private backup of the source database until the new service is confirmed.

Never place database credentials, SQL dumps, credentials.txt, NLP `.env` files, model caches, browser sessions, or saved social-login state in Git or the Pages bundle. The public Alwaysdata site URL is not the database password/hostname; use the DB connection details displayed in its dashboard.

See [deploy/cloudflare/README.md](cloudflare/README.md) for the Pages/API/database wiring. Live deployment remains pending because account dashboard credentials and the current source database export are not available to this workspace; enter secrets only in the hosting dashboards.
## 6. Google Play

The repository currently contains a React/Vite web app, not an Android project.
Package the resident app with Capacitor; keep the LGU admin console on the web.

1. Install Android Studio and the supported Capacitor toolchain. Choose the final
   Android application ID before creating the store listing.
2. Build bundled web assets for Android, with a production HTTPS API endpoint.
   Test native/WebView authentication, cookies, allowed origins, geolocation,
   email verification and password-reset links on a physical phone.
3. Implement native push if notifications must arrive after the app closes; the
   current browser-only notification flow does not supply this capability.
4. Provide a public privacy policy, accurate Data safety declaration, support
   contact, content rating, app-access review instructions, and account deletion
   both inside the app and through a public web request path where required.
5. Prepare the store name/descriptions, screenshots, app icon, and feature graphic.
6. Create and verify the Play Console account. The registration fee is US$25 once.
7. Generate and securely retain the signing/upload keys, build a signed Android
   App Bundle (`.aab`), and upload it to internal testing first.
8. New standard phone-app submissions currently require Android 16 / API 36 or
   higher. Recheck the requirement on the submission date.
9. Personal developer accounts created after 2023-11-13 require at least 12
   testers opted in continuously for 14 days before applying for production access.
10. Resolve test/review issues, apply for production access when required, then
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
