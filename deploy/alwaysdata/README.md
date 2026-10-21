# Deploy the PHP API to AlwaysData

This API-only package uses the existing AlwaysData MariaDB database. It does
not create or import a database.

## 1. Prepare the API files

From the repository root run:

```powershell
node deploy/alwaysdata/prepare-api.mjs
```

Upload the **contents** of `deploy/alwaysdata/output/api-site` to a private
working folder on AlwaysData, such as `~/www/bantala-api`. Do not upload
`bahaba-app/api/config.php`, SQL backups, or local credentials.

## 2. Create the PHP site

In AlwaysData, go to **Web → Sites → Add a site**. Choose **PHP**, select an
HTTPS address for the API, and set the document root to the folder where you
uploaded `api-site`. Choose PHP 8.3 or newer. If the folder does not exist yet,
create it over SSH or SFTP first.

## 3. Configure the existing database

In the uploaded site's `api` folder, copy `config.example.php` to `config.php`.
Fill in the host, database name, username, and password for the existing
`bahabafloodapp_migrated` database shown in the dashboard. Set the public app
URLs to the Cloudflare Pages hostname when that hostname is known. Generate a
new random `nlp_ingest_token`. For verification email, create an AlwaysData
mailbox and use `smtp-ACCOUNT.alwaysdata.net` on port 465 (implicit TLS), or
port 587 (STARTTLS). Keep all credentials private and do not send them in chat.
For Android FCM, set `fcm_service_account_path` in this private `config.php` to
the absolute path of the service-account JSON uploaded outside the site root,
for example `/home/ACCOUNT/bantala-fcm/service-account.json`. Restrict the key
file to mode `600` and its directory to `700`; never put the key in Cloudflare
Pages, the Android app, or source control.

Add an AlwaysData scheduled task to run once per minute:

```sh
php /home/ACCOUNT/www/bantala-api/api/push-dispatch.php
```

Replace `ACCOUNT` and `bantala-api` with the account and PHP site's actual
paths. The dispatcher is CLI-only. This task delivers newly eligible flood
signals while residents have closed the app; verified reports and published
announcements are also sent by the admin API when they are created or updated.

The prepared bundle includes the locked PHPMailer dependency. If you prefer to
install dependencies on the host, run from the site's `api` folder:

```sh
composer install --no-dev --no-interaction --prefer-dist
```

The package includes access rules that block direct requests for `config.php`,
the SQL schema, and Composer files. Keep both `.htaccess` files in place.

## 4. Check the API

Open `https://YOUR-API-HOST/healthz.php`. Once the database settings are correct,
it should return `{"ok":true}`. If it returns an error, inspect the AlwaysData
PHP logs; do not post passwords or database rows.

When the Cloudflare Pages site is ready, set its Worker variable
`BACKEND_ORIGIN` to this API site's HTTPS origin, with no path. The Pages Worker
will proxy `/api/*` and `/admin-api.php` to this PHP site.
