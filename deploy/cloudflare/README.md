# BANTALA hosting bundle

Cloudflare Pages serves the resident app at `/` and the admin at `/admin/`.
The included Worker proxies `/api/*` and `/admin-api.php` to the Render PHP API,
keeping browser cookies on the Pages hostname. The database remains MariaDB on
Alwaysdata, so Render's temporary filesystem is not used for application data.

## Prepare the Pages upload

From the repository root, pass the current admin source directory:

```powershell
node deploy/cloudflare/prepare.mjs C:/Users/Jakes/Downloads/BAHABA-ADMIN
```

The script outputs `deploy/cloudflare/output/pages` and `output/php-host`.
Never upload SQL exports, local config files, credentials, or the NLP service's
`.env`, `.state`, model cache, or virtual environment.

## Configure Cloudflare

Create a Pages project in the Cloudflare dashboard and upload the contents of
`output/pages` (or connect the repository and configure the equivalent build).
Set the Pages Worker secret `BACKEND_ORIGIN` to the Render API origin, without
a path, for example `https://bantala-api.onrender.com`. The frontend API path
stays `/api`.

## Configure the database

Create a new MariaDB database and dedicated user in Alwaysdata. Configure
`DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` privately in the Render
service. Use the DB host shown in Alwaysdata (commonly
`mysql-ACCOUNT.alwaysdata.net`). Keep the existing database untouched until
the imported copy has been checked.

For the data migration, export a fresh SQL dump from the current database and
import it into the newly created database through Alwaysdata's private database
tools. The local transfer folder has an older SQL snapshot; it may not contain
changes made after that export. Do not commit the dump to Git or place it in a
public web directory. Verify table and account counts privately before changing
the live app over.

Set Render `PUBLIC_APP_URL` to the Cloudflare Pages hostname. Generate new random
values for `NLP_INGEST_TOKEN` and `NLP_SERVICE_TOKEN`; set SMTP values privately
if verification and password-reset email should work. Leave NLP/browser service
URLs empty until a compatible service is deployed.

## Render free-tier limits

The Render PHP API blueprint is in `render.yaml`. Free web services sleep after
inactivity, so the first request can be delayed. Their local filesystem is
ephemeral. Do not store the database or social browser sessions on Render.
The current NLP service depends on PyTorch/Transformers and browser tooling; a
512 MB free Render instance is not a dependable place to run its model or
continuous collectors. Use an always-on service with enough memory and durable
session storage for those features. The main app can still use the persistent
Alwaysdata database while collection is offline.

Alwaysdata Free is intended for noncommercial use and has a small shared quota.
Keep database backups and monitor storage. Confirm the current account limits
and allowed use in the Alwaysdata dashboard before launch.
