import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const base = new URL('../../deploy/cloudflare/output/pages/admin/', import.meta.url);
const html = readFileSync(new URL('index.html',base),'utf8');
assert.match(html,/href="admin-polish.css/);
assert.match(html,/src="admin-search-selects.js/);
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage();
 await page.setContent('<label for="lgu-map-barangay">Barangay</label><select id="lgu-map-barangay"><option value="">Select a barangay or click the map</option><option value="1">Bagumbayan North</option><option value="2">Tanza 1</option></select>');
 await page.addStyleTag({content:readFileSync(new URL('admin-polish.css',base),'utf8')});
 await page.addScriptTag({content:readFileSync(new URL('admin-search-selects.js',base),'utf8')});
 await page.locator('summary').click();
 await page.getByPlaceholder('Search barangay name...').fill('tanza');
 assert.equal(await page.getByRole('option').count(),1);
 await page.getByRole('option',{name:'Tanza 1'}).click();
 assert.equal(await page.locator('select').inputValue(),'2');
 await page.evaluate(()=>{document.querySelector('select').replaceChildren(new Option('Navotas East','3'));});
 await page.waitForFunction(()=>document.querySelector('.admin-search-select-value').textContent==='Navotas East');
 console.log('Picker checks passed: deployed assets linked, name search, selection, and dynamic barangay updates.');
} finally {await browser.close();}
