import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {cpSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'collection-test.local');
const fixture=action=>execFileSync('php',[resolve(import.meta.dirname,'test-report-actions-fixtures.php'),action],{encoding:'utf8'});
mkdirSync(dir,{recursive:true});cpSync(resolve(root,'preview.local/full-admin'),dir+'/admin',{recursive:true});cpSync(resolve(root,'api'),dir+'/api',{recursive:true});
for(const file of ['psgc-registry.json','location-config.json'])cpSync(resolve(root,file),dir+'/'+file);
const config="<?php return ['db'=>['dsn'=>'mysql:host=127.0.0.1;port=33317;dbname=bahaba_report_actions_test;charset=utf8mb4','username'=>'root','password'=>''],'nlp_ingest_token'=>'isolated-test-token'];";
writeFileSync(dir+'/api/config.php',config);writeFileSync(dir+'/admin/api/config.php',config);
writeFileSync(dir+'/api.php',"<?php require __DIR__.'/admin/api.php';");
console.log(fixture('setup').trim());
const server=spawn('php',['-S','127.0.0.1:33323','-t',dir],{stdio:'ignore'});
const base='http://127.0.0.1:33323/admin/';let cookie='',csrf='';
async function request(action,body,expected=200,withCsrf=true){const r=await fetch(base+'api.php?action='+action,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json',...(csrf&&withCsrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];assert.equal(r.status,expected,await r.clone().text());return r;}
try{
 for(let i=0;i<40;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100))}}
 execFileSync('php',[resolve(import.meta.dirname,'test-collected-history-fixtures.php')]);
 await request('collected-summary&location=navotas',null,401);
 await request('login',{email:'bahaba.lgu.navotas@example.com',password:'FloodTest!26'});
 const pages=[];let before='',asOf='';do{const data=await (await request('nlp-events&location=navotas'+(before?'&before='+before+'&as_of='+asOf:''))).json();pages.push(...data.events);before=data.next_before;asOf=data.as_of;assert.equal(Number(data.stats.total),205);}while(before);
 assert.equal(pages.length,205);assert.equal(new Set(pages.map(p=>p.id)).size,205);
 let data=await (await request('collected-summary&location=navotas')).json();assert.equal(data.monthly.reduce((n,r)=>n+r.total,0),3);assert.equal(data.yearly.reduce((n,r)=>n+r.flood,0),2);assert.ok(data.monthly.some(r=>r.barangay==='Daanghari'));assert.ok(!data.rows.some(r=>r.total===205));
 await request('collected-summary&location=malolos',null,403);await request('collected-summary-export&location=malolos',null,403);await request('collected-summary&location=navotas&year=1999',null,422);
 csrf=(await (await request('team-deployments&location=navotas')).json()).csrf;
 const team={location_id:'navotas',barangay:'San Jose',name:'Isolated rescue team',personnel:6,status:'deployed'};
 await request('team-deployment-save',team,403,false);await request('team-deployment-save',{...team,personnel:-1},422);await request('team-deployment-save',{...team,barangay:'Invented barangay'},422);
 const saved=await (await request('team-deployment-save',team)).json();assert.ok(saved.id);
 await request('team-deployment-save',{...team,id:saved.id,location_id:'malolos'},403);
 await request('team-deployment-delete',{id:saved.id,location_id:'malolos'},403);
 await request('team-deployment-save',{...team,id:saved.id,status:'standby'});assert.equal((await (await request('team-deployments&location=navotas')).json()).teams[0].status,'standby');
 await request('team-deployment-delete',{id:saved.id,location_id:'navotas'});assert.equal((await (await request('team-deployments&location=navotas')).json()).teams.length,0);
 csrf=(await (await request('report-management-session')).json()).csrf;assert.equal((await (await request('managed-reports')).json()).can_delete,true);await request('report-delete',{id:2},403);await request('report-delete',{id:1});assert.equal((await (await request('managed-reports')).json()).total,0);
 const exportResponse=await request('collected-summary-export&location=navotas');assert.match(exportResponse.headers.get('content-type'),/spreadsheetml/);const workbook=Buffer.from(await exportResponse.arrayBuffer());assert.equal(workbook.subarray(0,2).toString(),'PK');writeFileSync(dir+'/summary.xlsx',workbook);
 const php="$z=new ZipArchive();if($z->open($argv[1])!==true)exit(1);foreach(['xl/workbook.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml','xl/worksheets/sheet3.xml','xl/worksheets/sheet4.xml'] as $f){$s=$z->getFromName($f);if(!$s||!simplexml_load_string($s))exit(2);}echo 'PASS valid XLSX XML and four worksheets';";console.log(execFileSync('php',['-r',php,dir+'/summary.xlsx'],{encoding:'utf8'}));
 const {chromium,expect}=await import('@playwright/test');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base);await page.locator('#login-email').fill('bahaba.lgu.navotas@example.com');await page.locator('#login-password').fill('FloodTest!26');await page.locator('#auth-login button[type=submit]').click();await expect(page.locator('#app-shell')).toHaveClass(/active/);await page.locator('.sb-link[data-view="reports"]').click();await expect.poll(()=>page.evaluate(()=>NLP_EVENTS.length)).toBe(205);await page.locator('.sb-link[data-view="summary"]').click();await expect(page.locator('#collection-tables')).toContainText('Daanghari');await expect(page.locator('#collection-tables table')).toHaveCount(2);const downloadPromise=page.waitForEvent('download');await page.locator('#collection-export').click();assert.match((await downloadPromise).suggestedFilename(),/\.xlsx$/);await page.screenshot({path:dir+'/summary.png',fullPage:true});}finally{await browser.close()}
 console.log('PASS complete 24-hour feed, monthly/yearly rollups, preserved source records, Excel download, scoped editor report deletion, team CRUD/CSRF/location validation and summary UI');
}finally{server.kill();console.log(fixture('drop').trim())}
