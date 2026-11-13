import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { activeCitySignals, activeSignalFeatures } from '../src/cityFloodSignals.js'
const geo = JSON.parse(readFileSync(new URL('../src/assets/targeted-barangay-geometry.json', import.meta.url)))
const daanghari = geo.features.find(feature => feature.id === 'PH1307503005')
assert.ok(daanghari)
const now = Date.now()
const pin = { event_id:null, location_key:'daanghari', city_id:'1380900000', label:'Daanghari', precision_level:'barangay', phase:'MONITORING', expires_at_ms:now+60000, geometry:daanghari.geometry }
const result = activeSignalFeatures({pins:[pin],cities:[]},now)
assert.equal(result.features.length,1,'A provisional barangay signal must appear without an activated city event')
assert.deepEqual(result.features[0].geometry,daanghari.geometry,'Keep the actual barangay area instead of inventing a point')
assert.equal(activeSignalFeatures({pins:[{...pin,expires_at_ms:now-1}],cities:[]},now).features.length,0)
assert.equal(activeCitySignals({cities:[{phase:'ACTIVE',expires_at_ms:now+60000}]},now).length,1)
assert.equal(activeCitySignals({cities:[{phase:'ACTIVE',expires_at_ms:now-1}]},now).length,0)
assert.equal(activeCitySignals({day_expires_at_ms:now-1,cities:[{phase:'ACTIVE'}]},now).length,0)
console.log('PASS provisional Daanghari polygon shading and expired signal removal')
