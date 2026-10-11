// Provisional mirror import. Prefer import-psgc.py with a current official PSA workbook.
import { readFileSync, writeFileSync } from 'node:fs'
const read = (name) => JSON.parse(readFileSync(new URL(`./data/psgc-provisional/psgc-${name}.json`, import.meta.url)))
const regions = new Map(read('regions').map(r => [r.code, r]))
const provinces = new Map(read('provinces').map(p => [p.code, p]))
const locations = read('cities').map(c => ({
  id: c.psgc10DigitCode, correspondence_code: c.code, city: c.name,
  province: provinces.get(c.provinceCode)?.name || '',
  region: regions.get(c.regionCode)?.regionName || '',
  region_id: regions.get(c.regionCode)?.psgc10DigitCode,
  province_id: provinces.get(c.provinceCode)?.psgc10DigitCode || null,
  type: c.isCity ? 'city' : 'municipality',
})).map(c => ({ ...c, name: [c.city, c.province || c.region].join(', ') }))
writeFileSync(new URL('../psgc-registry.json', import.meta.url), JSON.stringify({
  source: 'https://psgc.gitlab.io/api/', official_source: 'https://psa.gov.ph/classification/psgc',
  status: 'provisional-mirror-requires-official-refresh', version: 'mirror-retrieved-2026-10-11', locations,
}, null, 2) + '\n')
