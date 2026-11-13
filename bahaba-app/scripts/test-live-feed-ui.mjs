import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from '@playwright/test';
import {patchLiveFeed} from './admin-live-feed.mjs';

const source = resolve(process.argv[2] || resolve(import.meta.dirname, '../preview.local/full-admin'));
const originalApp = readFileSync(resolve(source,'App.js'),'utf8').replace(/\r\n/g,'\n');
const originalHtml = readFileSync(resolve(source,'index.html'),'utf8');
const patched = patchLiveFeed(originalApp,originalHtml);
assert.deepEqual(patchLiveFeed(patched.app,patched.html),patched,'Generation must be idempotent');
assert.equal((patched.app.match(/function formatNlpTime\(/g) || []).length,1);
assert.ok(!patched.html.includes('<th>DETECTED</th>'));
assert.match(patched.html,/COLLECTED \/ PUBLISHED \(PHT\)/);
const localRenderer = patched.app.slice(patched.app.indexOf('function renderNlpMonitor(){'),patched.app.indexOf('async function refreshNlpEvents(){'));
const allRenderer = patched.app.slice(patched.app.indexOf('function renderAllNlpMonitor(){'),patched.app.indexOf('function renderAllReports(){'));
const helpers = readFileSync(new URL('admin-live-feed.js',import.meta.url),'utf8');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser = await chromium.launch({...(chrome ? {executablePath:chrome}:{}),headless:true});
try {
  const page = await browser.newPage({timezoneId:'America/Los_Angeles',viewport:{width:1200,height:900}});
  await page.setContent(`
    <select id="reports-barangay-select"><option>All barangays</option><option>San Jose</option></select>
    <div id="nlp-stats"></div><span id="nlp-results-count"></span>
    <div class="nlp-events-wrap"><table><tbody id="nlp-events-list"></tbody></table></div>
    <div id="all-nlp-stats"></div><span id="all-nlp-results-count"></span>
    <div class="nlp-events-wrap"><table><tbody id="all-nlp-events-list"></tbody></table></div>`);
  await page.addScriptTag({content:`
    var session={};var NLP_EVENTS=[];var ALL_NLP_EVENTS=[];var NLP_STATS={};var ALL_NLP_STATS={};
    var nlpServiceHealth={};var allNlpServiceHealth={};var allNlpIngestionConfigured=true;
    var nlpFeedStatus='live';var nlpFeedMessage='';var nlpLastUpdated='now';var nlpIngestionConfigured=true;
    var allReportsFeedError='';var allReportsLastUpdated='now';
    function currentCity(){return 'Navotas City'}
    function normalizedPlace(value){return String(value||'').toLowerCase().replace(/ city$/,'')}
    function renderCollectorStatuses(){}function socialCollectorMessage(){return ''}
    function socialCollectorBadge(){return ''}function safeSocialPostUrl(){return ''}
    function escapeNlpText(value){return String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
    ${helpers}\n${localRenderer}\n${allRenderer}
  `});
  const rows = Array.from({length:23},(_,index)=>({id:index+1,source:'X',post_text:'Flood report '+(index+1),city:'Navotas City',barangay:index<5?'San Jose':'Daanghari',classification:'Flood',severity:'High',urgency:'Concerned',confidence_percent:91,received_at:`2026-10-24 10:${String(index).padStart(2,'0')}:00`,published_at:index===22?'2026-10-24T10:21:00Z':null,detected_at:'2026-11-09 11:29:00'}));
  await page.evaluate(rows=>{NLP_EVENTS=rows;ALL_NLP_EVENTS=rows;renderNlpMonitor();renderAllNlpMonitor();},rows);
  for(const prefix of ['nlp','all-nlp']){
    const table = page.locator('#'+prefix+'-events-list');
    const pager = page.locator('#'+prefix+'-pagination');
    assert.equal(await table.locator('tr').count(),10);
    assert.match(await table.locator('tr').first().textContent(),/Flood report 23/);
    assert.match(await table.locator('tr').first().textContent(),/Oct 24, 2026.*6:22:00 pm/i,'UTC SQL timestamps must render in Philippine time regardless of browser timezone');
    assert.match(await table.locator('tr').first().textContent(),/Published:.*6:21:00 pm/i);
    assert.match(await table.locator('tr').nth(1).textContent(),/Publication time unavailable/);
    assert.doesNotMatch(await table.textContent(),/9 Nov|Nov 9/,'Legacy detection timestamps must never masquerade as a publication date');
    assert.equal(await table.locator('tr').first().locator('time').first().getAttribute('datetime'),'2026-10-24T10:22:00.000Z');
    await pager.getByRole('button',{name:'Next',exact:true}).click();
    assert.match(await pager.textContent(),/Page 2 of 3/);
    assert.equal(await table.locator('tr').count(),10);
    assert.match(await table.locator('tr').first().textContent(),/Flood report 13/);
    await page.evaluate(prefix=>prefix==='nlp'?renderNlpMonitor():renderAllNlpMonitor(),prefix);
    assert.match(await pager.textContent(),/Page 2 of 3/,'Polling must preserve selected page');
    await pager.getByRole('button',{name:'Next',exact:true}).click();
    assert.equal(await table.locator('tr').count(),3);
    assert.equal(await pager.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
    await pager.getByRole('button',{name:'Previous',exact:true}).click();
    assert.match(await pager.textContent(),/Page 2 of 3/);
  }
  await page.selectOption('#reports-barangay-select','San Jose');
  await page.evaluate(()=>renderNlpMonitor());
  assert.equal(await page.locator('#nlp-events-list tr').count(),5);
  assert.equal(await page.locator('#nlp-pagination').isVisible(),false);
  assert.match(await page.locator('#nlp-events-list tr').first().textContent(),/Flood report 5/);
  await page.selectOption('#reports-barangay-select','All barangays');
  await page.evaluate(()=>{NLP_EVENTS.push({...NLP_EVENTS[0],id:24,post_text:'New real-time flood report',received_at:'2026-10-24T10:24:00Z'});renderNlpMonitor()});
  assert.match(await page.locator('#nlp-events-list tr').first().textContent(),/New real-time flood report/);
  assert.equal(await page.locator('#nlp-events-list tr').count(),10);
  await page.evaluate(()=>{NLP_EVENTS=[];ALL_NLP_EVENTS=[];renderNlpMonitor();renderAllNlpMonitor()});
  assert.equal(await page.locator('#nlp-pagination').isVisible(),false);
  assert.equal(await page.locator('#all-nlp-pagination').isVisible(),false);
  assert.match(await page.locator('#nlp-events-list').textContent(),/Waiting for matching posts/);
  console.log('PASS generation idempotency, local and all-location ten-row pagination, filter changes, refresh retention, newest-first collection, explicit Philippine timestamps, unknown publication dates, and empty feed');
} finally {await browser.close()}
