import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const admin=resolve(process.argv[2]||resolve(import.meta.dirname,'../preview.local/full-admin'));
for(const [from,to] of [['admin-collected-history.php','collected-history.php'],['admin-collected-history.js','collected-history.js']])copyFileSync(resolve(import.meta.dirname,from),resolve(admin,to));
// API include is after authentication helper declarations and request parsing.
const api=resolve(admin,'api.php');let php=readFileSync(api,'utf8');
if(!php.includes("require_once __DIR__ . '/collected-history.php';"))php=php.replace("require_once __DIR__ . '/report-management.php';","require_once __DIR__ . '/report-management.php';\nrequire_once __DIR__ . '/collected-history.php';");
php=php.replace('FROM nlp_events ORDER BY detected_at DESC, id DESC LIMIT 500', 'FROM nlp_events WHERE received_at >= UTC_TIMESTAMP() - INTERVAL 24 HOUR ORDER BY detected_at DESC, id DESC');
const start=php.indexOf('        $nlp = $pdo->prepare("SELECT DATE_FORMAT(received_at');
if(start>=0){const end=php.indexOf("        echo json_encode(",start);php=php.slice(0,start)+"        require_once $sharedApiDirectory.'/collected-summary.php';\n        $nlpRows=bahaba_collected_rows($pdo,$location['id'], !is_platform_admin($admin) && !empty($admin['barangay']) && $admin['barangay']!=='All barangays' ? $admin['barangay'] : '');\n"+php.slice(end);php=php.replace("'nlpRows' => $nlp->fetchAll()","'nlpRows' => $nlpRows");}
writeFileSync(api,php);
const appFile=resolve(admin,'App.js');let app=readFileSync(appFile,'utf8');
// Read all pages in the frozen 24-hour snapshot; no silent 100-row truncation.
const needle="    NLP_EVENTS = Array.isArray(payload.events) ? payload.events : [];";
if(!app.includes('payload.next_before'))app=app.replace(needle,`    const collectedEvents=Array.isArray(payload.events)?payload.events:[];
    let before=payload.next_before;
    while(before){
      params.set('before',before);params.set('as_of',payload.as_of);
      const nextResponse=await fetch(ADMIN_API_URL+'?'+params,{credentials:'include'});
      const next=await nextResponse.json();if(!nextResponse.ok)throw Error(next.error||'Could not load remaining posts.');
      collectedEvents.push(...next.events);before=next.next_before;
    }
    NLP_EVENTS=collectedEvents;`);
app=app.replace('Collected posts are separate from submitted reports and should not be added to report totals. NLP data covers records currently available in the collector database; report history includes permanent monthly summaries.', 'Posts collected more than 24 hours ago are summarized here for the latest 12 months. Collection history below provides calendar-year selection and Excel export. Post totals are separate from verified report totals.');
writeFileSync(appFile,app);
const htmlFile=resolve(admin,'index.html');let html=readFileSync(htmlFile,'utf8');if(!html.includes('src="collected-history.js'))html=html.replace('</body>','<script src="collected-history.js"></script>\n</body>');writeFileSync(htmlFile,html);
// Local full-admin has a separate shared API copy.
if(existsSync(resolve(admin,'api')))copyFileSync(resolve(import.meta.dirname,'../api/collected-summary.php'),resolve(admin,'api/collected-summary.php'));
console.log('Updated 24-hour feed, collection summaries and Excel export in '+admin);
