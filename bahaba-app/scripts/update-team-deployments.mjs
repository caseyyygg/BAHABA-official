import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const admin=resolve(process.argv[2]||resolve(import.meta.dirname,'../preview.local/full-admin'));
copyFileSync(resolve(import.meta.dirname,'admin-barangays.json'),resolve(admin,'team-barangays.json'));
for(const [from,to] of [['admin-team-deployments.php','team-deployments.php'],['admin-team-deployments.js','team-deployments.js']])copyFileSync(resolve(import.meta.dirname,from),resolve(admin,to));
const apiFile=resolve(admin,'api.php');let php=readFileSync(apiFile,'utf8');if(!php.includes("require_once __DIR__ . '/team-deployments.php';"))php=php.replace("require_once __DIR__ . '/report-management.php';","require_once __DIR__ . '/report-management.php';\nrequire_once __DIR__ . '/team-deployments.php';");writeFileSync(apiFile,php);
const htmlFile=resolve(admin,'index.html');let html=readFileSync(htmlFile,'utf8');if(!html.includes('src="team-deployments.js'))html=html.replace('</body>','<script src="team-deployments.js?v=20261012-workflow2"></script>\n</body>');
html=html.replace(/(src="(?:App\.js|report-manager\.js|collected-history\.js|barangay-status\.js|report-map\.mjs))(?:\?[^"\s]*)?"/g,'$1?v=20261012-workflow2"');writeFileSync(htmlFile,html);
console.log('Updated team deployments and asset versions in '+admin);
