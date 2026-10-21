# BANTALA hosting bundle

Cloudflare Pages serves the resident app at `/` and the admin at `/admin/`.
The Pages Worker proxies `/api/*` and `/admin-api.php` to the PHP site hosted
on AlwaysData. Both PHP APIs and MariaDB run in the AlwaysData account; browser
sessions stay on the Pages hostname.

## Prepare the upload

From the repository root, pass the current admin source directory:

```powershell
node deploy/cloudflare/prepare.mjs C:/Users/Jakes/Downloads/BAHABA-ADMIN
```

The script creates `deploy/cloudflare/output/pages` and
`deploy/cloudflare/output/alwaysdata-api`. Upload the contents of `pages` to
Cloudflare Pages. Upload the contents of `alwaysdata-api` to a private working
folder first; finish its configuration before making the PHP site public.
Never upload SQL exports, local config files, credentials, or NLP `.env`,
`.state`, model cache, or virtual environment files.

To prepare **only the PHP API**, without building the Pages bundle or depending
on an external admin source folder, run `node deploy/alwaysdata/prepare-api.mjs`
and follow [the API-only deployment guide](../alwaysdata/README.md).

## Configure AlwaysData

1. In AlwaysData, create a new MariaDB database and dedicated user. Leave the
   current database intact. Record the database host, name, user, and password
   from the dashboard.
2. Create a PHP site (PHP 8.3 or newer) whose document root is the uploaded
   `alwaysdata-api` folder. Use its HTTPS hostname as the API origin.
3. In SSH, run `cd ~/PATH_TO_SITE/api` and then
   `composer install --no-dev --no-interaction --prefer-dist`. Confirm the PHP
   site has PDO MySQL enabled.
4. Copy `api/config.example.php` to `api/config.php`. Fill in the AlwaysData
   database details, final Cloudflare Pages hostname, and a newly generated
   `nlp_ingest_token`. Set SMTP values privately if verification and password
   recovery email should work. Keep NLP and social-browser URLs empty until
   those services are deployed.
5. In the PHP site's environment settings, set `PUBLIC_APP_URL` to the exact
   Cloudflare Pages origin (scheme and hostname, no trailing slash). The admin
   API uses this to allow the Pages origin.
6. In Cloudflare Pages, set the Worker variable `BACKEND_ORIGIN` to the
   AlwaysData PHP site origin, for example `https://YOUR-API-HOST.alwaysdata.net`
   with no path. The frontend API path remains `/api`.
7. Open `https://YOUR-API-HOST.alwaysdata.net/healthz.php`; it should return
   `{"ok":true}` after the database config is in place.

The package includes `.htaccess` rules that deny direct access to PHP
configuration, SQL schema, and Composer files. Do not remove those files. Keep
`api/config.php` out of Git and out of the Pages upload.

## Move the data safely

Export a fresh SQL dump from the current source database, then import it into
the **new** AlwaysData database using its private database tools. The local
transfer folder contains an older snapshot and may be missing recent records.
Do not commit a dump or put it in a public web directory. Compare table and
account counts privately, then check API health, resident/admin login, reports,
and data writes on the new host before switching users. Keep the source database
backup until the new deployment is confirmed.

## Hosting limits

AlwaysData Free has limited shared storage and is intended for noncommercial
use. Confirm current plan terms and quota in the account before public launch.
The PHP API and database can run there; the current NLP model and social browser
collectors still need a separate compatible service with enough memory and
persistent session storage. The main app can use saved reports while collection
is offline.
