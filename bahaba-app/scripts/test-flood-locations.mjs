import assert from 'node:assert/strict'
import { floodAreasFor } from '../src/floodMap.js'

const now = Date.now()
const boundary = { type: 'Feature', id: 'anilao', properties: { name: 'Anilao', city: 'Bulacan', municipality: 'City of Malolos (Capital)' }, geometry: { type: 'Polygon', coordinates: [[[120.79,14.83],[120.81,14.83],[120.81,14.86],[120.79,14.83]]] } }
const post = { city: 'Malolos City', barangay: 'Anilao', classification: 'Flood', severity: 'High', description: 'Baha sa barangay Anilao', created_at: now - 1000, expires_at_ms: now + 86400000 }
const rawAreas = posts => floodAreasFor([boundary], [], posts, now)
const batch = post => Array.from({length:20}, (_,index)=>({...post,id:index+1}))
const areas = posts => rawAreas(posts.flatMap(batch))
assert.equal(rawAreas(batch(post).slice(0,19)).features.length,0)
assert.equal(rawAreas(Array(20).fill({...post,id:1})).features.length,0)
assert.equal(areas([{...post,created_at:now-16*60000}]).features.length,0)
const barangay = areas([post])
assert.equal(barangay.features.length, 1)
assert.deepEqual(barangay.features[0].geometry, boundary.geometry, 'Use the actual boundary without modifying its shape')
assert.equal(barangay.features[0].properties.precision, 'barangay-only')
assert.equal(barangay.points.length, 0, 'Barangay mentions must not invent an exact dot')
const landmark = areas([{ ...post, description: 'Baha sa Anilao barangay hall' }])
assert.equal(landmark.features.length, 0)
assert.deepEqual(landmark.points[0].geometry.coordinates, [120.79808555,14.841551375])
for (const changed of [
  {description:'Baha sa Malolos #Anilao'},
  {description:'Baha sa Malolos'},
  {classification:'Non-Flood'},
  {city:'Navotas City'},
  {expires_at_ms:now},
]) {
  const result = areas([{...post,...changed}])
  assert.equal(result.features.length, 0)
  assert.equal(result.points.length, 0)
}
const expiredHigh = {...post, expires_at_ms:now}
const newLow = {...post, severity:'Low'}
assert.equal(areas([expiredHigh,newLow]).features[0].properties.severity,'low')
console.log('PASS: real barangay outline, exact landmark dot, tag-only/city-only/non-flood/wrong-city exclusion, 20 distinct posts in 15 minutes and expiry.')
