import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import mapGeometry from '../assets/targeted-barangay-geometry.json'
import { locationById } from '../locations'

const MAP_WIDTH = 1000
const MAP_HEIGHT = 680
const MAP_PADDING = 150

const coordinatesForFeature = (feature) => {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates

  return polygons.flatMap((polygon) => polygon.flat())
}

const projectFeature = (feature, projectCoordinate) => {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates
  const path = polygons.flatMap((polygon) => polygon.map((ring) => {
    const projected = ring.map(projectCoordinate)
    return `${projected.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')} Z`
  })).join(' ')

  return path
}

const labelAnchorCache = new WeakMap()

const pointInRing = (point, ring) => {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index]
    const previousPoint = ring[previous]
    const crossesRay = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y))
        / (previousPoint.y - currentPoint.y) + currentPoint.x
    if (crossesRay) inside = !inside
  }

  return inside
}

const distanceToSegment = (point, start, end) => {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY
  const fraction = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared))
    : 0
  return Math.hypot(point.x - start.x - fraction * deltaX, point.y - start.y - fraction * deltaY)
}

const bestInteriorPoint = (rings) => {
  const outerRing = rings[0]
  const bounds = outerRing.reduce((current, point) => ({
    minX: Math.min(current.minX, point.x),
    maxX: Math.max(current.maxX, point.x),
    minY: Math.min(current.minY, point.y),
    maxY: Math.max(current.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
  const candidates = []
  const vertexCount = Math.max(0, outerRing.length - 1)

  if (vertexCount) {
    const average = outerRing.slice(0, vertexCount).reduce((sum, point) => ({
      x: sum.x + point.x / vertexCount,
      y: sum.y + point.y / vertexCount,
    }), { x: 0, y: 0 })
    candidates.push(average)
  }

  for (let row = 1; row < 12; row += 1) {
    for (let column = 1; column < 12; column += 1) {
      candidates.push({
        x: bounds.minX + (bounds.maxX - bounds.minX) * column / 12,
        y: bounds.minY + (bounds.maxY - bounds.minY) * row / 12,
      })
    }
  }

  let best = null
  candidates.forEach((candidate) => {
    if (!pointInRing(candidate, outerRing) || rings.slice(1).some((ring) => pointInRing(candidate, ring))) return

    const clearance = rings.reduce((minimum, ring) => {
      for (let index = 1; index < ring.length; index += 1) {
        minimum = Math.min(minimum, distanceToSegment(candidate, ring[index - 1], ring[index]))
      }
      return minimum
    }, Infinity)

    if (!best || clearance > best.clearance) best = { ...candidate, clearance }
  })

  return best
}

const labelAnchorFor = (feature, areaName, projectCoordinate) => {
  let areaAnchors = labelAnchorCache.get(feature)
  if (!areaAnchors) {
    areaAnchors = new Map()
    labelAnchorCache.set(feature, areaAnchors)
  }
  if (areaAnchors.has(areaName)) return areaAnchors.get(areaName)

  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates
  const anchors = polygons.map((polygon) => bestInteriorPoint(polygon.map((ring) => ring.map(projectCoordinate))))
  const anchor = anchors.filter(Boolean).sort((left, right) => right.clearance - left.clearance)[0] || null
  areaAnchors.set(areaName, anchor)
  return anchor
}

const GeoJSONMap = forwardRef(function GeoJSONMap({ features, areaName }, ref) {
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT })
  const [focusedFeatureId, setFocusedFeatureId] = useState(null)
  const dragStart = useRef(null)
  const visibleFeatures = features
  const coordinates = visibleFeatures.flatMap(coordinatesForFeature)
  const bounds = coordinates.reduce((current, [longitude, latitude]) => ({
    minLongitude: Math.min(current.minLongitude, longitude),
    maxLongitude: Math.max(current.maxLongitude, longitude),
    minLatitude: Math.min(current.minLatitude, latitude),
    maxLatitude: Math.max(current.maxLatitude, latitude),
  }), {
    minLongitude: Infinity,
    maxLongitude: -Infinity,
    minLatitude: Infinity,
    maxLatitude: -Infinity,
  })
  const longitudeSpan = bounds.maxLongitude - bounds.minLongitude || 0.0001
  const latitudeSpan = bounds.maxLatitude - bounds.minLatitude || 0.0001
  const scale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / longitudeSpan,
    (MAP_HEIGHT - MAP_PADDING * 2) / latitudeSpan,
  )
  const offsetX = (MAP_WIDTH - longitudeSpan * scale) / 2
  const offsetY = (MAP_HEIGHT - latitudeSpan * scale) / 2
  const projectCoordinate = ([longitude, latitude]) => ({
    x: offsetX + (longitude - bounds.minLongitude) * scale,
    y: offsetY + (bounds.maxLatitude - latitude) * scale,
  })
  const projectedPointsFor = (feature) => coordinatesForFeature(feature).map(projectCoordinate)
  const projectedBoundsFor = (feature) => projectedPointsFor(feature).reduce((current, point) => ({
    minX: Math.min(current.minX, point.x),
    maxX: Math.max(current.maxX, point.x),
    minY: Math.min(current.minY, point.y),
    maxY: Math.max(current.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })

  const focusFeature = (featureId) => {
    const feature = visibleFeatures.find((item) => item.id === featureId)
    if (!feature) return

    const featureBounds = projectedBoundsFor(feature)
    const centerX = (featureBounds.minX + featureBounds.maxX) / 2
    const centerY = (featureBounds.minY + featureBounds.maxY) / 2
    const featureSpan = Math.max(
      featureBounds.maxX - featureBounds.minX,
      (featureBounds.maxY - featureBounds.minY) * MAP_WIDTH / MAP_HEIGHT,
    )
    const width = Math.min(MAP_WIDTH / 3, Math.max(MAP_WIDTH / 24, featureSpan * 3))
    const height = MAP_HEIGHT * width / MAP_WIDTH

    setFocusedFeatureId(featureId)
    setViewBox({
      x: Math.min(MAP_WIDTH - width, Math.max(0, centerX - width / 2)),
      y: Math.min(MAP_HEIGHT - height, Math.max(0, centerY - height / 2)),
      width,
      height,
    })
  }

  useImperativeHandle(ref, () => ({ focusFeature }))

  const zoomAt = (pointX, pointY, factor) => {
    setViewBox((current) => {
      const width = Math.min(MAP_WIDTH, Math.max(MAP_WIDTH / 24, current.width * factor))
      const height = MAP_HEIGHT * width / MAP_WIDTH
      const centerX = current.x + pointX / MAP_WIDTH * current.width
      const centerY = current.y + pointY / MAP_HEIGHT * current.height

      return {
        x: Math.min(MAP_WIDTH - width, Math.max(0, centerX - pointX / MAP_WIDTH * width)),
        y: Math.min(MAP_HEIGHT - height, Math.max(0, centerY - pointY / MAP_HEIGHT * height)),
        width,
        height,
      }
    })
  }

  const handleWheel = (event) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    const pointX = (event.clientX - rect.left) / rect.width * MAP_WIDTH
    const pointY = (event.clientY - rect.top) / rect.height * MAP_HEIGHT
    zoomAt(pointX, pointY, event.deltaY < 0 ? 0.85 : 1.18)
  }

  const handlePointerMove = (event) => {
    if (!dragStart.current) return
    const { viewBox: start, clientX, clientY } = dragStart.current
    const rect = event.currentTarget.getBoundingClientRect()
    const x = start.x + (clientX - event.clientX) * start.width / rect.width
    const y = start.y + (clientY - event.clientY) * start.height / rect.height

    setViewBox({
      ...start,
      x: Math.min(MAP_WIDTH - start.width, Math.max(0, x)),
      y: Math.min(MAP_HEIGHT - start.height, Math.max(0, y)),
    })
  }

  return (
    <div className="geojson-map-frame">
      <svg
        className="geojson-map"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        role="img"
        aria-label={`${areaName} barangay boundary map`}
        onWheel={handleWheel}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          dragStart.current = { viewBox, clientX: event.clientX, clientY: event.clientY }
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { dragStart.current = null }}
        onPointerCancel={() => { dragStart.current = null }}
      >
        <rect className="geojson-map-water" width={MAP_WIDTH} height={MAP_HEIGHT} />
        <g className="geojson-map-boundaries">
          {visibleFeatures.map((feature) => (
            <path
              key={feature.id}
              d={projectFeature(feature, projectCoordinate)}
              className={`geojson-area ${feature.properties.risk} ${focusedFeatureId === feature.id ? 'focused' : ''}`}
            />
          ))}
        </g>
        {viewBox.width <= MAP_WIDTH / 3 && (() => {
          const fontSize = viewBox.height * 0.05
          const candidates = visibleFeatures.map((feature) => {
            const anchor = labelAnchorFor(feature, areaName, projectCoordinate)
            if (!anchor || anchor.x < viewBox.x || anchor.x > viewBox.x + viewBox.width
              || anchor.y < viewBox.y || anchor.y > viewBox.y + viewBox.height) return null

            const width = Math.max(fontSize * 1.4, feature.properties.name.length * fontSize * 0.62)
            const height = fontSize * 1.35
            return {
              feature,
              anchor,
              width,
              height,
              focused: focusedFeatureId === feature.id,
            }
          }).filter(Boolean).sort((left, right) => Number(right.focused) - Number(left.focused)
            || right.anchor.clearance - left.anchor.clearance)
          const placedLabels = []

          candidates.forEach((candidate) => {
            const { anchor, width, height } = candidate
            const overlaps = placedLabels.some((placed) => Math.abs(anchor.x - placed.x) < (width + placed.width) / 2
              && Math.abs(anchor.y - placed.y) < (height + placed.height) / 2)
            if (!overlaps) placedLabels.push({ ...candidate, x: anchor.x, y: anchor.y })
          })

          return (
            <g className="geojson-map-labels">
              {placedLabels.map(({ feature, x, y, width }) => (
                <text
                  key={feature.id}
                  className={`geojson-label ${focusedFeatureId === feature.id ? 'focused' : ''}`}
                  x={x}
                  y={y}
                  fontSize={fontSize}
                  textAnchor="middle"
                  textLength={width}
                  lengthAdjust="spacingAndGlyphs"
                  role="button"
                  tabIndex="0"
                  onClick={() => focusFeature(feature.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      focusFeature(feature.id)
                    }
                  }}
                >
                  {feature.properties.name}
                </text>
              ))}
            </g>
          )
        })()}
      </svg>
      <div className="map-zoom-controls" role="group" aria-label={`${areaName} map zoom controls`}>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAt(MAP_WIDTH / 2, MAP_HEIGHT / 2, 0.8)}>+</button>
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAt(MAP_WIDTH / 2, MAP_HEIGHT / 2, 1.25)}>−</button>
        <button type="button" className="map-zoom-reset" aria-label="Reset zoom" title="Reset zoom" onClick={() => setViewBox({ x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT })}>Reset</button>
      </div>
    </div>
  )
})

