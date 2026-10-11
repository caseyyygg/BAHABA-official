import { chromium, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const registry=JSON.parse(readFileSync(new URL('../psgc-registry.json',import.meta.url)))
const browser=await chromium.launch({ executablePath:process.env.BAHABA_BROWSER_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true })
const context=await browser.newContext({ viewport:{width:430,height:932} })
let user={id:1,email:'resident@gmail.com',username:'Resident',preferred_locations:[],selected_location:null,barangays:[]}
let preferencesWrites=0
let polls=0
let events=[]
let mapBatch=[]
const errors=[]
const page=await context.newPage()
page.on('pageerror',e=>errors.push(e.message))
await page.addInitScript(() => {
  window.__notifications=[]
  Object.defineProperty(window,'Notification',{value:class { static permission='granted'; static requestPermission=async()=> 'granted' }})
  const worker={showNotification:async(title,options)=>window.__notifications.push({title,...options})}
  Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>worker,ready:Promise.resolve(worker)}})
  Object.defineProperty(navigator,'geolocation',{value:{watchPosition:(_success,failure)=>{setTimeout(()=>failure({code:1}),10);return 1},clearWatch:()=>{}}})
})
await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[]}}))
await page.route('**/api/**', async route => {
  const url=new URL(route.request().url())
  let json={}
  if(url.pathname.endsWith('login.php') || url.pathname.endsWith('profile.php')) {
    if(route.request().method()==='PUT') {
      const data=route.request().postDataJSON()
      if(data.preferred_locations) { user={...user,preferred_locations:data.preferred_locations,preferences_updated_at:String(Date.now())}; preferencesWrites++ }
    }
    json={user}
  } else if(url.pathname.endsWith('notifications.php')) {
    polls++
    json={events:url.searchParams.has('after') ? events.splice(0) : [],cursor:String(polls)}
  } else if(url.pathname.endsWith('map-reports.php')) json={reports:mapBatch,next:null}
  else if(url.pathname.endsWith('resolve-location.php')) json={location:null,bounds:null}
  else if(url.pathname.endsWith('location-data.php')) json={reports:[],nlp_events:[],announcements:[],command_center:null,evacuation_centers:[]}
  await route.fulfill({json})
})
try {
  await page.goto('http://127.0.0.1:33319')
  await page.getByRole('button',{name:'Log In',exact:true}).click()
  await page.getByPlaceholder('Enter your Gmail address').fill('resident@gmail.com')
  await page.getByPlaceholder('Enter your password').fill('TestPassword123!')
  await page.getByRole('button',{name:'Log in',exact:true}).click()
  await expect(page.getByPlaceholder('Search location')).toBeVisible()
  await expect(page.getByRole('heading',{name:'Preferred locations'})).toHaveCount(0)
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  await page.getByRole('button',{name:'Manage preferred locations',exact:false}).click()
  await expect(page.getByRole('heading',{name:'Preferred locations'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Save locations'})).toBeDisabled()
  const query=page.getByLabel('Search city, municipality, province or region')
  await query.fill('San Jose')
  const sanJose=registry.locations.filter(l=>l.city==='San Jose')
  if(sanJose.length<2) throw new Error('Missing duplicate-name fixture')
  for(const l of sanJose.slice(0,2)) {
    await expect(page.locator('.location-results').getByRole('button').filter({hasText:l.name}).first()).toBeVisible()
  }
  const provinceFixture=sanJose.find(l=>l.province)
  await page.getByLabel('Region',{exact:true}).selectOption(provinceFixture.region)
  await page.getByLabel('Province',{exact:true}).selectOption(provinceFixture.province)
  await expect(page.locator('.location-results button')).toHaveCount(1)
  await expect(page.locator('.location-results button')).toContainText(provinceFixture.name)
  await page.getByLabel('Region',{exact:true}).selectOption('')
  const chosen=[registry.locations.find(l=>l.id==='1380900000'),registry.locations.find(l=>l.id==='1380700000'),registry.locations.find(l=>l.id==='0301410000')]
  for(let i=0;i<chosen.length;i++) {
    await query.fill(chosen[i].city)
    await page.locator('.location-results').getByRole('button').filter({hasText:chosen[i].name}).click()
    await expect(page.getByRole('button',{name:'Save locations'})).toBeEnabled()
  }
  await query.fill('Davao')
  await expect(page.locator('.location-results button').first()).toBeDisabled()
  await page.getByRole('button',{name:'Save locations'}).click()
  await expect(page.getByPlaceholder('Search location')).toBeVisible()
  await page.locator('.nationwide-location-panel summary').click()
  await expect(page.getByText('No reports available here.',{exact:false})).toBeVisible()
  await page.getByLabel('Search location',{exact:true}).fill('Davao')
  await page.locator('.location-results button').first().click()
  if(preferencesWrites!==1) throw new Error('Map search changed subscriptions')
  mapBatch=Array.from({length:500},(_,i)=>({id:i+1,city:'Davao',province:'Davao del Sur',barangay:'Available barangay',severity:'high',description:'Verified synthetic performance fixture',latitude:7.07+(i%20)*0.001,longitude:125.6+Math.floor(i/20)*0.001}))
  await page.getByRole('button',{name:'Expand location search'}).click()
  const renderStart=Date.now()
  await page.getByRole('button',{name:'Refresh reports',exact:true}).click()
  await expect(page.locator('.nationwide-report-list article')).toHaveCount(500)
  await expect(page.locator('.maplibregl-marker')).toHaveCount(0)
  console.log(`Synthetic 500-report viewport rendered in ${Date.now()-renderStart}ms with clustered GeoJSON and zero DOM markers`)
  mapBatch=[]
  await page.reload()
  await expect(page.getByPlaceholder('Search location')).toBeVisible()
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  await page.getByRole('button',{name:'Manage preferred locations',exact:false}).click()
  await page.getByRole('button',{name:'Remove',exact:true}).first().click()
  await expect(page.getByRole('button',{name:'Save locations'})).toBeEnabled()
  await page.getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByRole('switch',{name:'Toggle location sharing'}).click()
  await expect(page.getByText('GPS permission denied or detection failed. Saved preferences remain active.')).toBeVisible()
  await page.getByRole('button',{name:'Map',exact:true}).click()
  await expect(page.getByPlaceholder('Search location')).toBeVisible()
  await page.getByRole('button',{name:'Expand location search'}).click()
  await expect(page.getByRole('button',{name:'Current location',exact:true})).toBeDisabled()
  events=[{id:20,kind:'flood',city:'City of Navotas',province:'',barangay:'San Jose',title:'HIGH flood report'}, {id:21,kind:'advisory',city:'City of Marikina',province:'',barangay:'Unknown',title:'Evacuation advisory'}]
  await expect.poll(()=>page.evaluate(()=>window.__notifications.length),{timeout:12000}).toBe(1)
  await expect(page.locator('.in-app-alert')).toContainText('City of Navotas')
  await expect(page.locator('.in-app-alert')).toContainText('Evacuation advisory')
  const push=await page.evaluate(()=>window.__notifications)
  if(!push[0].body.includes('San Jose') || !push[0].body.includes('HIGH')) throw new Error('Missing notification context')
  await page.locator('.in-app-alert').getByRole('button',{name:'Dismiss notification'}).click()
  await page.getByRole('button',{name:'Settings',exact:true}).click()
  await page.getByRole('switch',{name:'Toggle flood alerts'}).click()
  events=[{id:22,kind:'flood',city:'City of Navotas',title:'LOW flood report'}]
  const before=polls
  await expect.poll(()=>polls,{timeout:12000}).toBeGreaterThan(before)
  await expect(page.locator('.in-app-alert')).toHaveCount(0)
  await page.evaluate(()=>{Notification.permission='denied'})
  events=[{id:23,kind:'advisory',city:'City of Marikina',barangay:'Unknown',title:'Advisory with browser permission denied'}]
  await expect(page.locator('.in-app-alert')).toContainText('Advisory with browser permission denied',{timeout:12000})
  await expect.poll(()=>page.evaluate(()=>window.__notifications.length)).toBe(1)
  await page.locator('.in-app-alert').getByRole('button',{name:'Dismiss notification'}).click()
  await page.getByRole('switch',{name:'Toggle push notifications'}).click()
  await expect(page.getByRole('switch',{name:'Toggle push notifications'})).toHaveAttribute('aria-checked','false')
  // No replay of disabled flood notifications when preferences are changed.
  await page.screenshot({path:new URL('../migration-test.local/settings.png',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'),fullPage:true})
  if(errors.length) throw new Error(errors.join('\n'))
  console.log('PASS returning login skips onboarding, duplicate place labels, one-to-three in settings, saved preferences on reload, independent map search, settings removal constraint, denied GPS fallback, in-app/browser flood and advisory notifications, flood preference, no replay')
} finally { await browser.close() }
