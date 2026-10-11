import landmarks from './assets/flood-landmarks.json' with { type: 'json' }

const normalize = (value) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/^(barangay|brgy\.?)\s+/, '')
  .replace(/\(.*?\)/g, '').replace(/\bcity\b|\bof\b/g, '')
  .replace(/[^a-z0-9]/g, '')

const severityRank = { unknown: 0, low: 1, medium: 2, high: 3 }

export function resolveFloodLandmark(item, features = []) {
  // Place names appearing only in hashtags/@tags are not location evidence.
  const text = String(item.description || '').replace(/[#@][\p{L}\p{N}_]+/gu, '').toLowerCase()
  const city = normalize(item.city)
  const barangay = normalize(item.barangay)
  const genericNames = new Set([city, barangay, ...features.flatMap((feature) =>
    [feature.properties.name, feature.properties.sourceName, feature.properties.city, feature.properties.municipality].map(normalize))].filter(Boolean))
  const contains = (name) => (` ${text.replace(/[^\p{L}\p{N}]+/gu, ' ')} `).includes(` ${name.replace(/[^\p{L}\p{N}]+/gu, ' ')} `)
  const matches = landmarks.filter((landmark) => normalize(landmark.city) === city && (
    landmark.aliases.some((alias) => !genericNames.has(normalize(alias)) && contains(alias))
    || (normalize(landmark.barangay) === barangay && landmark.contextAliases.some(contains)
      && contains(landmark.barangay.toLowerCase()))
  ))
  // OSM can contain both a building and its POI node. Treat collocated
  // duplicates as one place; different branches/road sections stay ambiguous.
  const unique = []
  for (const match of matches) {
    if (!unique.some((other) => normalize(other.name) === normalize(match.name)
      && Math.hypot(other.coordinates[0] - match.coordinates[0], other.coordinates[1] - match.coordinates[1]) < 0.0003)) unique.push(match)
  }
  return unique.length === 1 ? unique[0] : null
}

export function floodAreasFor(features, reports, nlpEvents, now = Date.now()) {
  const groups = new Map()
  const points = new Map()
  let ignored = 0
  let unmatched = 0
  const unmatchedDetails = []
  const severityCounts = { high: 0, medium: 0, low: 0, unknown: 0 }
  const items = [...reports.map((item) => ({ ...item, fromPost: false })),
    ...nlpEvents.map((item) => ({ ...item, fromPost: true }))].filter((item) =>
    !['rejected', 'resolved', 'cancelled'].includes(String(item.status || '').toLowerCase())
    && (!item.fromPost || (Number.isFinite(Number(item.expires_at_ms)) && Number(item.expires_at_ms) > now)))
  for (const item of items) {
    const value = String(item.severity || '').toLowerCase()
    const rawSeverity = value === 'mid' ? 'medium' : value
    const severity = Object.hasOwn(severityRank, rawSeverity) ? rawSeverity : 'unknown'
    const detail = `${severity.toUpperCase()}: ${item.description || 'Flooding reported'}${item.created_at ? ` (${item.created_at})` : ''}`
    if (item.fromPost) {
      if (item.classification && String(item.classification).toLowerCase() !== 'flood') { ignored += 1; continue }
      const landmark = resolveFloodLandmark(item, features)
      const inScope = landmark && features.some((feature) =>
        normalize(feature.properties.municipality) === normalize(landmark.city)
        || normalize(feature.properties.city) === normalize(landmark.city))
      if (!inScope) {
        // A named barangay can support an area alert, but tags alone cannot.
        const text = String(item.description || '').replace(/[#@][\p{L}\p{N}_]+/gu, '')
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
        const name = String(item.barangay || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .toLowerCase().replace(/^(barangay|brgy\.?)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim()
        if (landmark || !name || !(` ${text} `).includes(` ${name} `)) { ignored += 1; continue }
      } else {
        let point = points.get(landmark.id)
        if (!point) {
          point = { type: 'Feature', id: landmark.id, geometry: { type: 'Point', coordinates: landmark.coordinates },
            properties: { name: landmark.name, barangay: landmark.barangay || item.barangay || '', severity, count: 0, details: '', source: landmark.source, precision: landmark.precision || 'landmark', expires_at_ms: Number(item.expires_at_ms) } }
          points.set(landmark.id, point)
        }
        point.properties.count += 1
        severityCounts[severity] += 1
        point.properties.expires_at_ms = Math.max(point.properties.expires_at_ms, Number(item.expires_at_ms))
        if (severityRank[severity] > severityRank[point.properties.severity]) point.properties.severity = severity
        point.properties.details += `${point.properties.details ? '\n\n' : ''}${detail}`
        continue
      }
    }
    const name = normalize(item.barangay)
    let candidates = item.barangay_feature_id
      ? features.filter((feature) => String(feature.id) === String(item.barangay_feature_id))
      : name ? features.filter((feature) =>
        normalize(feature.properties.name) === name || normalize(feature.properties.sourceName) === name) : []
    if (item.fromPost) {
      const city = normalize(item.city)
      candidates = candidates.filter((feature) => city && (
        normalize(feature.properties.municipality) === city || normalize(feature.properties.city) === city))
    }
    if (candidates.length > 1) {
      const city = normalize(item.city)
      candidates = candidates.filter((feature) => normalize(feature.properties.municipality) === city)
    }
    if (candidates.length !== 1) {
      unmatched += 1
      severityCounts[severity] += 1
      unmatchedDetails.push(item.description || 'Flooding reported; barangay not identified')
      continue
    }
    const feature = candidates[0]
    severityCounts[severity] += 1
    if (item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))) {
      const key = `report-${item.id}`
      points.set(key, { type: 'Feature', id: key, geometry: { type: 'Point', coordinates: [Number(item.longitude), Number(item.latitude)] },
        properties: { name: item.street_name || `Reported location in ${item.barangay}`, barangay: item.barangay, severity, count: 1, details: detail, precision: 'reported-point' } })
      continue
    }
    const key = String(feature.id)
    let group = groups.get(key)
    if (!group) {
      group = { ...feature, properties: { ...feature.properties, severity, count: 0, details: '', precision: item.fromPost ? 'barangay-only' : 'reported-area' } }
      groups.set(key, group)
    }
    if (!item.fromPost) group.properties.precision = 'reported-area'
    if (severityRank[severity] > severityRank[group.properties.severity]) group.properties.severity = severity
    group.properties.count += 1
    group.properties.details += `${group.properties.details ? '\n\n' : ''}${detail}`
  }
  return { type: 'FeatureCollection', features: [...groups.values()], points: [...points.values()], ignored,
    unmatched, unmatchedDetails, severityCounts, total: items.length - ignored }
}

export function floodPointsFor(floodAreas) {
  return { type: 'FeatureCollection', features: floodAreas.points || [] }
}

