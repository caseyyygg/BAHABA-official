import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval;
    window.setInterval = (callback, delay, ...args) => {
      if (delay === 15000) window.__adminRefreshTick = callback;
      return nativeSetInterval(callback, delay, ...args);
    };
  });
  const requestedLocations = [];
  await page.route('**/admin/report-manager.js', route => route.fulfill({
    contentType:'text/javascript; charset=utf-8',
    path:fileURLToPath(new URL('./admin-report-manager.js',import.meta.url)),
  }));
  await page.route('**/admin/manager-test', route => route.fulfill({contentType:'text/html',body:`<!doctype html>
    <select id="reports-location-select"><option value="navotas" selected>Navotas</option><option value="manila">Manila</option></select>
    <section id="view-reports"><div class="lgu-report-map-panel"></div></section>
    <script>
      const ADMIN_API_URL='/admin-api.php';
      const session={id:1};
      const locationForId=id=>({name:id==='navotas'?'Navotas':id});
      window.manageReport=async()=>{};
      window.addEventListener('bahaba-admin-social-reports',event=>window.receivedSocialReports=event.detail.events);
      window.addEventListener('DOMContentLoaded',()=>window.renderReportManager());
    </script>
    <script src="/admin/report-manager.js"></script>`}));
  await page.route('**/admin-api.php?**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('action') === 'managed-reports') {
      return route.fulfill({json:{reports:[{id:17,location_id:'navotas',city:'Navotas',barangay:'Tangos North',description:'LGU observed water rising near the school.',severity:'high',status:'pending',reporter:'Navotas LGU Team',source:'lgu',map_hidden:0,created_at:'2026-11-06 06:20:00'}],total:1,page:1,pages:1,platform:true,can_hide:false,can_delete:false}});
    }
    assert.equal(url.searchParams.get('action'),'nlp-events');
    requestedLocations.push(url.searchParams.get('location'));
    return route.fulfill({json:{events:[
      {id:42,source:'X',source_post_id:'2118601357976604863',post_url:'https://x.com/lauveyfan/status/2118601357976604863',post_text:'Baha na naman sa Brgy. Tangos North, Navotas',city:'Navotas',barangay:'Tangos North',classification:'Flood',severity:'Low'},
      {id:43,source:'X',post_text:'Traffic update',city:'Navotas',classification:'Non-Flood'},
    ]}});
  });
  await page.goto('http://127.0.0.1:33322/admin/manager-test');
  await expect(page.locator('#report-manager')).toContainText('All reports and flood signals');
  await expect(page.locator('#managed-rows')).toContainText('Tangos North, Navotas');
  await expect(page.locator('#managed-rows')).toContainText('Navotas LGU Team');
  await expect(page.locator('#managed-rows')).toContainText('2:20');
  await expect(page.locator('#managed-rows')).toContainText('Nov 6, 2026');
  await expect(page.locator('#managed-rows')).toContainText('LGU observed water rising near the school.');
  await expect(page.locator('#managed-rows')).toContainText('Automated NLP');
  await expect(page.locator('#managed-rows')).toContainText('X');
  await expect(page.locator('#managed-rows .managed-severity--low')).toContainText('Low');
  await expect(page.locator('#managed-rows')).toContainText('Barangay shade');
  await expect(page.locator('#managed-signal-status')).toContainText('checks every 15 seconds');
  await expect(page.locator('#managed-rows')).not.toContainText('Traffic update');
  await expect(page.locator('#managed-count')).toContainText('1 automated NLP detection');
  const socialReports = await page.evaluate(() => window.receivedSocialReports);
  assert.equal(socialReports.length,1);
  assert.equal(socialReports[0].source_post_id,'2118601357976604863');
  assert.equal(await page.locator('#managed-rows a[href*="2118601357976604863"]').count(),1);
  await page.locator('#reports-location-select').selectOption({label:'Manila'});
  await page.evaluate(() => window.renderReportManager());
  await expect.poll(() => requestedLocations.at(-1)).toBe('manila');
  await page.evaluate(() => window.__adminRefreshTick());
  await expect.poll(() => requestedLocations.filter(location => location === 'manila').length).toBeGreaterThan(1);
  console.log('PASS browser: automated NLP report shows model severity, source, map match, and timed refresh');
} finally {
  await browser.close();
}
