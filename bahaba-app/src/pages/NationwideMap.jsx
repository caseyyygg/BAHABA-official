import { Icon } from '../components/Icon'
import { LUZON_CAMERA } from '../mapCamera'
import { useEffect, useRef, useState } from 'react'
import { Map, Popup, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../components/floodPings.css'
import { getMapReports, getFloodSignals, getLocationBounds } from '../api'
import { locationById, searchLocations } from '../locations'
import { activeSignalFeatures, activeCitySignals } from '../cityFloodSignals'
import { mapReportAreas, mapReportPoints, validMapReportPoint } from '../mapReportAreas'
import { reportSeverityExpression } from '../../scripts/report-severity.mjs'
const barangayGeometryUrl = new URL('../assets/targeted-barangay-geometry.json', import.meta.url).href
setWorkerUrl(workerUrl)

export default function NationwideMap({ currentPsgc, currentLocation, locationSharingEnabled, preferred, navigation, setScreen }) {
  const container = useRef(null)
  const mapRef = useRef(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [severity, setSeverity] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [signalRefresh, setSignalRefresh] = useState(0)
  const [status, setStatus] = useState('Loading available reports…')
  const [reports, setReports] = useState([])
  const [barangayFeatures, setBarangayFeatures] = useState([])
  const [areaGeometryError, setAreaGeometryError] = useState('')
  const [signals, setSignals] = useState({cities:[],pins:[]})
  const [signalStatus, setSignalStatus] = useState('Loading automated NLP flood reports…')
  const reportsRef = useRef(reports)
  reportsRef.current = reports
  const barangayFeaturesRef = useRef(barangayFeatures)
  barangayFeaturesRef.current = barangayFeatures
  const [signalClock, setSignalClock] = useState(Date.now)
  const signalsRef = useRef(signals)
  signalsRef.current = signals
  const [unplaced, setUnplaced] = useState(0)
  const [next, setNext] = useState(null)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const popupRef = useRef(null)
  const focusRequest = useRef(0)
  const currentLocationRef = useRef(currentLocation)
  currentLocationRef.current = currentLocation
  const signalWindowLabel = 'today (Philippine time)'

  useEffect(() => {
    // Start with Luzon in view; the old nationwide camera made the island too
    // small to inspect on a phone-sized map.
    const map = new Map({ container: container.current, style: {
      version: 8,
      sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    }, ...LUZON_CAMERA })
    mapRef.current = map
    let pulseFrame
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pulse = (time) => {
      if (map.getLayer('report-pulse')) {
        const breath = reducedMotion.matches ? 0.5 : (Math.sin(time / 550) + 1) / 2
        map.setPaintProperty('report-pulse', 'circle-radius', 13 + breath * 7)
        map.setPaintProperty('report-pulse', 'circle-opacity', 0.16 + breath * 0.12)
      }
      if (map.getLayer('social-signal-borders')) {
        const breath = reducedMotion.matches ? 0.5 : (Math.sin(time / 700) + 1) / 2
        map.setPaintProperty('social-signal-borders', 'line-opacity', 0.55 + breath * 0.45)
        map.setPaintProperty('social-signal-borders', 'line-width', 2.5 + breath * 2)
      }
      if (map.getLayer('social-signal-halo')) {
        const breath = reducedMotion.matches ? 0.5 : (Math.sin(time / 550) + 1) / 2
        map.setPaintProperty('social-signal-halo', 'circle-radius', 13 + breath * 9)
      }
      pulseFrame = requestAnimationFrame(pulse)
    }
    map.on('load', () => {
      map.addSource('social-signals', {type:'geojson',data:activeSignalFeatures(signalsRef.current)})
      const signalColor = reportSeverityExpression()
      map.addLayer({id:'social-signal-areas',type:'fill',source:'social-signals',filter:['!=',['geometry-type'],'Point'],paint:{'fill-color':signalColor,'fill-opacity':['case',['==',['get','precision_level'],'city'],0.1,0.28]}})
      map.addLayer({id:'social-signal-borders',type:'line',source:'social-signals',filter:['!=',['geometry-type'],'Point'],paint:{'line-color':signalColor,'line-width':3}})
      map.addLayer({id:'social-signal-halo',type:'circle',source:'social-signals',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':signalColor,'circle-radius':18,'circle-opacity':0.25}})
      map.addLayer({id:'social-signal-points',type:'circle',source:'social-signals',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':signalColor,'circle-radius':8,'circle-stroke-color':signalColor,'circle-stroke-width':2}})
      for (const layer of ['social-signal-areas','social-signal-points']) map.on('click',layer,event=>{
        const pin=event.features?.[0]?.properties;if(!pin)return
        const node=document.createElement('div')
        const latestValue=String(pin.latest_post_at||'').trim().replace(' ','T')
        const latest=new Date(latestValue&& !/[zZ]$|[+-]\d{2}:\d{2}$/.test(latestValue)?latestValue+'Z':latestValue)
        const latestLabel=Number.isFinite(latest.getTime())?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(latest)+' PHT':'time unavailable'
        const locationLabel=pin.precision_level==='landmark'?'mapped landmark point':'barangay shaded area'
        node.textContent=`AUTOMATED NLP FLOOD REPORT. ${pin.label} (${locationLabel}). ${pin.post_count} matched post${Number(pin.post_count)===1?'':'s'}. NLP severity: ${pin.severity}. Latest post: ${latestLabel}.`
        popupRef.current?.remove();popupRef.current=new Popup({maxWidth:'300px'}).setLngLat(event.lngLat).setDOMContent(node).addTo(map)
      })
      map.addSource('report-areas', { type: 'geojson', data: mapReportAreas(reportsRef.current, barangayFeaturesRef.current) })
      const reportAreaColor = reportSeverityExpression()
      map.addLayer({ id: 'report-area-fill', type: 'fill', source: 'report-areas', paint: { 'fill-color': reportAreaColor, 'fill-opacity': 0.28 } })
      map.addLayer({ id: 'report-area-outline', type: 'line', source: 'report-areas', paint: { 'line-color': reportAreaColor, 'line-width': 2.5 } })
      map.addSource('reports', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 45 })
      map.addSource('current-location', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'current-location-halo', type: 'circle', source: 'current-location', paint: { 'circle-color': '#16a765', 'circle-radius': 13, 'circle-opacity': 0.2 } })
      map.addLayer({ id: 'current-location-dot', type: 'circle', source: 'current-location', paint: { 'circle-color': '#16a765', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
      map.addLayer({ id: 'clusters', type: 'circle', source: 'reports', filter: ['has', 'point_count'], paint: { 'circle-color': '#234f84', 'circle-radius': 20 } })
      map.addLayer({ id: 'counts', type: 'symbol', source: 'reports', filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 12 }, paint: { 'text-color': '#fff' } })
      const reportColor = reportSeverityExpression()
      map.addLayer({ id: 'report-pulse', type: 'circle', source: 'reports', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': reportColor, 'circle-radius': 16, 'circle-opacity': 0.22 } })
      map.addLayer({ id: 'points', type: 'circle', source: 'reports', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': reportColor, 'circle-radius': 8, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } })
      pulseFrame = requestAnimationFrame(pulse)
      const initialLocation = currentLocationRef.current
      if (initialLocation) map.getSource('current-location').setData(locationFeature(initialLocation))
      map.on('click', 'clusters', async e => {
        const f = e.features[0]
        const zoom = await map.getSource('reports').getClusterExpansionZoom(f.properties.cluster_id)
        map.easeTo({ center: f.geometry.coordinates, zoom })
      })
      map.on('click', 'points', e => {
        const f = e.features[0]
        const text = document.createElement('div')
        text.className = 'report-pin-card'
        const reportedSeverity = String(f.properties.severity || '').toLowerCase()
        const severityLevel = reportedSeverity === 'moderate' ? 'medium' : reportedSeverity
        const badge = document.createElement('span')
        badge.className = `report-pin-badge severity-${severityLevel}`
        badge.textContent = `${severityLevel === 'medium' ? 'Moderate' : severityLevel ? severityLevel[0].toUpperCase() + severityLevel.slice(1) : 'Unknown'} flood level`
        const title = document.createElement('strong')
        title.textContent = f.properties.barangay || f.properties.city || 'Flood report'
        const place = document.createElement('span')
        place.className = 'report-pin-place'
        place.textContent = [f.properties.city, f.properties.province].filter(Boolean).join(', ')
        const description = document.createElement('p')
        description.textContent = f.properties.description || 'Flooding reported'
        const levels = document.createElement('div')
        levels.className = `report-pin-levels severity-${severityLevel}`
        levels.setAttribute('aria-label', `Reported ${f.properties.severity || 'unspecified'} flood level. Reference thresholds: low under 1.64 feet, moderate 1.64 to 3.28 feet, high 3.28 to 6.56 feet.`)
        for (const [level, threshold] of [['low', '<1.64 ft'], ['medium', '1.64–3.28 ft'], ['high', '3.28–6.56 ft']]) {
          const item = document.createElement('div')
          item.className = `report-pin-level ${level}`
          const water = document.createElement('i')
          const name = document.createElement('strong')
          name.textContent = level === 'medium' ? 'Moderate' : level[0].toUpperCase() + level.slice(1)
          const depth = document.createElement('small')
          depth.textContent = threshold
          item.append(water, name, depth)
          levels.append(item)
        }
        const posted = document.createElement('time')
        posted.textContent = formatPostedDate(f.properties.created_at)
        text.append(badge, title, place, levels, description, posted)
        popupRef.current?.remove()
        popupRef.current = new Popup({ className: 'report-pin-popup', offset: 16, maxWidth: '280px' }).setLngLat(f.geometry.coordinates).setDOMContent(text).addTo(map)
      })
      map.on('click', 'report-area-fill', e => {
        const feature = e.features?.[0]
        if (!feature) return
        const details = document.createElement('div')
        const title = document.createElement('strong')
        title.textContent = `${feature.properties.barangay}, ${feature.properties.city}`
        const summary = document.createElement('p')
        summary.textContent = `${feature.properties.count} verified flood report${Number(feature.properties.count) === 1 ? '' : 's'} · ${feature.properties.severity} severity`
        const note = document.createElement('small')
        note.textContent = 'Shading covers the reported barangay; the exact flooded area is not specified.'
        details.append(title, summary, note)
        popupRef.current?.remove()
        popupRef.current = new Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setDOMContent(details).addTo(map)
      })
    })
    map.on('error', () => setStatus('Map tiles unavailable. Available report details remain below.'))
    return () => { cancelAnimationFrame(pulseFrame); popupRef.current?.remove(); map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch(barangayGeometryUrl)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(data => {
        if (!Array.isArray(data.features)) throw new Error('Barangay geometry is malformed.')
        if (!cancelled) {
          setBarangayFeatures(data.features)
          setAreaGeometryError('')
        }
      })
      .catch(error => {
        if (!cancelled) setAreaGeometryError(`Barangay shading could not be loaded: ${error.message}`)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const source = mapRef.current?.getSource('current-location')
    source?.setData(locationSharingEnabled && currentLocation ? locationFeature(currentLocation) : { type: 'FeatureCollection', features: [] })
  }, [currentLocation, locationSharingEnabled])

  useEffect(() => {
    const own = ++generation.current
    setNext(null)
    setBusy(true); setStatus('Loading available verified reports…')
    const timer = setTimeout(async () => {
      try {
        const data = await getMapReports({ include_signals:'0', ...(location ? { location } : {}), ...(severity ? { severity } : {}) })
        if (own !== generation.current) return
        setReports(data.reports); setNext(data.next)
        setUnplaced(data.reports.filter(r => !validMapReportPoint(r)).length)
        setStatus(data.reports.length ? `${data.reports.length} available reports${data.next ? ' — more available; load next page' : ''}` : 'No reports available here. This does not confirm absence of flooding.')
      } catch (e) { if (own === generation.current) setStatus(`Reports could not be loaded: ${e.message}`) }
      finally { if (own === generation.current) setBusy(false) }
    }, 250)
    return () => { clearTimeout(timer) }
  }, [location, severity, refresh])

  useEffect(() => {
    setSignals({cities:[],pins:[]})
  }, [location])

  useEffect(() => {
    let cancelled = false
    setSignalStatus('Loading automated NLP flood reports…')
    getFloodSignals(location).then(data => {
      if (cancelled) return
      if (!Array.isArray(data.cities) || !Array.isArray(data.pins)) throw new Error('The flood-signal service returned an invalid response.')
      setSignals(data)
      setSignalStatus(activeSignalFeatures(data, Date.now()).features.length
        ? ''
        : 'No current automated NLP flood reports were returned for this view.')
    }).catch(error => {
      if (!cancelled) setSignalStatus(`Automated NLP flood reports could not be loaded: ${error.message}`)
    })
    return () => { cancelled = true }
  }, [location, signalRefresh])

  useEffect(()=>{
    const refreshSignals=()=>{
      if(document.visibilityState!=='visible')return
      setSignalClock(Date.now())
      setSignalRefresh(value=>value+1)
    }
    const timer=setInterval(refreshSignals,10000)
    window.addEventListener('focus',refreshSignals)
    document.addEventListener('visibilitychange',refreshSignals)
    return()=>{
      clearInterval(timer)
      window.removeEventListener('focus',refreshSignals)
      document.removeEventListener('visibilitychange',refreshSignals)
    }
  },[])
  useEffect(()=>{mapRef.current?.getSource('social-signals')?.setData(activeSignalFeatures(signals,signalClock))},[signals,signalClock])

  useEffect(() => {
    mapRef.current?.getSource('reports')?.setData(mapReportPoints(reports))
    mapRef.current?.getSource('report-areas')?.setData(mapReportAreas(reports, barangayFeatures))
  }, [reports, barangayFeatures])

  async function choose(id) {
    const own = ++focusRequest.current
    setLocation(id); setQuery(''); setFiltersOpen(false)
    if (!id) { mapRef.current?.flyTo(LUZON_CAMERA); return }
    try {
      const { bounds } = await getLocationBounds(id)
      if (bounds && own === focusRequest.current) mapRef.current?.fitBounds(bounds, { padding: 80, maxZoom: 12 })
    } catch { /* Reports can still be viewed without geographic bounds. */ }
  }
  async function more() {
    const own = generation.current
    setBusy(true)
    try {
      const data = await getMapReports({ before: next, ...(location ? { location } : {}), ...(severity ? { severity } : {}) })
      if (own !== generation.current) return
      setReports(previous => [...previous, ...data.reports]); setNext(data.next)
      setUnplaced(previous => previous + data.reports.filter(r => !validMapReportPoint(r)).length)
    } catch (e) { if (own === generation.current) setStatus(e.message) } finally { if (own === generation.current) setBusy(false) }
  }
  return <div className="phone-screen map-screen nationwide-screen">
    <section className={`search-dock nationwide-controls ${filtersOpen ? "expanded" : ""}`}>
      <button type="button" className="search-dock-handle" aria-label={filtersOpen ? 'Collapse location search' : 'Expand location search'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><span /></button>
      <div className="top-search-bar"><div className="search-input-wrap"><Icon className="search-icon" name="search" size={17} /><input aria-label="Search location" value={query} onFocus={() => setFiltersOpen(true)} onChange={e => { setQuery(e.target.value); setFiltersOpen(true) }} placeholder="Search location" /></div></div>
      <div className="nationwide-filter-panel" hidden={!filtersOpen}>
      {query && <div className="location-results">{searchLocations(query).slice(0, 20).map(l => <button type="button" key={l.id} onClick={() => choose(l.id)}>{l.name}</button>)}</div>}
      <details className="map-location-filter">
        <summary><span>View location</span><strong>{locationById(location)?.name || 'Nationwide'}</strong><span className="map-location-chevron" aria-hidden="true">⌄</span></summary>
        <div className="map-location-options" role="group" aria-label="Choose map location">
          {[['', 'Nationwide'], ...[...new Set([...preferred, currentPsgc, location].filter(Boolean))].map(id => [id, locationById(id)?.name || id])].map(([id, name]) => (
            <button type="button" key={id || 'nationwide'} className={location === id ? 'selected' : ''} aria-pressed={location === id} onClick={event => { choose(id); event.currentTarget.closest('details').open = false }}>{name}</button>
          ))}
        </div>
      </details>
      <button type="button" disabled={!currentLocation && !currentPsgc} onClick={() => {
        if (locationSharingEnabled && currentLocation) mapRef.current?.flyTo({ center: [currentLocation.longitude, currentLocation.latitude], zoom: 15 })
        else if (currentPsgc) choose(currentPsgc)
      }}>Current location</button>
      <button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Refresh reports</button>
      {!location && <small>Nationwide report list includes reports without map coordinates.</small>}
      <details className="severity-filter">
        <summary><span>Severity</span><strong>{severity || 'All severities'}</strong><span className="severity-chevron" aria-hidden="true">⌄</span></summary>
        <div className="severity-options" role="group" aria-label="Filter reports by severity">
          {[['', 'All severities'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']].map(([value, label]) => (
            <button type="button" key={value || 'all'} className={severity === value ? 'selected' : ''} aria-pressed={severity === value} onClick={event => { setSeverity(value); event.currentTarget.closest('details').open = false }}>{label}</button>
          ))}
        </div>
      </details>
      <small>Viewing a location does not change your notifications. Some LGUs do not supply data.</small>
      </div>
    </section>
    <div ref={container} className="nationwide-canvas" aria-label="Nationwide flood report map" />
    {signalStatus && <p role={signalStatus.startsWith('Automated NLP flood reports could not') ? 'alert' : 'status'} className="map-coverage-notice">{signalStatus}</p>}
    {areaGeometryError && <p role="alert" className="map-coverage-notice">{areaGeometryError}</p>}
    {(signals.reports||[]).filter(city=>Number(city.expires_at_ms)>signalClock).map(city=><p key={`reports:${city.city_id}`} role="status" style={{margin:'8px 16px',padding:'10px',background:'#fffbeb',color:'#854d0e',borderRadius:10}}>Automated NLP detected {city.post_count} flood-related post{Number(city.post_count)===1?'':'s'} for {city.city_name} {signalWindowLabel}. Most common NLP severity: {city.majority_severity||'Unspecified'}. Individual matched posts and their NLP severity are listed in Flood reports.</p>)}
    {signals.pins.filter(pin=>Number(pin.expires_at_ms)>signalClock).map(pin=><p key={`${pin.city_id}:${pin.location_key}`} role="status" style={{margin:'8px 16px',padding:'10px',background:'#fffbeb',color:'#854d0e',borderRadius:10}}>Automated NLP matched {pin.post_count} flood-related post{Number(pin.post_count)===1?'':'s'} near {pin.label} {signalWindowLabel}. Most common NLP severity: {pin.severity||'Unspecified'}.</p>)}
    {activeCitySignals(signals,signalClock).map(city=><p key={city.city_id} role="status" style={{margin:'8px 16px',padding:'10px',background:'#fffbeb',color:'#854d0e',borderRadius:10}}>Automated NLP detected {city.event_post_count} posts for {city.city_name}; most common recent NLP severity: {city.majority_severity||'Unspecified'}. Shaded outlines show locations matched from those posts.</p>)}
    <details className="nationwide-location-panel"><summary><span><strong>{locationById(location)?.name || 'Reports'}</strong><small>View {reports.length} available report{reports.length === 1 ? '' : 's'}</small></span><span className="panel-chevron" aria-hidden="true">⌃</span></summary><div className="nationwide-report-list" aria-live="polite"><p>{status}</p>{unplaced > 0 && <p>{unplaced} reports have no verified map coordinates; see their location details below.</p>}
      {reports.map(r => <article key={r.id}><strong>{[r.city, r.province, r.barangay].filter(Boolean).join(', ')} — {r.severity}</strong>{r.created_at && <time dateTime={String(r.created_at).replace(' ', 'T')}>{formatPostedDate(r.created_at)}</time>}<p>{r.description}</p></article>)}
      {next && <button type="button" disabled={busy} onClick={more}>Load more available reports</button>}
    </div></details>
    <nav className="bottom-nav nationwide-nav" aria-label="Primary">{navigation.map(n => <button type="button" className={n.id === "map" ? "nav-item active" : "nav-item"} aria-current={n.id === "map" ? "page" : undefined} key={n.id} onClick={() => setScreen(n.id)}><span className="nav-icon"><Icon name={n.icon} size={20} /></span><small>{n.label}</small></button>)}</nav>
  </div>
}
function formatPostedDate(value) {
  if (!value) return 'Posted date unavailable'
  const date = new Date(String(value).replace(' ', 'T'))
  if (!Number.isFinite(date.getTime())) return 'Posted date unavailable'
  return `Posted ${new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)}`
}
function locationFeature(location) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [location.longitude, location.latitude] } }
}
