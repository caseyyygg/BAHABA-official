const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s*\([^)]*\)/g, '')
  .replace(/^(barangay|brgy\.?)\s+/i, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '')

const normalizeCity = value => normalize(value).replace(/city|municipality|of/g, '')
const severityRank = { unknown: 0, low: 1, medium: 2, moderate: 2, mid: 2, high: 3 }

export function validMapReportPoint(report) {
  const latitude = Number(report.latitude)
  const longitude = Number(report.longitude)
  return report.latitude != null && report.longitude != null
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 4 && latitude <= 22 && longitude >= 116 && longitude <= 128
}

export function mapReportPoints(reports) {
  return {
    type: 'FeatureCollection',
    features: reports.filter(validMapReportPoint).map(report => ({
      type: 'Feature',
      id: report.id,
      properties: report,
      geometry: {
        type: 'Point',
        coordinates: [Number(report.longitude), Number(report.latitude)],
      },
    })),
  }
}

function reportFeature(report, features) {
  const featureId = String(report.barangay_feature_id || '')
  if (featureId) {
    const byId = features.find(feature => String(feature.id) === featureId)
    if (byId) return byId
  }

  const city = normalizeCity(report.city)
  const barangay = normalize(report.barangay)
  if (!city || !barangay) return null
  const matches = features.filter(feature => {
    const properties = feature.properties || {}
    const featureCity = normalizeCity(properties.city)
    const municipality = normalizeCity(properties.municipality)
    return (featureCity === city || municipality === city)
      && [properties.name, properties.sourceName].some(name => normalize(name) === barangay)
  })
  return matches.length === 1 ? matches[0] : null
}

export function mapReportAreas(reports, features) {
  const areas = new Map()
  for (const report of reports) {
    if (validMapReportPoint(report)) continue
    const feature = reportFeature(report, features)
    if (!feature || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) continue

    let area = areas.get(String(feature.id))
    if (!area) {
      area = {
        type: 'Feature',
        id: String(feature.id),
        geometry: feature.geometry,
        properties: {
          barangay: feature.properties.name,
          city: report.city || feature.properties.city || feature.properties.municipality || '',
          severity: 'unknown',
          count: 0,
          details: '',
        },
      }
      areas.set(String(feature.id), area)
    }
    const severity = String(report.severity || '').toLowerCase()
    if ((severityRank[severity] || 0) > (severityRank[area.properties.severity] || 0)) {
      area.properties.severity = severity === 'moderate' || severity === 'mid' ? 'medium' : severity
    }
    area.properties.count += 1
    if (report.description) {
      area.properties.details += `${area.properties.details ? '\n\n' : ''}${report.description}`
    }
  }

  return { type: 'FeatureCollection', features: [...areas.values()] }
}
