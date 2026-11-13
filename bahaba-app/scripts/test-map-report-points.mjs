import assert from 'node:assert/strict'
import { mapReportAreas, mapReportPoints } from '../src/mapReportAreas.js'

const barangay = {
  type: 'Feature',
  id: 'PH1307503017',
  properties: { name: 'Tangos North', city: 'Navotas' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[120.93, 14.67], [120.94, 14.67], [120.94, 14.68], [120.93, 14.68], [120.93, 14.67]]],
  },
}

const locatedReport = {
  id: 'report-with-coordinates',
  city: 'Navotas',
  barangay: 'Tangos North',
  latitude: '14.67',
  longitude: '120.93',
  street_name: '',
  severity: 'medium',
}

const points = mapReportPoints([locatedReport])
assert.equal(points.features.length, 1, 'A verified report coordinate should display even without a street name.')
assert.deepEqual(points.features[0].geometry.coordinates, [120.93, 14.67])
assert.equal(mapReportAreas([locatedReport], [barangay]).features.length, 0, 'A point report should not also shade the barangay.')

const areaOnlyReport = { ...locatedReport, latitude: null, longitude: null }
assert.equal(mapReportPoints([areaOnlyReport]).features.length, 0, 'Reports without coordinates must not get guessed pins.')
assert.equal(mapReportAreas([areaOnlyReport], [barangay]).features.length, 1, 'Reports without coordinates should use the matched barangay area.')

console.log('PASS map report points: valid coordinates display without street names; coordinate-free reports shade their barangay.')