export default function MapPage({
  searchTerm,
  setSearchTerm,
  setSelectedBarangays,
  selectedLocationId,
  reports = [],
  nlpEvents = [],
  navigation,
  activeNav,
  setActiveNav,
  setScreen,
}) {
  const mapRefs = useRef({})
  const location = locationById(selectedLocationId)
  const mapFeatures = location
    ? mapGeometry.features.filter((feature) => feature.properties.city === location.map_city
      && (!location.map_municipality || feature.properties.municipality === location.map_municipality))
    : []
  const mapAreas = location ? [{ name: location.name, features: mapFeatures }] : []
  const query = searchTerm.trim().toLowerCase()
  const searchResults = query
    ? mapFeatures.filter((feature) => [
      feature.properties.name,
      feature.properties.city,
      feature.properties.municipality,
    ].some((value) => value.toLowerCase().includes(query))).slice(0, 8)
    : []

  const focusBarangay = (city, featureId) => {
    mapRefs.current[city]?.focusFeature(featureId)
    document.getElementById(`map-${city.toLowerCase()}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="phone-screen map-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-search-bar">
        <div className="search-input-wrap">
          <span className="search-icon">⌕</span>
          <input
            type="text"
            placeholder="Search location"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="chip chip-light">List</button>
        <button className="chip chip-blue">Map</button>
      </div>

      {query && searchResults.length > 0 && (
        <div className="search-dropdown">
          {searchResults.map((feature) => (
            <button
              key={feature.id}
              type="button"
              className="search-option"
              onClick={() => {
                setSearchTerm(feature.properties.name)
                setSelectedBarangays((current) =>
                  current.includes(feature.properties.name)
                    ? current
                    : [...current, feature.properties.name],
                )
                setSearchTerm('')
                focusBarangay(feature.properties.city, feature.id)
              }}
            >
              <div className="search-option-main">
                <span>{feature.properties.name}</span>
                <small>{[feature.properties.municipality, feature.properties.city].filter(Boolean).join(', ')}</small>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="map-scroll-area">
        <div className="map-area-list">
          {mapAreas.map((area) => (
            <section className="map-area-section" id={`map-${area.name.toLowerCase()}`} key={area.name}>
              <header className="map-area-heading">
                <div>
                  <h2>{area.name}</h2>
                  <p>{area.features.length} barangays · {reports.length + nlpEvents.length} local flood reports</p>
                </div>
              </header>
              {area.features.length > 0 && (
                <GeoJSONMap
                  ref={(map) => { mapRefs.current[area.name] = map }}
                  features={area.features}
                  areaName={area.name}
                />
              )}
              <details className="barangay-disclosure">
                <summary>View all {area.features.length} barangays</summary>
                <ul>
                  {area.features.map((feature) => (
                    <li key={feature.id}>
                      <button type="button" className="barangay-focus-button" onClick={() => focusBarangay(area.name, feature.id)}>
                        <span>{feature.properties.name}</span>
                        {feature.properties.municipality && <small>{feature.properties.municipality}</small>}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          ))}
        </div>
        {!mapFeatures.length && <p className="empty-state">No map boundaries are available for this location.</p>}
      </div>

      <div className="bottom-nav">
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setActiveNav(item.id)
              setScreen(item.id)
            }}
          >
            <span>{item.icon}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
