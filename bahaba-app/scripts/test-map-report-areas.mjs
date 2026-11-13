import assert from 'node:assert/strict'
import { mapReportAreas } from '../src/mapReportAreas.js'

const features = [
  {
    type: 'Feature',
    id: 'barangay-navotas',
    properties: { name: 'Daanghari', city: 'Navotas', municipality: '' },
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  },
  {
    type: 'Feature',
    id: 'barangay-other-city',
    properties: { name: 'Daanghari', city: 'Other City', municipality: '' },
    geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
  },
]

const areas = mapReportAreas([
  { id: 1, city: 'Navotas City', barangay: 'Daanghari', severity: 'low', description: 'Water rising' },
  { id: 2, city: 'Navotas City', barangay: 'Daanghari', severity: 'high', description: 'Road flooded' },
  { id: 3, city: 'Navotas', barangay: 'Daanghari', street_name: 'M. Naval Street', latitude: 14.6, longitude: 120.9, severity: 'medium' },
], features)

assert.equal(areas.features.length, 1)
assert.equal(areas.features[0].id, 'barangay-navotas')
assert.equal(areas.features[0].properties.severity, 'high')
assert.equal(areas.features[0].properties.count, 2)
assert.match(areas.features[0].properties.details, /Water rising/)
console.log('PASS: barangay-only reports shade the matched barangay using the highest reported severity.')
