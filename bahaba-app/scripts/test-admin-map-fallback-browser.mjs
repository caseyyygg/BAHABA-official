import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 await page.addInitScript(()=>localStorage.setItem('bahaba-shade-unknown-barangays','false'));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/admin/report-map.mjs',route=>route.fulfill({contentType:'text/javascript',path:fileURLToPath(new URL('./admin-report-map.mjs',import.meta.url))}));
 await page.route('**/admin/admin-flood-signals.mjs',route=>route.fulfill({contentType:'text/javascript',path:fileURLToPath(new URL('./admin-flood-signals.mjs',import.meta.url))}));
 await page.route('**/admin/report-severity.mjs',route=>route.fulfill({contentType:'text/javascript',path:fileURLToPath(new URL('./report-severity.mjs',import.meta.url))}));
 await page.route('**/admin/map-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><link rel="stylesheet" href="/admin/map-vendor/leaflet.css"><style>#lgu-report-map{height:500px;width:800px}</style><div class="lgu-report-map-layout"><span id="lgu-report-map-scope"></span><div id="lgu-report-map"></div><form id="lgu-map-report-form"><select id="lgu-map-barangay"></select><select id="lgu-map-severity"><option value="low">Low</option></select><textarea id="lgu-map-description"></textarea><button type="submit">Submit</button></form><p id="lgu-map-report-message"></p></div><script type="module">window.addEventListener('bahaba-reports-map-ready',()=>{window.dispatchEvent(new CustomEvent('bahaba-reports-map',{detail:{locationId:'navotas',canReport:true,reports:[]}}));window.dispatchEvent(new CustomEvent('bahaba-admin-social-reports',{detail:{locationId:'navotas',events:[{source:'X',source_post_id:'linked-post',classification:'Flood',post_text:'TUMATAAS NA PO ANG TUBIG BAHA DAANGHARI NAVOTAS',published_at:new Date(Date.now()-60000).toISOString(),severity:'Low'}]}}));});</script><script type="module" src="/admin/report-map.mjs"></script>`}));
 await page.route('**/api.php?**',route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='nlp-progress')return route.fulfill({json:{pins:[{barangay_feature_id:'unmatched',label:'Other barangay',precision_level:'barangay',post_count:1}],cities:[]}});
  return route.fulfill({json:{events:[{source:'X',source_post_id:'linked-post',classification:'Flood',post_text:'TUMATAAS NA PO ANG TUBIG BAHA DAANGHARI NAVOTAS',published_at:new Date(Date.now()-60000).toISOString(),severity:'Low'}]}});
 });
 await page.route('https://**',route=>route.abort());
 await page.goto('http://127.0.0.1:33322/admin/map-test');
 await expect(page.locator('#lgu-map-signal-status')).toContainText('Daanghari',{timeout:15000});
 const shaded=page.locator('path[fill="#15803d"][fill-opacity="0.28"]');
 await expect(shaded).toHaveCount(1);
 await expect(page.locator('path[fill="#fbbf24"][fill-opacity="0.8"]')).toHaveCount(0);
 assert.deepEqual(errors,[]);
 console.log('PASS browser: classified flood post shades Daanghari even when nlp-progress returns unrelated pins and legacy shade preference is false');
}finally{await browser.close()}
