import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const user = { id: 42, username: 'Resident', email: 'resident@example.com', preferred_locations: [], selected_location: null }
try {
  for (const scenario of ['valid-no-cache', 'valid-expired-cache', 'signed-out', 'outage-retry']) {
    const context = await browser.newContext()
    const page = await context.newPage()
    page.on('pageerror', e => console.log('PAGE ERROR', e.message))
    page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()) })
    if (scenario === 'valid-expired-cache') await page.addInitScript(() => {
      localStorage.setItem('bahaba_app_user', JSON.stringify({ id: 42 }))
      localStorage.setItem('bahaba_app_session_expiry', '1')
    })
    let profileCalls = 0
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/profile.php')) {
        profileCalls++
        await new Promise(resolve => setTimeout(resolve, 300))
        if (scenario === 'signed-out') return route.fulfill({ status: 401, json: { error: 'Sign in' } })
        if (scenario === 'outage-retry' && profileCalls === 1) return route.fulfill({ status: 503, json: { error: 'Unavailable' } })
        return route.fulfill({ json: { user } })
      }
      return route.fulfill({ json: { events: [], reports: [], nlp_events: [], announcements: [], cities: [], pins: [], cursor: '1' } })
    })
    await page.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }))
    await page.goto('http://127.0.0.1:33321')
    await expect(page.getByRole('button', { name: 'Log In', exact: true })).toHaveCount(0)
    if (scenario === 'signed-out') {
      await expect(page.getByRole('button', { name: 'Log In', exact: true })).toBeVisible({ timeout: 10000 })
    } else {
      if (scenario === 'outage-retry') {
        await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
        await expect(page.getByRole('button', { name: 'Log In', exact: true })).toHaveCount(0)
        await page.getByRole('button', { name: 'Try again' }).click()
      }
      await expect(page.locator('.rising-flood-overlay')).toHaveCount(1).catch(async e => { console.log('BODY', await page.locator('body').innerText(), 'CALLS', profileCalls); throw e })
      await expect(page.getByRole('textbox', { name: 'Search location', exact: true })).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('button', { name: 'Log In', exact: true })).toHaveCount(0)
      await expect(page.locator('.rising-flood-overlay')).toHaveCount(0, { timeout: 10000 })
    }
    console.log(`PASS ${scenario}`)
    await context.close()
  }
} finally { await browser.close() }

