import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
const browser=await chromium.launch({executablePath:process.env.BAHABA_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true})
try {
  const context=await browser.newContext({acceptDownloads:true})
  const page=await context.newPage()
  await page.goto('https://psa.gov.ph/classification/psgc',{waitUntil:'domcontentloaded',timeout:30000})
  const link=page.locator('a[href*="PSGC-2Q-2026-Publication-Datafile.xlsx"]').first()
  await link.waitFor({timeout:20000})
  const download=page.waitForEvent('download',{timeout:30000})
  await link.click()
  await (await download).saveAs(resolve(import.meta.dirname,'../psgc-source.xlsx'))
  console.log('Downloaded official PSA PSGC 2026-Q2 workbook')
} finally { await browser.close() }
