import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { patchLiveFeed } from '../../bahaba-app/scripts/admin-live-feed.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const app = resolve(root, 'bahaba-app')
const sourceAdmin = process.argv[2]
if (!sourceAdmin) throw new Error('Pass the absolute admin source directory as the first argument.')
const output = resolve(process.argv[3] || resolve(here, 'output'))
const stagedAdmin = resolve(output, 'admin-staging')
const adminFiles = ['index.html', 'App.js', 'style.css', 'admin-polish.css', 'psgc-registry.json', 'report-manager.js', 'collected-history.js', 'barangay-status.js', 'team-deployments.js', 'social-accounts.js', 'user-manager.js', 'admin-confirm.js', 'bahaba-logo.jpg', 'report-map.mjs', 'command-live-map.mjs', 'admin-flood-signals.mjs', 'report-severity.mjs', 'report-point.mjs', 'admin-search-selects.js', 'api.php', 'nlp-location.php', 'report-point.php', 'report-management.php', 'nlp-threshold.php', 'collected-history.php', 'team-deployments.php', 'social-accounts.php', 'team-barangays.json', 'map-data', 'map-vendor']
mkdirSync(stagedAdmin, { recursive: true })
for (const name of adminFiles) {
  const source = resolve(sourceAdmin, name)
  try { cpSync(source, resolve(stagedAdmin, name), { recursive: true, force: true }) }
  catch (error) { if (error.code !== 'ENOENT') throw error }
}
// NLP controls belong in Platform and are restricted to platform admins.
const adminIndexPath = resolve(stagedAdmin, 'index.html')
const adminAppPath = resolve(stagedAdmin, 'App.js')
let adminIndex = readFileSync(adminIndexPath, 'utf8').replace(/\r\n/g, '\n')
const nlpNavPattern = /[ \t]*<button class="sb-link" data-view="nlp-api"[\s\S]*?<\/button>[ \t]*(?:\r?\n|$)/
const nlpNavMatch = adminIndex.match(nlpNavPattern)
if (!nlpNavMatch) throw new Error('Could not find the NLP API sidebar item in admin index.html.')
adminIndex = adminIndex.replace(nlpNavPattern, '\n')
const platformHeading = '<div class="sb-section-label">Platform</div>'
if (!adminIndex.includes(platformHeading)) throw new Error('Could not find the Platform sidebar section.')
adminIndex = adminIndex.replace(platformHeading, `${platformHeading}\n${nlpNavMatch[0].trim()}\n`)
writeFileSync(adminIndexPath, adminIndex)

