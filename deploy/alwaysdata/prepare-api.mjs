import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const app = resolve(root, 'bahaba-app')
const admin = resolve(root, 'deploy/render-api/admin-source')
const output = resolve(here, 'output')
const apiSite = resolve(output, 'api-site')
mkdirSync(resolve(apiSite, 'api'), { recursive: true })

const residentFiles = [
  'bootstrap.php', 'password-recovery.php', 'forgot-password.php', 'reset-password.php', 'push.php', 'push-device.php', 'push-dispatch.php',
  'index.php', 'location-data.php', 'location_helpers.php', 'psgc.php', 'map-reports.php', 'flood-signals.php',
  'notifications.php', 'resolve-location.php', 'municipality-boundaries.php',
  'municipality-boundaries.json', 'municipality-geometry', 'login.php', 'logout.php',
  'me.php', 'profile.php', 'report-retention.php', 'resend-verification.php', 'signup.php',
  'verify.php', 'schema.sql', 'composer.json', 'composer.lock',
]
for (const name of residentFiles) {
  cpSync(resolve(app, 'api', name), resolve(apiSite, 'api', name), { recursive: true })
}
cpSync(resolve(app, 'api/collected-summary.php'), resolve(apiSite, 'api/collected-summary.php'))
// Bundle the locked PHPMailer dependency so signup works even if the host-side
// Composer step is missed during deployment.
cpSync(resolve(app, 'api/vendor'), resolve(apiSite, 'api/vendor'), { recursive: true })
cpSync(resolve(here, 'config.example.php'), resolve(apiSite, 'api/config.example.php'))
cpSync(resolve(root, 'deploy/render-api/healthz.php'), resolve(apiSite, 'healthz.php'))
cpSync(resolve(app, 'location-config.json'), resolve(apiSite, 'location-config.json'))
cpSync(resolve(app, 'psgc-registry.json'), resolve(apiSite, 'psgc-registry.json'))

for (const name of [
  'api.php', 'nlp-location.php', 'report-point.php', 'report-management.php',
  'nlp-threshold.php', 'nlp-flood-events.php', 'expire-nlp-events.php', 'collected-history.php', 'team-deployments.php',
  'social-accounts.php', 'trusted-publishers.php', 'team-barangays.json', 'map-data',
]) {
  cpSync(resolve(admin, name), resolve(apiSite, name), { recursive: true })
}
cpSync(resolve(apiSite, 'api.php'), resolve(apiSite, 'admin-api.php'))
writeFileSync(resolve(apiSite, '.htaccess'), 'Options -Indexes\n<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n')
writeFileSync(resolve(apiSite, 'api/.htaccess'), '<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n')
writeFileSync(resolve(output, '.gitignore'), '*\n')
console.log(`Prepared AlwaysData PHP API site: ${apiSite}`)
