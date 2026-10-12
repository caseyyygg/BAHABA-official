import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const admin=resolve(process.argv[2]||'bahaba-app/preview.local/full-admin');
copyFileSync(resolve(import.meta.dirname,'admin-report-map.mjs'),resolve(admin,'report-map.mjs'));
const index=resolve(admin,'index.html');
try {
  const html=readFileSync(index,'utf8');
  writeFileSync(index,html.replace(/(src=["'])report-map\.mjs(?:\?[^"']*)?(["'])/,'$1report-map.mjs?v=20261013-mapfix3$2'));
} catch(error) { if (error.code !== 'ENOENT') throw error; }
for(const [source,target] of [['admin-report-management.php','report-management.php'],['admin-nlp-threshold.php','nlp-threshold.php'],['admin-report-manager.js','report-manager.js']])copyFileSync(resolve(import.meta.dirname,source),resolve(admin,target));
const file=resolve(admin,'App.js');
let app=readFileSync(file,'utf8');
app=app.replaceAll("canDeleteModule(session, 'approval_board')","canApproveModule(session, 'approval_board')");
app=app.replace('let list = REPORTS.filter(r => (r.city', "let list = REPORTS.filter(r => r.status !== 'rejected' && (r.city");
writeFileSync(file,app);
console.log('Updated report workflow in '+admin);
