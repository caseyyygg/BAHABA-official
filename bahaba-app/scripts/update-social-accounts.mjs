import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const admin = resolve(process.argv[2]);
for (const [source, destination] of [['admin-scoped-collectors.py','scoped_collectors.py'], ['admin-social-browser.py','social_browser.py'], ['admin-x-agent-reach.py','x_agent_reach.py']]) {
  copyFileSync(resolve(import.meta.dirname,source),resolve(admin,'nlp-service',destination));
}
const nlpPath = resolve(admin,'nlp-service','app.py');
let nlp = readFileSync(nlpPath,'utf8');
if (!nlp.includes('import scoped_collectors')) nlp = nlp.replace('import social_collectors','import social_collectors\nimport scoped_collectors');
if (!nlp.includes('scoped_collectors.start(')) nlp = nlp.replace('    social_collectors.start(collector_stop,', '    scoped_collectors.start(collector_stop, lambda payload: _detect_and_forward(DetectionRequest(**payload)), _load_seen_post_ids, _save_seen_post_ids)\n    social_collectors.start(collector_stop,');
if (!nlp.includes('"lgu_social_collectors":')) nlp = nlp.replace('"social_browser_collectors": social_collectors.health(),', '"social_browser_collectors": social_collectors.health(),\n        "lgu_social_collectors": scoped_collectors.health(),');
writeFileSync(nlpPath,nlp);
for (const [source, destination] of [['admin-social-accounts.php', 'social-accounts.php'], ['admin-social-accounts.js', 'social-accounts.js']]) {
  copyFileSync(resolve(import.meta.dirname, source), resolve(admin, destination));
}
const apiPath = resolve(admin, 'api.php');
let api = readFileSync(apiPath, 'utf8');
if (!api.includes("require_once __DIR__ . '/social-accounts.php';")) api = api.replace("require_once __DIR__ . '/team-deployments.php';", "require_once __DIR__ . '/team-deployments.php';\nrequire_once __DIR__ . '/social-accounts.php';");
writeFileSync(apiPath, api);
const htmlPath = resolve(admin, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
if (!html.includes('src="social-accounts.js')) html = html.replace('</body>', '<script src="social-accounts.js?v=20261012"></script>\n</body>');
writeFileSync(htmlPath, html);
console.log('Installed LGU social account controls. Browser service configuration is required to enable sign-in.');
