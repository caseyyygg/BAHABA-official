import { Icon } from '../components/Icon'
import { useEffect, useRef, useState } from 'react'
import { Map, Popup, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getMapReports, getLocationBounds } from '../api'
import { locationById, searchLocations } from '../locations'
setWorkerUrl(workerUrl)

export default function NationwideMap({ currentPsgc, preferred, navigation, setScreen }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [severity, setSeverity] = useState('')
  const [visibleOnly, setVisibleOnly] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [viewport, setViewport] = useState('')
  const [status, setStatus] = useState('Loading available reports…')
  const [reports, setReports] = useState([])
  const [unplaced, setUnplaced] = useState(0)
  const [next, setNext] = useState(null)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const popupRef = useRef(null)
  const focusRequest = useRef(0)

  useEffect(() => {
    const map = new Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: [122, 12], zoom: 4.5 })
    mapRef.current = map
    const bounds = () => { const b = map.getBounds(); setViewport([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(n => n.toFixed(6)).join(',')) }
    map.on('load', () => {
      map.addSource('reports', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 45 })
      map.addLayer({ id: 'clusters', type: 'circle', source: 'reports', filter: ['has', 'point_count'], paint: { 'circle-color': '#234f84', 'circle-radius': 20 } })
      map.addLayer({ id: 'counts', type: 'symbol', source: 'reports', filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 }, paint: { 'text-color': '#fff' } })
      map.addLayer({ id: 'points', type: 'circle', source: 'reports', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'severity'], 'high', '#dc2626', 'medium', '#d97706', '#15803d'], 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.on('click', 'clusters', async e => {
        const f = e.features[0]
        const zoom = await map.getSource('reports').getClusterExpansionZoom(f.properties.cluster_id)
        map.easeTo({ center: f.geometry.coordinates, zoom })
      })
      map.on('click', 'points', e => {
        const f = e.features[0]
        const text = document.createElement('p')
        text.textContent = [f.properties.city, f.properties.province, f.properties.barangay, f.properties.severity, f.properties.description].filter(Boolean).join(' · ')
        popupRef.current?.remove()
        popupRef.current = new Popup().setLngLat(e.lngLat).setDOMContent(text).addTo(map)
      })
      bounds()
    })
    map.on('moveend', bounds)
    map.on('error', () => setStatus('Map tiles unavailable. Available report details remain below.'))
    return () => { popupRef.current?.remove(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const own = ++generation.current
    setReports([]); setUnplaced(0); setNext(null)
    setBusy(true); setStatus('Loading available verified reports…')
    const timer = setTimeout(async () => {
      try {
        const data = await getMapReports({ ...(location ? { location } : visibleOnly && viewport ? { bbox: viewport } : {}), ...(severity ? { severity } : {}) })
        if (own !== generation.current) return
        setReports(data.reports); setNext(data.next)
        setUnplaced(data.reports.filter(r => !validPoint(r)).length)
        setStatus(data.reports.length ? `${data.reports.length} available reports${data.next ? ' — more available; load next page' : ''}` : 'No reports available here. This does not confirm absence of flooding.')
      } catch (e) { if (own === generation.current) setStatus(`Reports could not be loaded: ${e.message}`) }
      finally { if (own === generation.current) setBusy(false) }
    }, 250)
    return () => { clearTimeout(timer) }
  }, [location, severity, viewport, visibleOnly, refresh])

  useEffect(() => {
    mapRef.current?.getSource('reports')?.setData({ type: 'FeatureCollection', features: reports.filter(validPoint).map(r => ({ type: 'Feature', id: r.id, properties: r, geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude)] } })) })
  }, [reports])

  async function choose(id) {
    const own = ++focusRequest.current
    setLocation(id); setQuery(''); setFiltersOpen(false)
    if (!id) { mapRef.current?.flyTo({ center: [122, 12], zoom: 4.5 }); return }
    try {
      const { bounds } = await getLocationBounds(id)
      if (bounds && own === focusRequest.current) mapRef.current?.fitBounds(bounds, { padding: 80, maxZoom: 12 })
    } catch { /* Reports can still be viewed without geographic bounds. */ }
  }
  async function more() {
    const own = generation.current
    setBusy(true)
    try {
      const data = await getMapReports({ before: next, ...(location ? { location } : visibleOnly && viewport ? { bbox: viewport } : {}), ...(severity ? { severity } : {}) })
      if (own !== generation.current) return
      setReports(previous => [...previous, ...data.reports]); setNext(data.next)
      setUnplaced(previous => previous + data.reports.filter(r => !validPoint(r)).length)
    } catch (e) { if (own === generation.current) setStatus(e.message) } finally { if (own === generation.current) setBusy(false) }
  }
  return <div className="phone-screen map-screen nationwide-screen">
    <section className={`search-dock nationwide-controls ${filtersOpen ? "expanded" : ""}`}>
      <button type="button" className="search-dock-handle" aria-label={filtersOpen ? 'Collapse location search' : 'Expand location search'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><span /></button>
      <div className="top-search-bar"><div className="search-input-wrap"><Icon className="search-icon" name="search" size={17} /><input aria-label="Search location" value={query} onFocus={() => setFiltersOpen(true)} onChange={e => { setQuery(e.target.value); setFiltersOpen(true) }} placeholder="Search location" /></div></div>
      <div className="nationwide-filter-panel" hidden={!filtersOpen}>
      {query && <div className="location-results">{searchLocations(query).slice(0, 20).map(l => <button type="button" key={l.id} onClick={() => choose(l.id)}>{l.name}</button>)}</div>}
      <label>View location<select value={location} onChange={e => choose(e.target.value)}><option value="">Nationwide / visible map</option>{[...new Set([...preferred, currentPsgc, location].filter(Boolean))].map(id => <option key={id} value={id}>{locationById(id)?.name}</option>)}</select></label>
      <button type="button" disabled={!currentPsgc} onClick={() => choose(currentPsgc)}>Current location</button>
      <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh reports</button>
      {!location && <label><input type="checkbox" checked={visibleOnly} onChange={e => setVisibleOnly(e.target.checked)} /> Limit reports to visible map</label>}
      {!location && !visibleOnly && <small>Nationwide report list includes reports without map coordinates.</small>}
      <label>Severity<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="">All severities</option>{['low', 'medium', 'high'].map(s => <option key={s}>{s}</option>)}</select></label>
      <small>Viewing a location does not change your notifications. Some LGUs do not supply data.</small>
      </div>
    </section>
    <div ref={container} className="nationwide-canvas" aria-label="Nationwide flood report map" />
    <details className="nationwide-location-panel"><summary><span><strong>{locationById(location)?.name || 'Philippines'}</strong><small>View {reports.length} available report{reports.length === 1 ? '' : 's'}</small></span><span className="panel-chevron" aria-hidden="true">⌃</span></summary><div className="nationwide-report-list" aria-live="polite"><p>{status}</p>{unplaced > 0 && <p>{unplaced} reports have no verified map coordinates; see their location details below.</p>}
      {reports.map(r => <article key={r.id}><strong>{[r.city, r.province, r.barangay].filter(Boolean).join(', ')} — {r.severity}</strong><p>{r.description}</p></article>)}
      {next && <button type="button" disabled={busy} onClick={more}>Load more available reports</button>}
    </div></details>
    <nav className="bottom-nav nationwide-nav" aria-label="Primary">{navigation.map(n => <button type="button" className={n.id === "map" ? "nav-item active" : "nav-item"} aria-current={n.id === "map" ? "page" : undefined} key={n.id} onClick={() => setScreen(n.id)}><span className="nav-icon"><Icon name={n.icon} size={20} /></span><small>{n.label}</small></button>)}</nav>
  </div>
}
function validPoint(r) { return r.latitude !== null && r.longitude !== null && Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude)) && Number(r.latitude) >= 4 && Number(r.latitude) <= 22 && Number(r.longitude) >= 116 && Number(r.longitude) <= 128 }
