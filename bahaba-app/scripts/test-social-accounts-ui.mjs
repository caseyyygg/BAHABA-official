import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel:'chrome', headless:true });
try {
  const page = await browser.newPage();
  await page.setContent('<section id="view-nlp-api"><p id="nlp-login-setup"></p><div class="collector-status-grid"></div><p></p><p id="nlp-connections-message"></p><div id="nlp-connections-status"></div></section>');
  await page.evaluate(() => {
    window.session = {role:'lgu-admin'};
    window.currentAdminLocationId = () => 'bulacan';
    window.ADMIN_API_URL = '/api.php';
    window.nlpServiceHealth = {lgu_social_collectors:{'bulacan:Facebook':{connected:true,posts_processed:4}}};
    window.renderNlpConnections = async () => {};
    window.requests = [];
    window.fetch = async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : null;
      window.requests.push({url,body});
      return {ok:true,json:async () => body ? {cancelled:true} : {available:true,can_edit:true,csrf:'test-csrf',accounts:[{platform:'Facebook',connected:true}]}};
    };
  });
  await page.addScriptTag({path:new URL('./admin-social-accounts.js',import.meta.url).pathname.replace(/^\/(\w:)/,'$1')});
  await page.evaluate(() => window.renderNlpConnections());
  assert.equal(await page.getByRole('button',{name:'Switch account'}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Disconnect',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).count(),2);
  assert.equal(await page.getByText('4 posts analyzed by this LGU collector this session.').count(),1);
  await page.getByRole('button',{name:'Switch account'}).click();
  await page.waitForFunction(() => document.querySelector('dialog[open]') && window.requests.some(r=>r.body?.operation==='start'));
  const start = await page.evaluate(() => window.requests.find(r=>r.body?.operation==='start').body);
  assert.equal(start.location_id,'bulacan');
  assert.equal(start.platform,'Facebook');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.waitForFunction(() => window.requests.some(r=>r.body?.operation==='cancel'));
  assert.equal(await page.locator('dialog[open]').count(),0);
  console.log('Social account UI checks passed: scoped cards, monitoring, switching, and cancellation.');
} finally { await browser.close(); }
