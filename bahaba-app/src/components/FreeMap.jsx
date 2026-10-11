import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Map as LibreMap, LngLatBounds, Popup, Marker, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { floodPointsFor } from '../floodMap'
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
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [121, 14.6],
        zoom: 11,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      const syncPings = () => {
        pings.forEach((marker) => marker.remove())
        pings = floodPointsFor(floodAreasRef.current).features.map((point) => {
          const element = document.createElement('div')
          element.className = 'flood-ping'
          element.setAttribute('aria-hidden', 'true')
          element.style.setProperty('--ping-color', { high: '#dc2626', medium: '#f59e0b', low: '#16a34a' }[point.properties.severity] || '#64748b')
          const ring = document.createElement('span')
          ring.className = 'flood-ping-ring'
          element.append(ring)
          return new Marker({ element, anchor: 'center' }).setLngLat(point.geometry.coordinates).addTo(map)
        })
      }
      syncPingsRef.current = syncPings
      const padding = { top: 120, right: 24, bottom: 190, left: 24 }
      const bounds = boundsForFeatures(features)
      if (!bounds.isEmpty()) map.fitBounds(bounds, { padding, duration: 0 })
      let selectedFeature = null
      const highlightData = () => ({
        type: 'FeatureCollection',
        features: selectedFeature ? [selectedFeature] : [],
      })
      map.on('style.load', () => {
        const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
        const severityColor = ['match', ['get', 'severity'], 'high', '#dc2626', 'medium', '#f59e0b', 'low', '#16a34a', '#64748b']
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
          paint: { 'fill-color': severityColor, 'fill-opacity': ['case', ['==', ['get', 'precision'], 'barangay-only'], 0.08, 0.38] },
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
        syncPings()
      })
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
    return () => {
      observer?.disconnect()
      pings.forEach((marker) => marker.remove())
      syncPingsRef.current = null
      popup?.remove()
      focusRef.current = null
      mapRef.current = null
      map?.remove()
    }
  }, [features, scopeBoundary, areaName])

  return (
    <div className="free-map-frame">
      <div ref={container} className="free-map-canvas" aria-label={`Map of ${areaName}`} />
      {error && <p className="free-map-error" role="alert">{error}</p>}
    </div>
  )
})
