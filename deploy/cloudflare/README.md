# Cloudflare Pages + alwaysdata

Prepared locally; this is not a completed deployment.

Cloudflare serves the resident app at `/` and the admin at `/admin/`.
The included Worker proxies `/api/*` and `/admin-api.php` to the PHP host,
so browser login cookies stay on the Cloudflare hostname. Static files bypass
the Worker; API requests count toward the Pages Functions / Workers free quota.

## Build

From the repository root:

```powershell
node deploy/cloudflare/prepare.mjs C:/Users/Jakes/Downloads/BAHABA-ADMIN
```

Outputs are in `deploy/cloudflare/output/`. Neither output includes existing
credentials, user data, database exports, account seeds, or NLP model weights.
Use this dedicated preparation command instead of uploading the project folder.

## PHP and SQL host

1. Register at https://www.alwaysdata.com/en/ and select the Free plan.
   It allows noncommercial use, 1 GB shared by files/mail/databases, 256 MB RAM,
   and an alwaysdata.net address. Background services are unavailable on Free.
2. Create a MariaDB database and dedicated database user. Import `api/schema.sql`
   for a new empty installation. Migrating existing accounts/reports requires a
   private export of the existing shared database; the schema alone has no data.
3. Upload the contents of `output/php-host/` into the PHP site's document root.
   Choose a current compatible PHP version with PDO MySQL.
4. Create `api/config.php` privately from `api/config.example.php`. Use the
   database host shown in alwaysdata (typically mysql-ACCOUNT.alwaysdata.net),
   database name, username, and password. Both APIs use this same configuration.
5. Set `api_url` to `https://YOUR-PROJECT.pages.dev/api`, and `app_url` and
   `frontend_origin` to `https://YOUR-PROJECT.pages.dev`. Configure SMTP privately
   and generate a fresh ingestion secret. Install dependencies with
   `composer install --no-dev --working-dir=api` on the host for email features.
6. Enable HTTPS. Verify direct access to `/api/config.php`, `/api/schema.sql`,
   and composer files is denied. Do not upload local config.php or test seeds.

The free plan cannot run the existing NLP/browser collector service. Its model
weights alone exceed this plan's disk quota. Keep that service separately hosted;
the hosted admin's current localhost NLP health check will need a separate migration.
Admin account provisioning and migration of existing data remain separate steps.

## Cloudflare deployment

Sign into your own Cloudflare account locally:

```powershell
npx wrangler login
npx wrangler pages project create bahaba --production-branch main
npx wrangler pages deploy deploy/cloudflare/output/pages --project-name bahaba
```

If the project name is taken, choose another name and use its returned hostname
in the PHP configuration. In Workers & Pages > project > Settings > Variables
and Secrets, set production `BACKEND_ORIGIN=https://ACCOUNT.alwaysdata.net`
(no path). Redeploy after configuring it. Leave VITE_API_URL as `/api`.
Do not upload SQL passwords or SMTP credentials to Cloudflare frontend variables.

Before sharing: verify resident login/logout, admin login and role restrictions,
profile persistence, map data, email verification links, and shared database data.
The proxy returns 503 until BACKEND_ORIGIN is configured. Live login cannot be
verified until the host, database, credentials, and deployment exist.

Official references:
- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/pages/get-started/direct-upload/
- https://help.alwaysdata.com/en/docs/admin-billing/billing/public-cloud-prices/
- https://help.alwaysdata.com/en/docs/web-hosting/databases/mariadb/
