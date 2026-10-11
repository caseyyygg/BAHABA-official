import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {cpSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'recovery-threshold-test.local');
const fixture=action=>execFileSync('php',[resolve(import.meta.dirname,'test-report-actions-fixtures.php'),action],{encoding:'utf8'});
const state=action=>execFileSync('php',[resolve(import.meta.dirname,'test-recovery-threshold-fixtures.php'),action],{encoding:'utf8'});
mkdirSync(dir,{recursive:true});cpSync(resolve(root,'preview.local/full-admin'),dir+'/admin',{recursive:true});cpSync(resolve(root,'api'),dir+'/api',{recursive:true});for(const file of ['psgc-registry.json','location-config.json'])cpSync(resolve(root,file),dir+'/'+file);
const config="<?php return ['db'=>['dsn'=>'mysql:host=127.0.0.1;port=33317;dbname=bahaba_report_actions_test;charset=utf8mb4','username'=>'root','password'=>''],'frontend_origin'=>'http://127.0.0.1:33321','api_url'=>'http://127.0.0.1:33321/api','nlp_ingest_token'=>'isolated-test-token'];";
writeFileSync(dir+'/api.php',"<?php require __DIR__.'/admin/api.php';");writeFileSync(dir+'/api/config.php',config);writeFileSync(dir+'/admin/api/config.php',config);console.log(fixture('setup').trim());
const server=spawn('php',['-S','127.0.0.1:33321','-t',dir],{stdio:'ignore'});
function client(prefix='/admin/api.php'){let cookie='';return async(action,body,expected=200)=>{const response=await fetch('http://127.0.0.1:33321'+(prefix.endsWith('api.php')?prefix+'?action='+action:prefix+'/'+action),{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','Authorization':'Bearer isolated-test-token'},...(body?{body:JSON.stringify(body)}:{})});if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const text=await response.text();assert.equal(response.status,expected,text);return JSON.parse(text)}}
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:33321');break}catch{await new Promise(r=>setTimeout(r,100))}}
 const admin=client(),resident=client('/api'),oldAdmin=client(),oldResident=client('/api');
 await oldAdmin('login',{email:'miguel.torres@bahaba.ph',password:'Bahaba@2026'});await oldResident('login.php',{email:'pin-test@gmail.com',password:'FloodTest!26'});
 await admin('login',{email:'miguel.torres@bahaba.ph',password:'Bahaba@2026'});await resident('login.php',{email:'pin-test@gmail.com',password:'FloodTest!26'});
 await admin('forgot-password',{email:'not-an-email'},422);await admin('forgot-password',{email:'unconfigured@example.com'},503);await resident('forgot-password.php',{email:'unconfigured@gmail.com'},503);
 console.log(state('pending-account'));const pending=client('/api');await pending('login.php',{email:'pending-reset@gmail.com',password:'FloodTest!26'},403);await resident('reset-password.php',{token:'c'.repeat(64),password:'NewPendingPass!26'});console.log(state('activate-pending'));await pending('me.php',null,401);
 console.log(state('tokens'));await admin('reset-password',{token:'bad',password:'NewPassword!26'},422);await resident('reset-password.php',{token:'b'.repeat(64),password:'short'},422);
 await resident('reset-password.php',{token:'b'.repeat(64),password:'NewPassword!26'});await oldResident('profile.php',null,401);await resident('reset-password.php',{token:'b'.repeat(64),password:'OtherPassword!26'},422);await resident('login.php',{email:'pin-test@gmail.com',password:'FloodTest!26'},401);await resident('login.php',{email:'pin-test@gmail.com',password:'NewPassword!26'});
 await admin('reset-password',{token:'b'.repeat(64),password:'NewAdminPass!26'},422);await admin('reset-password',{token:'a'.repeat(64),password:'NewAdminPass!26'});await oldAdmin('users',null,401);await admin('login',{email:'miguel.torres@bahaba.ph',password:'Bahaba@2026'},401);await admin('login',{email:'miguel.torres@bahaba.ph',password:'NewAdminPass!26'});
 console.log(state('tokens'));console.log(state('expire'));await admin('reset-password',{token:'a'.repeat(64),password:'OtherPassword!26'},422);
 const ingest=client();const post=(id,extra={})=>ingest('nlp-ingest',{post_id:id,post_text:'Flood at Barangay San Jose, Navotas '+id,source:'Test',post_url:'https://example.com/posts/'+id,classification:'Flood',severity:'high',urgency:'concerned',confidence:0.98,location_id:'navotas',barangay:'San Jose',timestamp:new Date().toISOString(),...extra},201);
 for(let i=1;i<=19;i++){const result=await post('valid-'+i);assert.equal(result.pin_threshold.report_id,null);assert.equal(result.pin_threshold.eligible_posts,i)}
 assert.equal((await post('valid-1')).pin_threshold.eligible_posts,19,'Repeated post cannot count twice');
 assert.equal((await post('old',{timestamp:new Date(Date.now()-16*60000).toISOString()})).pin_threshold.eligible_posts,19);
 await post('nonflood',{classification:'Non-Flood'});await post('other-brgy',{barangay:'Daanghari'});await post('unknown',{location_id:undefined,city:'unknown',location:'unknown',barangay:undefined,post_text:'A flood somewhere'});
 const twentieth=await post('valid-20',{location_id:'1380900000'});assert.ok(twentieth.pin_threshold.report_id);for(let i=21;i<=42;i++)assert.equal((await post('valid-'+i)).pin_threshold.report_id,null,'One candidate per location window');
 console.log(state('nlp-check'));console.log('PASS minimum 20, rolling 15 minutes, distinct posts, non-flood/other/unmapped exclusion, duplicate prevention, reset expiry/one-use/password validation and separate account types');
 // Configure exact collector account identities only in this disposable fixture.
 const trustedConfig=config.replace("'nlp_ingest_token'=>", "'trusted_social_publishers'=>[['platform'=>'Test','publisher_id'=>'official-test-account','type'=>'government']],'nlp_ingest_token'=>");
 writeFileSync(dir+'/admin/api/config.php',trustedConfig);
 assert.equal((await post('fake-official',{publisher_id:'impostor',publisher_type:'government'})).pin_threshold.report_id,null);
 const official=await post('official-1',{publisher_id:'official-test-account'});
 assert.ok(official.pin_threshold.report_id,'One official post bypasses the threshold and cooldown');
 assert.equal((await post('official-1',{publisher_id:'official-test-account'})).pin_threshold.report_id,null,'Official retry cannot duplicate a pin');
 assert.equal((await post('official-nonflood',{publisher_id:'official-test-account',classification:'Non-Flood'})).pin_threshold.report_id,null);
 const {chromium,expect}=await import('@playwright/test');const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:33321/admin/',{waitUntil:'domcontentloaded'});await page.locator('#login-email').fill('miguel.torres@bahaba.ph');await page.locator('#login-password').fill('NewAdminPass!26');await page.locator('#auth-login button[type=submit]').click();await expect(page.locator('#app-shell')).toHaveClass(/active/);await page.locator('.sb-link[data-view="command"]').click();await expect(page.locator('#report-trends-panel .analytics-chart-card')).toHaveCount(3);await expect(page.locator('#report-trends-panel table')).toHaveCount(0);await expect(page.locator('#report-trends-panel progress')).toHaveCount(0);
 await page.locator('.sb-link[data-view="evacuees"]').click();const options=await page.locator('#evac-center-barangay option').allTextContents();assert.ok(options.length>1);await page.locator('#evac-center-barangay').selectOption({label:options[1]});
 const context=await browser.newContext();const lguPage=await context.newPage();await lguPage.goto('http://127.0.0.1:33321/admin/',{waitUntil:'domcontentloaded'});await lguPage.locator('#login-email').fill('bahaba.lgu.bulacan@example.com');await lguPage.locator('#login-password').fill('FloodTest!26');await lguPage.locator('#auth-login button[type=submit]').click();await expect(lguPage.locator('#app-shell')).toHaveClass(/active/);await lguPage.locator('.sb-link[data-view="evacuees"]').click();await expect(lguPage.locator('#evac-barangay-select')).toBeVisible();assert.ok(await lguPage.locator('#evac-center-barangay option').count()>500);const qualified=await lguPage.locator('#evac-center-barangay option').first().getAttribute('value');assert.ok(qualified.includes(' \u2014 '));await lguPage.locator('#evac-center-barangay').selectOption(qualified);await lguPage.locator('#evac-barangay-select').selectOption(qualified);await lguPage.locator('#evac-center-name').fill('Isolated barangay selector test');await lguPage.locator('#evac-center-capacity').fill('100');await lguPage.locator('#evac-create-form button[type=submit]').click();await expect(lguPage.locator('#evac-grid')).toContainText('Isolated barangay selector test');await context.close();
 console.log('PASS Command Center charts only, Bulacan duplicate names qualified by municipality, barangay selection and evacuation center save');
 }finally{await browser.close()}
}finally{server.kill();console.log(fixture('drop').trim())}