let adminApp = readFileSync(adminAppPath, 'utf8').replace(/\r\n/g, '\n')
const moduleAdminHelper = "function canAdminModule(auth, moduleKey) {\n  return getModulePermission(auth, moduleKey) === 'full';\n}"
if (!adminApp.includes(moduleAdminHelper)) throw new Error('Could not find the admin module permission helper.')
adminApp = adminApp.replace(moduleAdminHelper, `${moduleAdminHelper}\n\nfunction canAccessNlpApi(auth) {\n  return auth?.role === 'platform-admin' && canAdminModule(auth, 'admin_overview');\n}`)
const accessSites = [
  ["const allowed = canViewModule(session, mod) && (v !== 'users' || (session.role === 'platform-admin' && canAdminModule(session, 'admin_overview')));",
   "const allowed = canViewModule(session, mod) && (v !== 'nlp-api' || canAccessNlpApi(session)) && (v !== 'users' || (session.role === 'platform-admin' && canAdminModule(session, 'admin_overview')));"],
  ["if(!canViewModule(session, modKey) || (viewName === 'users' && (session.role !== 'platform-admin' || !canAdminModule(session, 'admin_overview')))) {",
   "if(!canViewModule(session, modKey) || (viewName === 'nlp-api' && !canAccessNlpApi(session)) || (viewName === 'users' && (session.role !== 'platform-admin' || !canAdminModule(session, 'admin_overview')))) {"],
  ["].filter(m => canViewModule(session, m.mod) && (m.id !== 'users' || (session.role === 'platform-admin' && canAdminModule(session, 'admin_overview'))));",
   "].filter(m => canViewModule(session, m.mod) && (m.id !== 'nlp-api' || canAccessNlpApi(session)) && (m.id !== 'users' || (session.role === 'platform-admin' && canAdminModule(session, 'admin_overview'))));"],
]
for (const [before, after] of accessSites) {
  if (!adminApp.includes(before)) throw new Error('Could not find an NLP access-control site in admin App.js.')
  adminApp = adminApp.replace(before, after)
}
writeFileSync(adminAppPath, adminApp)
// External admin exports may predate native push. Patch the PHP upload so
// publication sends immediately; the scheduled dispatcher remains a retry.
const adminApiPath = resolve(stagedAdmin, 'api.php')
let adminApi = readFileSync(adminApiPath, 'utf8')
const canonicalAdminApi = readFileSync(resolve(root, 'deploy/render-api/admin-source/api.php'), 'utf8')
const healthStart = canonicalAdminApi.indexOf('function nlp_service_status(): array')
const healthEnd = canonicalAdminApi.indexOf('\ntry {', healthStart)
if (healthStart < 0 || healthEnd < 0) throw new Error('Could not locate canonical NLP health function.')
adminApi = adminApi.replace(/function nlp_service_status\(\): array[\s\S]*?(?=\r?\ntry \{)/, canonicalAdminApi.slice(healthStart, healthEnd))
const ingestTokenStart = canonicalAdminApi.indexOf('$nlpIngestToken =')
const ingestTokenEnd = canonicalAdminApi.indexOf('\n\nfunction nlp_service_status(): array', ingestTokenStart)
if (ingestTokenStart < 0 || ingestTokenEnd < 0) throw new Error('Could not locate canonical NLP ingestion token configuration.')
adminApi = adminApi.replace(/\$nlpIngestToken =[^;]*;[\s\S]*?\$nlpIngestionConfigured =[^;]*;/, canonicalAdminApi.slice(ingestTokenStart, ingestTokenEnd))

if (!adminApi.includes("require_once $sharedApiDirectory . '/push.php';")) {
  adminApi = adminApi.replace("require_once $sharedApiDirectory . '/psgc.php';", "require_once $sharedApiDirectory . '/psgc.php';\nrequire_once $sharedApiDirectory . '/push.php';")
}
const pushHooks = [
  ["$statement->execute(['status' => $status, 'id' => $reportId]);", "if ($status === 'verified') bahaba_send_resident_push($pdo, 'flood', $reportId);"],
  ["$statement->execute(['status' => $announcementStatus, 'id' => $announcementId]);", "if ($announcementStatus === 'published') bahaba_send_resident_push($pdo, 'advisory', $announcementId);"],
  ["'status' => $status,\n        ]);\n        http_response_code(201);", "if ($status === 'published') bahaba_send_resident_push($pdo, 'advisory', (int) $pdo->lastInsertId());"],
]
adminApi = adminApi.replace(/\r\n/g, '\n')
if (!adminApi.includes('bahaba_ensure_push_schema($pdo);')) {
  const schemaAnchor = 'bahaba_ensure_location_schema($pdo);'
  if (!adminApi.includes(schemaAnchor)) throw new Error('Could not locate admin schema initialization.')
  adminApi = adminApi.replace(schemaAnchor, `${schemaAnchor}\nbahaba_ensure_psgc_schema($pdo);\nbahaba_ensure_push_schema($pdo);`)
}
for (const [anchor, hook] of pushHooks) {
  if (adminApi.includes(hook)) continue
  if (!adminApi.includes(anchor)) throw new Error('Could not locate admin publication push hook.')
  adminApi = adminApi.replace(anchor, anchor.includes('http_response_code')
    ? anchor.replace('        http_response_code', `        ${hook}\n        http_response_code`)
    : `${anchor}\n        ${hook}`)
}
writeFileSync(adminApiPath, adminApi)
for (const [name, fallback] of [['admin-confirm.js', resolve(app, 'scripts/admin-confirm.js')], ['bahaba-logo.jpg', resolve(app, 'public/bahaba-logo.jpg')]]) {
  if (!existsSync(resolve(stagedAdmin, name)) && existsSync(fallback)) cpSync(fallback, resolve(stagedAdmin, name), { force: true })
}
mkdirSync(resolve(stagedAdmin, 'nlp-service'), { recursive: true })
// Use one collector implementation for hosted and local packages. An older
// external admin export must not restore fabricated dates or historical feeds.
const collectorSource = resolve(here, '../huggingface-space')
for (const name of ['app.py', 'official_x.py', 'social_collectors.py', 'scoped_collectors.py', 'social_browser.py', 'x_agent_reach.py', 'collector-locations.json', 'collector-profiles.json', 'requirements.txt', 'vendor']) {
  cpSync(resolve(collectorSource, name), resolve(stagedAdmin, 'nlp-service', name), { recursive: true, force: true })
}
execFileSync(process.execPath, [resolve(app, 'scripts/update-report-workflow.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-collected-history.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-barangay-status.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-team-deployments.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-social-accounts.mjs'), stagedAdmin], { stdio: 'inherit' })
execFileSync(process.execPath, [resolve(app, 'scripts/update-user-manager.mjs'), stagedAdmin], { stdio: 'inherit' })
const stagedAppPath = resolve(stagedAdmin, 'App.js')
const stagedHtmlPath = resolve(stagedAdmin, 'index.html')
const liveFeed = patchLiveFeed(readFileSync(stagedAppPath, 'utf8'), readFileSync(stagedHtmlPath, 'utf8'))
writeFileSync(stagedAppPath, liveFeed.app)
writeFileSync(stagedHtmlPath, liveFeed.html)
execFileSync(process.execPath, [resolve(app, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: app, stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api' },
})
const pages = resolve(output, 'pages')
const backend = resolve(output, 'alwaysdata-api')
mkdirSync(pages, { recursive: true })
mkdirSync(resolve(backend, 'api'), { recursive: true })
cpSync(resolve(app, 'location-config.json'), resolve(backend, 'location-config.json'))
cpSync(resolve(app, 'psgc-registry.json'), resolve(backend, 'psgc-registry.json'))
cpSync(resolve(app, 'src/assets/flood-landmarks.json'), resolve(backend, 'flood-landmarks.json'))
cpSync(resolve(root, 'deploy/render-api/healthz.php'), resolve(backend, 'healthz.php'))
cpSync(resolve(app, 'dist'), pages, { recursive: true })
cpSync(resolve(here, 'worker.mjs'), resolve(pages, '_worker.js'))
writeFileSync(resolve(pages, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*', '/admin-api.php'], exclude: [] }, null, 2))
mkdirSync(resolve(pages, 'admin'), { recursive: true })
for (const name of ['index.html', 'App.js', 'style.css', 'admin-polish.css', 'psgc-registry.json', 'report-manager.js', 'collected-history.js', 'barangay-status.js', 'team-deployments.js', 'social-accounts.js', 'trusted-publishers.js', 'admin-search-selects.js', 'user-manager.js', 'admin-confirm.js', 'bahaba-logo.jpg', 'report-map.mjs', 'command-live-map.mjs', 'admin-flood-signals.mjs', 'report-severity.mjs', 'report-point.mjs', 'map-data', 'map-vendor']) {
  cpSync(resolve(stagedAdmin, name), resolve(pages, 'admin', name), { recursive: true })
}
// Only server sources, never local credentials or test-account seed scripts.
for (const name of ['bootstrap.php', 'password-recovery.php', 'forgot-password.php', 'reset-password.php', 'delete-account.php', 'request-account-deletion.php', 'confirm-account-deletion.php', 'config.example.php', 'index.php', 'location-data.php', 'location_helpers.php', 'psgc.php', 'push.php', 'push-device.php', 'push-dispatch.php', 'map-reports.php', 'flood-signals.php', 'notifications.php', 'resolve-location.php', 'municipality-boundaries.php', 'municipality-boundaries.json', 'municipality-geometry', 'login.php', 'logout.php', 'me.php', 'profile.php', 'report-retention.php', 'resend-verification.php', 'signup.php', 'verify.php', 'schema.sql', 'composer.json', 'composer.lock']) {
  cpSync(resolve(app, 'api', name), resolve(backend, 'api', name), { recursive: true })
}
cpSync(resolve(app, 'api/collected-summary.php'), resolve(backend, 'api/collected-summary.php'))
// Signup depends on PHPMailer at runtime. Include the locked dependency so
// Cloudflare/AlwaysData deployments do not require a separate server-side step.
cpSync(resolve(app, 'api/vendor'), resolve(backend, 'api/vendor'), { recursive: true })
cpSync(resolve(here, '../alwaysdata/config.example.php'), resolve(backend, 'api/config.example.php'))
for (const name of ['nlp-location.php', 'nlp-timestamps.php', 'report-point.php', 'report-management.php', 'nlp-threshold.php', 'expire-nlp-events.php', 'trusted-publishers.php', 'collected-history.php', 'team-deployments.php', 'social-accounts.php', 'team-barangays.json']) cpSync(resolve(stagedAdmin, name), resolve(backend, name))
cpSync(resolve(root, 'deploy/render-api/admin-source/nlp-flood-events.php'), resolve(backend, 'nlp-flood-events.php'))
cpSync(resolve(stagedAdmin, 'api.php'), resolve(backend, 'admin-api.php'))
cpSync(resolve(stagedAdmin, 'map-data'), resolve(backend, 'map-data'), { recursive: true })
writeFileSync(resolve(backend, '.htaccess'), 'Options -Indexes\n<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n')
writeFileSync(resolve(backend, 'api/.htaccess'), '<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n')
writeFileSync(resolve(output, '.gitignore'), '*\n')
console.log(`Prepared Cloudflare files: ${pages}\nPrepared AlwaysData PHP files: ${backend}`)
