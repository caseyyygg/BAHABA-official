import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Map as LibreMap, LngLatBounds, Popup, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { floodPointsFor } from '../floodMap'
import { LUZON_CAMERA } from '../mapCamera'
import { reportSeverityColor, reportSeverityExpression } from '../../scripts/report-severity.mjs'
import './floodPings.css'

setWorkerUrl(workerUrl)

function boundsForFeatures(features) {
  const bounds = new LngLatBounds()
  for (const feature of features) {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates] : feature.geometry.coordinates
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const coordinate of ring) bounds.extend(coordinate)
      }
    }
  }
  return bounds
}

export const FreeMap = forwardRef(function FreeMap({ features, scopeBoundary, areaName, floodAreas }, ref) {
  const container = useRef(null)
  const focusRef = useRef(null)
  const pendingFocus = useRef(null)
  const mapRef = useRef(null)
  const floodAreasRef = useRef(floodAreas)
  const syncPingsRef = useRef(null)
  const [error, setError] = useState('')
  const [lifelinesEnabled, setLifelinesEnabled] = useState(true)
  const [lifelineStatus, setLifelineStatus] = useState('Loading nearby bridges, hospitals, and services…')

  useImperativeHandle(ref, () => ({
    focusFeature(id) {
      pendingFocus.current = id
      focusRef.current?.(id)
    },
  }), [])

  useEffect(() => {
    floodAreasRef.current = floodAreas
    mapRef.current?.getSource('flood-alerts')?.setData(floodAreas)
    mapRef.current?.getSource('flood-points')?.setData(floodPointsFor(floodAreas))
    syncPingsRef.current?.()
  }, [floodAreas, features, areaName])

  useEffect(() => {
    let map
    let popup
    let observer
    let pings = []
    try {
      map = new LibreMap({
        container: container.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        // Start with the Luzon island group visible; users can zoom and pan
        // to their preferred city after the overview has loaded.
        ...LUZON_CAMERA,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      const syncPings = () => {
        pings.forEach((marker) => marker.remove())
        pings = floodPointsFor(floodAreasRef.current).features.map((point) => {
          const element = document.createElement('div')
          element.className = 'flood-ping'
          element.setAttribute('aria-hidden', 'true')
          element.style.setProperty('--ping-color', reportSeverityColor(point.properties.severity))
          const ring = document.createElement('span')
          ring.className = 'flood-ping-ring'
          element.append(ring)
          return new Marker({ element, anchor: 'center' }).setLngLat(point.geometry.coordinates).addTo(map)
        })
      }
      syncPingsRef.current = syncPings
      const padding = { top: 120, right: 24, bottom: 190, left: 24 }
      // Do not replace the overview with the selected municipality on load.
      // Search and location controls remain available for deliberate navigation.
      let selectedFeature = null
      const highlightData = () => ({
        type: 'FeatureCollection',
        features: selectedFeature ? [selectedFeature] : [],
      })
      map.on('style.load', () => {
        const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
        const severityColor = reportSeverityExpression()
        map.addSource('barangay-boundaries', { type: 'geojson', data: { type: 'FeatureCollection', features } })
        map.addLayer({
          id: 'barangay-boundary-lines', type: 'line', source: 'barangay-boundaries',
          paint: { 'line-color': '#6995b8', 'line-width': 1, 'line-opacity': 0.85 },
        }, firstLabel)
        map.addSource('lgu-boundary', { type: 'geojson', data: { type: 'FeatureCollection', features: scopeBoundary ? [scopeBoundary] : [] } })
        map.addLayer({
          id: 'lgu-boundary-line', type: 'line', source: 'lgu-boundary',
          paint: { 'line-color': '#173e77', 'line-width': 3, 'line-dasharray': [8, 5] },
        }, firstLabel)
        map.addSource('flood-alerts', { type: 'geojson', data: floodAreasRef.current })
        map.addLayer({
          id: 'flood-alert-fill', type: 'fill', source: 'flood-alerts',
          paint: { 'fill-color': severityColor, 'fill-opacity': ['case', ['==', ['get', 'precision'], 'barangay-only'], 0.28, 0.38] },
        }, firstLabel)
        map.addLayer({
          id: 'flood-alert-outline', type: 'line', source: 'flood-alerts',
          paint: { 'line-color': severityColor, 'line-width': 3 },
        }, firstLabel)
        map.addSource('selected-barangay', { type: 'geojson', data: highlightData() })
        map.addLayer({
          id: 'selected-barangay-fill',
          type: 'fill',
          source: 'selected-barangay',
          paint: { 'fill-color': '#2382ed', 'fill-opacity': 0.12 },
        }, firstLabel)
        map.addLayer({
          id: 'selected-barangay-outline',
          type: 'line',
          source: 'selected-barangay',
          paint: { 'line-color': '#145cbe', 'line-width': 3 },
        }, firstLabel)
        map.addSource('flood-points', { type: 'geojson', data: floodPointsFor(floodAreasRef.current) })
        map.addLayer({
          id: 'flood-point-halo', type: 'circle', source: 'flood-points',
          paint: { 'circle-radius': 18, 'circle-color': severityColor, 'circle-opacity': 0.22, 'circle-blur': 0.3 },
        })
        map.addLayer({
          id: 'flood-point-dot', type: 'circle', source: 'flood-points',
          paint: { 'circle-radius': 7, 'circle-color': severityColor, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
        })
        map.addSource('lifelines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'lifeline-points', type: 'circle', source: 'lifelines',
          paint: {
            'circle-radius': 7,
            'circle-color': ['match', ['get', 'category'], 'health', '#dc2626', 'bridge', '#475569', 'worship', '#7c3aed', 'education', '#2563eb', 'transit', '#0891b2', 'public_safety', '#ea580c', 'government', '#15803d', 'utility', '#a16207', '#475569'],
            'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
          },
        })
        syncPings()
      })
      map.on('click', 'lifeline-points', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        popup?.remove()
        const content = document.createElement('div')
        const title = document.createElement('strong')
        title.textContent = feature.properties.name || 'Nearby lifeline'
        const category = document.createElement('p')
        category.textContent = feature.properties.label
        const source = document.createElement('small')
        source.textContent = 'OpenStreetMap contributor data'
        content.append(title, category, source)
        popup = new Popup({ maxWidth: '280px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(map)
      })
      map.on('mouseenter', 'lifeline-points', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'lifeline-points', () => { map.getCanvas().style.cursor = '' })
      map.on('click', (event) => {
        const layers = ['flood-point-dot', 'flood-alert-fill'].filter((id) => map.getLayer(id))
        if (!layers.length) return
        const hits = map.queryRenderedFeatures(event.point, { layers })
        const hit = layers.map((id) => hits.find((item) => item.layer.id === id)).find(Boolean)
        const properties = hit?.properties
        if (!properties) return
        popup?.remove()
        const content = document.createElement('div')
        content.className = 'flood-map-popup'
        const title = document.createElement('strong')
        title.textContent = `${properties.name} · ${properties.count} flood report${Number(properties.count) === 1 ? '' : 's'}`
        const description = document.createElement('p')
        description.textContent = properties.details
        const precision = document.createElement('small')
        precision.textContent = properties.precision === 'reported-point'
          ? 'Exact point selected by the LGU reporter. The actual flood extent is unverified.'
          : properties.precision === 'street'
          ? 'Reported on this named street. Marker identifies the mapped road, not an exact flooded stretch.'
          : properties.precision === 'landmark'
          ? 'Reported at this mapped landmark. The actual flood extent is unverified.'
          : 'Flooding reported within this barangay. The highlighted border identifies the barangay; the exact flooded streets are unknown.'
        content.append(title, description, precision)
        if (properties.source) {
          const source = document.createElement('a')
          source.href = properties.source
          source.textContent = 'View mapped landmark'
          source.target = '_blank'
          source.rel = 'noopener noreferrer'
          content.append(document.createElement('br'), source)
        }
        popup = new Popup({ maxWidth: '280px' }).setLngLat(hit.geometry.type === 'Point' ? hit.geometry.coordinates : event.lngLat).setDOMContent(content).addTo(map)
      })
      for (const layer of ['flood-point-dot', 'flood-alert-fill']) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      }
      focusRef.current = (id) => {
        const feature = features.find((item) => String(item.id) === String(id))
        if (!feature) return
        const target = boundsForFeatures([feature])
        if (target.isEmpty()) return
        selectedFeature = feature
        map.getSource('selected-barangay')?.setData(highlightData())
        const landmark = floodAreasRef.current.points?.find((item) => item.properties.barangay === feature.properties.name)
        if (landmark) map.flyTo({ center: landmark.geometry.coordinates, zoom: 16, duration: 650 })
        else map.fitBounds(target, { padding, maxZoom: 16, duration: 650 })
        popup?.remove()
        const label = document.createElement('strong')
        label.textContent = landmark?.properties.name || feature.properties.name || areaName
        const content = document.createElement('div')
        content.append(label)
        const flood = landmark || floodAreasRef.current.features.find((item) => String(item.id) === String(id))
        if (flood) {
          const details = document.createElement('p')
          details.textContent = flood.properties.details
          const precision = document.createElement('small')
          precision.textContent = landmark ? 'Reported at this mapped landmark. Actual flood extent unverified.' : 'Flooding reported within this barangay. Exact flooded section unknown.'
          content.append(details, precision)
        }
        popup = new Popup({ offset: 12, maxWidth: '280px' }).setLngLat(landmark?.geometry.coordinates || target.getCenter()).setDOMContent(content).addTo(map)
      }
      if (pendingFocus.current !== null) focusRef.current(pendingFocus.current)
      map.on('error', (event) => {
        console.error('OpenFreeMap could not load:', event.error)
        setError('Some map details could not load. Check your internet connection.')
      })
      map.on('idle', () => setError(''))
      observer = new ResizeObserver(() => map.resize())
      observer.observe(container.current)
    } catch (failure) {
      console.error('Map initialization failed:', failure)
      setError('Map unavailable. Check that your browser supports WebGL and refresh.')
    }

    let lifelineRequest = 0
    const loadLifelines = async () => {
      const source = map?.getSource('lifelines')
      if (!source || !lifelinesEnabled) return
      if (!scopeBoundary?.geometry) {
        setLifelineStatus('Choose an LGU to show nearby lifelines.')
        return
      }
      const own = ++lifelineRequest
      const scope = areaName || 'Philippines'
      const cacheKey = `bahaba-map-lifelines-v1-${scope}`
      try {
        const saved = JSON.parse(localStorage.getItem(cacheKey) || 'null')
        if (saved?.expires > Date.now() && Array.isArray(saved.features)) {
          source.setData({ type: 'FeatureCollection', features: saved.features })
          setLifelineStatus(`${saved.features.length} nearby places · OpenStreetMap`)
          return
        }
      } catch { /* Use the live map query when local storage is unavailable. */ }
      const coords = scopeBoundary.geometry.coordinates
      let south = 90, west = 180, north = -90, east = -180
      const visit = value => {
        if (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number') {
          west = Math.min(west, value[0]); east = Math.max(east, value[0])
          south = Math.min(south, value[1]); north = Math.max(north, value[1])
        } else if (Array.isArray(value)) value.forEach(visit)
      }
      visit(coords)
      if (south > north || west > east) {
        setLifelineStatus('LGU boundary unavailable for nearby places.')
        return
      }
      setLifelineStatus('Loading nearby lifelines from OpenStreetMap…')
      const bbox = `${south},${west},${north},${east}`
      const query = `[out:json][timeout:20];(nwr["amenity"~"^(place_of_worship|hospital|clinic|doctors|health_centre|school|college|university|kindergarten|bus_station|ferry_terminal|bus_stop|fire_station|police|townhall)$"](${bbox});nwr["healthcare"~"^(hospital|clinic|doctor|centre)$"](${bbox});nwr["office"="government"](${bbox});nwr["bridge"="yes"](${bbox});way["man_made"="bridge"](${bbox});nwr["railway"~"^(station|halt)$"](${bbox});nwr["public_transport"="station"](${bbox});nwr["aeroway"="terminal"](${bbox});nwr["power"~"^(substation|plant|generator)$"](${bbox});nwr["man_made"~"^(water_works|pumping_station)$"](${bbox}););out center tags;`
      try {
        const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error('OpenStreetMap query failed')
        const data = await response.json()
        if (own !== lifelineRequest || !lifelinesEnabled) return
        const insideRing = (ring, lon, lat) => {
          let inside = false
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j]
            if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
          }
          return inside
        }
        const isInside = (lon, lat) => {
          const geometry = scopeBoundary.geometry
          const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
          return polygons.some(polygon => insideRing(polygon[0], lon, lat) && !polygon.slice(1).some(ring => insideRing(ring, lon, lat)))
        }
        const categorize = tags => {
          if (tags.amenity === 'place_of_worship') return 'worship'
          if (['hospital', 'clinic', 'doctors', 'health_centre'].includes(tags.amenity) || ['hospital', 'clinic', 'doctor', 'centre'].includes(tags.healthcare)) return 'health'
          if (['school', 'college', 'university', 'kindergarten'].includes(tags.amenity)) return 'education'
          if (tags.bridge === 'yes' || tags.man_made === 'bridge') return 'bridge'
          if (['bus_station', 'ferry_terminal', 'bus_stop'].includes(tags.amenity) || tags.highway === 'bus_stop' || ['station', 'halt'].includes(tags.railway) || tags.public_transport === 'station' || tags.aeroway === 'terminal') return 'transit'
          if (['fire_station', 'police'].includes(tags.amenity)) return 'public_safety'
          if (tags.office === 'government' || tags.amenity === 'townhall') return 'government'
          if (['substation', 'plant', 'generator'].includes(tags.power) || ['water_works', 'pumping_station'].includes(tags.man_made)) return 'utility'
          return ''
        }
        const features = [], seen = new Set()
        for (const element of data.elements || []) {
          const tags = element.tags || {}, category = categorize(tags)
          const lat = element.lat ?? element.center?.lat, lon = element.lon ?? element.center?.lon
          if (!category || !Number.isFinite(lat) || !Number.isFinite(lon) || !isInside(lon, lat)) continue
          const key = `${element.type}/${element.id}`
          if (seen.has(key)) continue
          seen.add(key)
          const labels = { worship: 'Place of worship', health: 'Hospital or clinic', education: 'School', bridge: 'Bridge', transit: 'Transit', public_safety: 'Public safety', government: 'Government service', utility: 'Utility' }
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { category, label: labels[category], name: tags.name || tags.operator || labels[category] } })
        }
        map?.getSource('lifelines')?.setData({ type: 'FeatureCollection', features })
        try { localStorage.setItem(cacheKey, JSON.stringify({ expires: Date.now() + 86400000, features })) } catch { /* Map remains usable without a cache. */ }
        setLifelineStatus(`${features.length} nearby places · OpenStreetMap`)
      } catch {
        if (own === lifelineRequest) setLifelineStatus('Nearby-place data unavailable. Check your connection and retry.')
      }
    }
    const waitForStyle = () => map?.isStyleLoaded() && map.getSource('lifelines') ? loadLifelines() : map?.once('idle', waitForStyle)
    if (lifelinesEnabled) waitForStyle()
    else {
      lifelineRequest++
      map?.getSource('lifelines')?.setData({ type: 'FeatureCollection', features: [] })
      setLifelineStatus('Nearby lifelines hidden.')
    }
    return () => {
      observer?.disconnect()
      pings.forEach((marker) => marker.remove())
      syncPingsRef.current = null
      popup?.remove()
      focusRef.current = null
      mapRef.current = null
      map?.remove()
    }
  }, [features, scopeBoundary, areaName, lifelinesEnabled])

  return (
    <div className="free-map-frame">
      <div ref={container} className="free-map-canvas" aria-label={`Map of ${areaName}`} />
      <div className="free-map-lifelines">
        <label><input type="checkbox" checked={lifelinesEnabled} onChange={event => setLifelinesEnabled(event.target.checked)} /> Nearby lifelines</label>
        <small>{lifelineStatus}</small>
        <small className="free-map-lifelines-legend">Purple worship · gray bridges · red hospitals · blue schools · teal transit</small>
      </div>
      {error && <p className="free-map-error" role="alert">{error}</p>}
    </div>
  )
})
