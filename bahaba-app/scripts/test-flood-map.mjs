import assert from 'node:assert/strict'
import { floodAreasFor } from '../src/floodMap.js'

const now = Date.parse('2026-11-06T08:00:00Z')
const expires = now + 60 * 60 * 1000
const navotas = {
  type: 'Feature',
  id: 'PH1307503017',
  properties: { name: 'Tangos North', city: 'Navotas', municipality: '' },
  geometry: { type: 'Polygon', coordinates: [[[120.93, 14.67], [120.94, 14.67], [120.94, 14.68], [120.93, 14.68], [120.93, 14.67]]] },
}
const malolos = {
  type: 'Feature',
  id: 'PH0301410001',
  properties: { name: 'Anilao', city: 'Malolos', municipality: 'City of Malolos (Capital)' },
  geometry: { type: 'Polygon', coordinates: [[[120.79, 14.83], [120.81, 14.83], [120.81, 14.86], [120.79, 14.86], [120.79, 14.83]]] },
}

const schoolPost = {
  id: 'post-school',
  source: 'X',
  classification: 'Flood',
  severity: 'High',
  city: 'Navotas',
  barangay: 'Tangos North',
  description: 'Lumalala ang pagbaha sa Tangos North Highschool, Navotas.',
  published_at: '2026-11-06T07:59:00Z',
  expires_at_ms: expires,
}
const shaded = floodAreasFor([navotas], [], [schoolPost], now)
assert.equal(shaded.features.length, 0, 'A verified named school should not shade the whole barangay.')
assert.equal(shaded.points.length, 1, 'A school landmark should be pinned without requiring a street name.')
assert.deepEqual(shaded.points[0].geometry.coordinates, [120.932092, 14.674708])
assert.equal(shaded.points[0].properties.precision, 'landmark')
assert.equal(shaded.points[0].properties.severity, 'high')

const landmarkPost = {
  ...schoolPost,
  id: 'post-landmark',
  city: 'Malolos City',
  barangay: 'Anilao',
  description: 'Baha sa Anilao Barangay Hall, Malolos City.',
}
const pinned = floodAreasFor([malolos], [], [landmarkPost], now)
assert.equal(pinned.features.length, 0, 'A uniquely matched mapped landmark should not shade the whole barangay.')
assert.equal(pinned.points.length, 1)
assert.deepEqual(pinned.points[0].geometry.coordinates, [120.79808555, 14.841551375])
assert.equal(pinned.points[0].properties.precision, 'landmark')

console.log('PASS flood map: one fresh post automatically maps to a verified landmark point or falls back to barangay shading.')
