import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 950 } });
  await page.route('https://fixture.invalid/**', route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const payload = action === 'social-accounts' ? {available:true,can_edit:true,csrf:'test',accounts:[{platform:'Facebook',connected:true}]} :
      action === 'nlp-progress' ? {required_posts:15,window_minutes:20,inactivity_minutes:60,server_time:new Date().toISOString(),
        cities:[{city_name:'Navotas City',phase:'ACTIVE',post_count:1,event_post_count:29,last_post_at:new Date().toISOString().slice(0,19).replace('T',' ')}],
        pins:[{label:'San Jose',precision_level:'barangay',post_count:7,severity:'High',latest_post_at:'2026-10-17 00:00:00'}],history:[],note:'Reported flooding; not officially verified.'} :
      {events:[{source:'X',post_text:'Budget discussion, not flooding',classification:'Non-Flood',city:'Navotas City',barangay:'',post_url:'https://x.com/i/web/status/123'}],pagination:{total:101,offset:Number(url.searchParams.get('offset')),limit:50}};
    return route.fulfill({json:payload});
  });
  await page.setContent('<div id="view-nlp-api"><div class="view-head"></div><div class="panel"><p id="nlp-login-setup"></p><div class="collector-status-grid"></div><p></p></div><div class="panel"><div id="nlp-connections-status"></div><p id="nlp-connections-message"></p></div><div class="panel"><div id="nlp-collector-statuses"></div></div></div>');
  await page.addScriptTag({content:`var session={};var ADMIN_API_URL='https://fixture.invalid/admin-api.php';var nlpServiceHealth={x_provider:'official',x_official_api_configured:true,x_official_polling_enabled:false,lgu_social_collectors:{}};function currentAdminLocationId(){return 'navotas'}function currentCity(){return 'Navotas City'}function renderNlpConnections(){}function renderNlpMonitor(){}function renderCollectorStatuses(){}function socialCollectorMessage(){return ''}function socialCollectorBadge(){return ''}`});
  await page.addScriptTag({content:readFileSync(new URL('admin-social-accounts.js',import.meta.url),'utf8')});
  await page.evaluate(async()=>{await renderNlpConnections();renderNlpMonitor();});
  await page.getByRole('button',{name:'Connect X',exact:true}).click();
  assert.equal(await page.locator('dialog[open]').count(),1,'X must support saved-session login even with old official-provider health');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Connect Threads',exact:true}).click();
  await page.getByRole('textbox',{name:'Email, phone, or username',exact:true}).fill('fixture-user');
  await page.getByRole('button',{name:'Fill email',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Email, phone, or username',exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByText('Navotas City: ACTIVE · 29 posts in this event',{exact:true}).waitFor();
  assert.equal(await page.locator('#nlp-event-progress progress').getAttribute('value'),'15','Active event progress must not reset with rolling count');
  await page.getByRole('button',{name:'Posts',exact:true}).click();
  await page.getByText('Budget discussion, not flooding',{exact:false}).waitFor();
  await page.getByRole('cell',{name:'Non-Flood',exact:true}).waitFor();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByText('101 collected posts · Page 2',{exact:true}).waitFor();
  mkdirSync('deploy/cloudflare/output/test-evidence',{recursive:true});
  await page.screenshot({path:'deploy/cloudflare/output/test-evidence/posts-tab.png',fullPage:true});
  console.log('PASS X and Threads session controls, private input clearing, continuous active-event progress, Posts tab, and pagination');
} finally { await browser.close(); }
