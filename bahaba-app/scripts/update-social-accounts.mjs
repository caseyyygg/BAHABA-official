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
for (const [source, destination] of [['admin-social-accounts.php', 'social-accounts.php'], ['admin-social-accounts.js', 'social-accounts.js'], ['admin-trusted-publishers.js', 'trusted-publishers.js']]) {
  copyFileSync(resolve(import.meta.dirname, source), resolve(admin, destination));
}
const apiPath = resolve(admin, 'api.php');
let api = readFileSync(apiPath, 'utf8');
const canonicalApi = readFileSync(resolve(import.meta.dirname, '../../deploy/render-api/admin-source/api.php'), 'utf8');
const oldFeedStart = api.indexOf("if ($method === 'GET' && $action === 'nlp-events') {");
const newFeedStart = api.indexOf("if ($method === 'GET' && in_array($action, ['nlp-events', 'nlp-progress', 'nlp-posts'], true)) {");
const feedStart = oldFeedStart >= 0 ? oldFeedStart : newFeedStart;
const feedEnd = api.indexOf("if ($method === 'GET' && $action === 'users') {", feedStart);
const referenceStart = canonicalApi.indexOf("if ($method === 'GET' && in_array($action, ['nlp-events', 'nlp-progress', 'nlp-posts'], true)) {");
const referenceEnd = canonicalApi.indexOf("if ($method === 'GET' && $action === 'users') {", referenceStart);
if (feedStart < 0 || feedEnd < 0 || referenceStart < 0 || referenceEnd < 0) throw Error('NLP feed routing could not be located; inspect API before packaging.');
api = api.slice(0, feedStart) + canonicalApi.slice(referenceStart, referenceEnd) + api.slice(feedEnd);
api = api.replace("['required_posts'=>20,'window_minutes'=>15,'eligible_posts'=>0,'report_id'=>null]", "['required_posts'=>15,'window_minutes'=>20,'eligible_posts'=>0,'report_id'=>null]");
if (!api.includes("require_once __DIR__ . '/social-accounts.php';")) api = api.replace("require_once __DIR__ . '/team-deployments.php';", "require_once __DIR__ . '/team-deployments.php';\nrequire_once __DIR__ . '/social-accounts.php';");
if (!api.includes("require_once __DIR__ . '/trusted-publishers.php';")) api = api.replace("require_once __DIR__ . '/social-accounts.php';", "require_once __DIR__ . '/social-accounts.php';\nrequire_once __DIR__ . '/trusted-publishers.php';");
copyFileSync(resolve(import.meta.dirname,'../../deploy/render-api/admin-source/trusted-publishers.php'),resolve(admin,'trusted-publishers.php'));
writeFileSync(apiPath, api);
const htmlPath = resolve(admin, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const socialScript = '<script src="social-accounts.js?v=20261017-city-events"></script>';
if (html.includes('src="social-accounts.js')) html = html.replace(/<script\s+src="social-accounts\.js(?:\?[^\"]*)?"><\/script>/, socialScript);
else html = html.replace('</body>', `${socialScript}\n</body>`);
if (!html.includes('src="trusted-publishers.js')) html=html.replace(socialScript,socialScript+'\n<script src="trusted-publishers.js?v=20261017-city-events"></script>');
writeFileSync(htmlPath, html);
console.log('Installed LGU social account controls. Browser service configuration is required to enable sign-in.');
