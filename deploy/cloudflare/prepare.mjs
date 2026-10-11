import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const app = resolve(root, 'bahaba-app')
const admin = process.argv[2]
if (!admin) throw new Error('Pass the absolute admin source directory as the first argument.')
execFileSync(process.execPath, [resolve(app, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: app, stdio: 'inherit', env: { ...process.env, VITE_API_URL: '/api' },
})
const output = resolve(here, 'output')
const pages = resolve(output, 'pages')
const backend = resolve(output, 'php-host')
mkdirSync(pages, { recursive: true })
mkdirSync(resolve(backend, 'api'), { recursive: true })
cpSync(resolve(app, 'location-config.json'), resolve(backend, 'location-config.json'))
cpSync(resolve(app, 'dist'), pages, { recursive: true })
cpSync(resolve(here, 'worker.mjs'), resolve(pages, '_worker.js'))
writeFileSync(resolve(pages, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*', '/admin-api.php'], exclude: [] }, null, 2))
mkdirSync(resolve(pages, 'admin'), { recursive: true })
for (const name of ['index.html', 'App.js', 'style.css', 'report-map.mjs', 'report-point.mjs', 'map-data', 'map-vendor']) {
  cpSync(resolve(admin, name), resolve(pages, 'admin', name), { recursive: true })
}
// Only server sources, never local credentials or test-account seed scripts.
for (const name of ['bootstrap.php', 'config.example.php', 'index.php', 'location-data.php', 'location_helpers.php', 'login.php', 'logout.php', 'me.php', 'profile.php', 'report-retention.php', 'resend-verification.php', 'signup.php', 'verify.php', 'schema.sql', 'composer.json', 'composer.lock']) {
  cpSync(resolve(app, 'api', name), resolve(backend, 'api', name))
}
for (const name of ['nlp-location.php', 'report-point.php']) cpSync(resolve(admin, name), resolve(backend, name))
cpSync(resolve(admin, 'api.php'), resolve(backend, 'admin-api.php'))
cpSync(resolve(admin, 'map-data'), resolve(backend, 'map-data'), { recursive: true })
writeFileSync(resolve(backend, '.htaccess'), '<FilesMatch "^(config(\\.example)?\\.php|schema\\.sql|composer\\.(json|lock))$">\nRequire all denied\n</FilesMatch>\n')
writeFileSync(resolve(output, '.gitignore'), '*\n')
console.log(`Prepared Cloudflare files: ${pages}\nPrepared PHP files: ${backend}`)
