import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const page = await browser.newPage();
  await page.setContent('<section id="view-nlp-api"><p id="nlp-login-setup"></p><div class="collector-status-grid"></div><p></p><p id="nlp-connections-message"></p><div id="nlp-connections-status"></div></section>');
  await page.evaluate(() => {
    window.session = {role:'platform-admin'};
    window.currentAdminLocationId = () => 'bulacan';
    window.ADMIN_API_URL = '/api.php';
    window.nlpServiceHealth = {lgu_social_collectors:{'bulacan:Facebook':{connected:true,posts_processed:4}}};
    window.renderNlpConnections = async () => {};
    window.allNlpServiceHealth = {lgu_social_collectors:{'navotas:X':{connected:true,posts_processed:3},'bulacan:X':{connected:true,posts_processed:4},'navotas:Threads':{connected:true,posts_processed:0}}};
    window.allReportsFeedError = ''; window.allNlpIngestionConfigured = true; window.ALL_NLP_EVENTS = [];
    window.renderAllNlpMonitor = () => {document.getElementById('all-nlp-feed-alert').textContent='Waiting for Meta setup';};
    window.requests = [];
    window.fetch = async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null;
      window.requests.push({url,body});
      return {ok:true,json:async () => body ? {cancelled:true} : {available:true,can_edit:true,csrf:'test-csrf',accounts:[{platform:'Facebook',connected:true}]}};
    };
  });
  await page.evaluate(() => {const holder=document.createElement('div');holder.innerHTML='<div id="all-nlp-collector-statuses"></div><span id="all-nlp-live-label"></span><span id="all-nlp-live-badge"></span><p id="all-nlp-feed-alert"></p><table><tbody id="all-nlp-events-list"></tbody></table>';document.body.append(holder);});
  await page.addScriptTag({path:new URL('./admin-social-accounts.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
  await page.evaluate(() => window.renderNlpConnections());
  assert.equal(await page.getByRole('button',{name:'Replace cookies',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Submit cookies',exact:true}).count(),2);
  assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).count(),0);
  assert.equal(await page.locator('.platform-cookie-form').count(),3);
  await page.locator('.platform-cookie-form').first().locator('input[name="cookies"]').fill('c_user=test; xs=test-session');
  await page.getByRole('button',{name:'Replace cookies',exact:true}).click();
  await page.waitForFunction(() => window.requests.some(r=>r.body?.operation==='import-session'));
  const submitted = await page.evaluate(() => window.requests.find(r=>r.body?.operation==='import-session').body);
  assert.equal(submitted.location_id,'bulacan');
  assert.equal(submitted.platform,'Facebook');
  assert.equal(JSON.parse(submitted.text),'c_user=test; xs=test-session');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.equal(await page.locator('dialog[open]').count(),0);
  await page.evaluate(() => window.renderAllNlpMonitor());
  assert.equal(await page.locator('#all-nlp-live-label').textContent(),'Accounts connected');
  assert.match(await page.locator('#all-nlp-collector-statuses').textContent(),/7 posts analyzed across all locations/);
  assert.doesNotMatch(await page.locator('#all-nlp-feed-alert').textContent(),/Meta|webhook/);
  await page.evaluate(() => {window.allNlpServiceHealth={};window.renderAllNlpMonitor();});
  assert.equal(await page.locator('#all-nlp-live-label').textContent(),'Collector status unavailable');
  assert.doesNotMatch(await page.locator('#all-nlp-events-list').textContent(),/Meta|webhook/);
  console.log('Social account UI checks passed: cookie controls, scoped submission, and dialog completion.');
} finally { await browser.close(); }
