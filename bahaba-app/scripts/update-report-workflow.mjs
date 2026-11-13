import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const admin=resolve(process.argv[2]||'bahaba-app/preview.local/full-admin');
for (const name of ['nlp-flood-events.php','expire-nlp-events.php']) copyFileSync(resolve(import.meta.dirname,'../../deploy/render-api/admin-source',name),resolve(admin,name));
copyFileSync(resolve(import.meta.dirname,'admin-report-map.mjs'),resolve(admin,'report-map.mjs'));
copyFileSync(resolve(import.meta.dirname,'admin-flood-signals.mjs'),resolve(admin,'admin-flood-signals.mjs'));
copyFileSync(resolve(import.meta.dirname,'report-severity.mjs'),resolve(admin,'report-severity.mjs'));
const index=resolve(admin,'index.html');
try {
  const html=readFileSync(index,'utf8');
  const updated=html
    .replace(/(src=["'])report-map\.mjs(?:\?[^"']*)?(["'])/,'$1report-map.mjs?v=20261106-severity-map$2')
    .replace(/(src=["'])report-manager\.js(?:\?[^"']*)?(["'])/,'$1report-manager.js?v=20261106-lgu-report-attribution$2');
  writeFileSync(index,updated);
} catch(error) { if (error.code !== 'ENOENT') throw error; }
for(const [source,target] of [['admin-report-management.php','report-management.php'],['admin-nlp-threshold.php','nlp-threshold.php'],['admin-report-manager.js','report-manager.js']])copyFileSync(resolve(import.meta.dirname,source),resolve(admin,target));
const file=resolve(admin,'App.js');
let app=readFileSync(file,'utf8');
app=app.replaceAll("canDeleteModule(session, 'approval_board')","canApproveModule(session, 'approval_board')");
app=app.replace('let list = REPORTS.filter(r => (r.city', "let list = REPORTS.filter(r => r.status !== 'rejected' && (r.city");
writeFileSync(file,app);
console.log('Updated report workflow in '+admin);
