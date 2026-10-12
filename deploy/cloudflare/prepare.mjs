import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const app = resolve(root, 'bahaba-app')
const sourceAdmin = process.argv[2]
if (!sourceAdmin) throw new Error('Pass the absolute admin source directory as the first argument.')
const output = resolve(here, 'output')
const stagedAdmin = resolve(output, 'admin-staging')
const adminFiles = ['index.html', 'App.js', 'style.css', 'admin-polish.css', 'psgc-registry.json', 'report-manager.js', 'collected-history.js', 'barangay-status.js', 'team-deployments.js', 'social-accounts.js', 'user-manager.js', 'admin-confirm.js', 'bahaba-logo.jpg', 'report-map.mjs', 'report-point.mjs', 'admin-search-selects.js', 'api.php', 'nlp-location.php', 'report-point.php', 'report-management.php', 'nlp-threshold.php', 'collected-history.php', 'team-deployments.php', 'social-accounts.php', 'team-barangays.json', 'map-data', 'map-vendor']
mkdirSync(stagedAdmin, { recursive: true })
for (const name of adminFiles) {
  const source = resolve(sourceAdmin, name)
  try { cpSync(source, resolve(stagedAdmin, name), { recursive: true, force: true }) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
mkdirSync(resolve(stagedAdmin, 'nlp-service'), { recursive: true })
cpSync(resolve(sourceAdmin, 'nlp-service/app.py'), resolve(stagedAdmin, 'nlp-service/app.py'))
execFileSync(process.execPath, [resolve(app, 'scripts/update-report-workflow.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-collected-history.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-barangay-status.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-team-deployments.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-social-accounts.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-user-manager.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: app, stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api' },
})
const pages = resolve(output, 'pages')
const backend = resolve(output, 'php-host')
mkdirSync(pages, { recursive: true })
mkdirSync(resolve(backend, 'api'), { recursive: true })
cpSync(resolve(app, 'location-config.json'), resolve(backend, 'location-config.json'))
cpSync(resolve(app, 'psgc-registry.json'), resolve(backend, 'psgc-registry.json'))
cpSync(resolve(app, 'dist'), pages, { recursive: true })
cpSync(resolve(here, 'worker.mjs'), resolve(pages, '_worker.js'))
writeFileSync(resolve(pages, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*', '/admin-api.php'], exclude: [] }, null, 2))
mkdirSync(resolve(pages, 'admin'), { recursive: true })
for (const name of ['index.html', 'App.js', 'style.css', 'admin-polish.css', 'psgc-registry.json', 'report-manager.js', 'collected-history.js', 'barangay-status.js', 'team-deployments.js', 'social-accounts.js', 'user-manager.js', 'admin-confirm.js', 'bahaba-logo.jpg', 'report-map.mjs', 'report-point.mjs', 'map-data', 'map-vendor']) {
  cpSync(resolve(stagedAdmin, name), resolve(pages, 'admin', name), { recursive: true })
}
// Only server sources, never local credentials or test-account seed scripts.
for (const name of ['bootstrap.php', 'password-recovery.php', 'forgot-password.php', 'reset-password.php', 'config.example.php', 'index.php', 'location-data.php', 'location_helpers.php', 'psgc.php', 'map-reports.php', 'notifications.php', 'resolve-location.php', 'municipality-boundaries.php', 'municipality-boundaries.json', 'municipality-geometry', 'login.php', 'logout.php', 'me.php', 'profile.php', 'report-retention.php', 'resend-verification.php', 'signup.php', 'verify.php', 'schema.sql', 'composer.json', 'composer.lock']) {
  cpSync(resolve(app, 'api', name), resolve(backend, 'api', name), { recursive: true })
}
cpSync(resolve(app, 'api/collected-summary.php'), resolve(backend, 'api/collected-summary.php'))
for (const name of ['nlp-location.php', 'report-point.php', 'report-management.php', 'nlp-threshold.php', 'collected-history.php', 'team-deployments.php', 'social-accounts.php', 'team-barangays.json']) cpSync(resolve(stagedAdmin, name), resolve(backend, name))
cpSync(resolve(stagedAdmin, 'api.php'), resolve(backend, 'admin-api.php'))
cpSync(resolve(stagedAdmin, 'map-data'), resolve(backend, 'map-data'), { recursive: true })
writeFileSync(resolve(backend, '.htaccess'), '<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n')
writeFileSync(resolve(output, '.gitignore'), '*\n')
console.log(`Prepared Cloudflare files: ${pages}\nPrepared PHP files: ${backend}`)
