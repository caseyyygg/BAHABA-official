import { useEffect, useMemo, useRef, useState } from 'react'
import mapGeometry from '../assets/targeted-barangay-geometry.json'
import lguBoundaries from '../assets/lgu-boundaries.json'
import { locationById } from '../locations'
import { Icon } from '../components/Icon'
import { FreeMap } from '../components/FreeMap'
import { floodAreasFor } from '../floodMap'

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
  const mapRef = useRef(null)
  const barangayListRef = useRef(null)
  const searchPullStart = useRef(null)
  const suppressHandleClick = useRef(false)
  const [searchExpanded, setSearchExpanded] = useState(Boolean(searchTerm.trim()))
  const [resolvedQuery, setResolvedQuery] = useState('')
  const [mapTime, setMapTime] = useState(Date.now)
  const [alertsExpanded, setAlertsExpanded] = useState(false)
  const alertPull = useRef(null)
  const alertDragged = useRef(false)
  const location = locationById(selectedLocationId)
  const mapFeatures = useMemo(() => location
    ? mapGeometry.features.filter((feature) => feature.properties.city === location.map_city
      && (!location.map_municipality || feature.properties.municipality === location.map_municipality))
    : [], [location])
  const query = searchTerm.trim().toLowerCase()
  const floodAreas = useMemo(() => floodAreasFor(mapFeatures, reports, nlpEvents, mapTime), [mapFeatures, reports, nlpEvents, mapTime])
  useEffect(() => {
    // Expire local markers even if data refreshes fail or the device goes offline.
    const timer = window.setInterval(() => setMapTime(Date.now()), 30000)
    const updateTime = () => setMapTime(Date.now())
    window.addEventListener('focus', updateTime)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', updateTime)
    }
  }, [])
  const sortedBarangays = useMemo(() => [...mapFeatures].sort((left, right) =>
    left.properties.name.localeCompare(right.properties.name)), [mapFeatures])
  const searchLoading = Boolean(query && query !== resolvedQuery)
  const searchResults = resolvedQuery
    ? mapFeatures.filter((feature) => [
      feature.properties.name,
      feature.properties.city,
      feature.properties.municipality,
    ].some((value) => value.toLowerCase().includes(resolvedQuery))).slice(0, 8)
    : []

  useEffect(() => {
    if (!query) {
      setResolvedQuery('')
      return undefined
    }

    const timer = window.setTimeout(() => setResolvedQuery(query), 180)
    return () => window.clearTimeout(timer)
  }, [query])

  const focusBarangay = (feature) => {
    mapRef.current?.focusFeature(feature.id)
    setSelectedBarangays((current) => current.includes(feature.properties.name)
      ? current : [...current, feature.properties.name])
    setSearchTerm('')
    setSearchExpanded(false)
    if (barangayListRef.current) barangayListRef.current.open = false
  }

  const handleSearchPullStart = (event) => {
    searchPullStart.current = event.clientY
    suppressHandleClick.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSearchPullEnd = (event) => {
    if (searchPullStart.current === null) return
    const dragDistance = event.clientY - searchPullStart.current
    searchPullStart.current = null
    if (Math.abs(dragDistance) > 14) {
      suppressHandleClick.current = true
      setSearchExpanded(dragDistance > 0)
    }
  }

  return (
    <div className="phone-screen map-screen">
      <div className="map-fullscreen-surface">
        <FreeMap
          key={selectedLocationId}
          ref={mapRef}
          features={mapFeatures}
          scopeBoundary={lguBoundaries.features.find((feature) => feature.id === selectedLocationId)}
          floodAreas={floodAreas}
          areaName={location?.name || 'Philippines'}
        />
      </div>
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <section className={`search-dock ${searchExpanded ? 'expanded' : ''}`}>
        <button
          type="button"
          className="search-dock-handle"
          aria-label={searchExpanded ? 'Collapse location search' : 'Expand location search'}
          aria-expanded={searchExpanded}
          onClick={() => {
            if (suppressHandleClick.current) {
              suppressHandleClick.current = false
              return
            }
            setSearchExpanded((expanded) => !expanded)
          }}
          onPointerDown={handleSearchPullStart}
          onPointerUp={handleSearchPullEnd}
          onPointerCancel={() => { searchPullStart.current = null }}
        >
          <span />
        </button>
        <div className="top-search-bar">
          <div className="search-input-wrap">
            <Icon className="search-icon" name="search" size={17} />
            <input
              type="text"
              placeholder="Search location"
              aria-label="Search location"
              value={searchTerm}
              onFocus={() => setSearchExpanded(true)}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setSearchExpanded(true)
              }}
            />
          </div>
          <div className="search-view-actions">
            <button className="chip chip-blue" type="button" aria-pressed="true">Map</button>
          </div>
        </div>

        <div className="search-dock-content" aria-hidden={!searchExpanded}>
          <div className="search-dropdown">
            {searchLoading && (
              <div className="search-skeleton-list" aria-label="Searching locations" aria-busy="true">
                {Array.from({ length: 5 }, (_, index) => (
                  <div className="search-skeleton" key={index}>
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            )}
            {query && !searchLoading && searchResults.map((feature, index) => (
              <button
                key={feature.id}
                type="button"
                className="search-option"
                style={{ '--result-index': index }}
                tabIndex={searchExpanded ? 0 : -1}
                onClick={() => focusBarangay(feature)}
              >
                <div className="search-option-main">
                  <span>{feature.properties.name}</span>
                  <small>{[feature.properties.municipality, feature.properties.city].filter(Boolean).join(', ')}</small>
                </div>
              </button>
            ))}
            {query && !searchLoading && searchResults.length === 0 && (
              <p className="search-empty" tabIndex={searchExpanded ? 0 : -1}>No locations found for “{searchTerm.trim()}”.</p>
            )}
            {!query && <p className="search-empty" tabIndex={searchExpanded ? 0 : -1}>Search a barangay or city to find it on the map.</p>}
          </div>
        </div>
      </section>

      {(floodAreas.total > 0 || floodAreas.ignored > 0) && (
        <div className={`map-flood-legend ${alertsExpanded ? 'is-expanded' : ''}`}>
          <button type="button" className="alert-details-toggle" aria-expanded={alertsExpanded} aria-controls="map-alert-details"
            onPointerDown={(event) => { alertPull.current = event.clientY; alertDragged.current = false; event.currentTarget.setPointerCapture(event.pointerId) }}
            onPointerUp={(event) => {
              if (alertPull.current !== null && Math.abs(event.clientY - alertPull.current) > 20) {
                alertDragged.current = true
                setAlertsExpanded(event.clientY > alertPull.current)
              }
              alertPull.current = null
            }}
            onPointerCancel={() => { alertPull.current = null }}
            onClick={() => { if (!alertDragged.current) setAlertsExpanded((expanded) => !expanded); alertDragged.current = false }}>
            <div><strong>{floodAreas.total} flood report{floodAreas.total === 1 ? '' : 's'}</strong><small>{alertsExpanded ? 'Pull up to hide details' : 'Pull down for alert details'}</small></div>
            <span className="alert-details-chevron" aria-hidden="true">⌄</span>
          </button>
          <div id="map-alert-details" className="alert-details-collapse" aria-hidden={!alertsExpanded} inert={!alertsExpanded}>
          <div className="alert-details-content">
          <span><i className="flood-high" />High: {floodAreas.severityCounts.high} <i className="flood-medium" />Medium: {floodAreas.severityCounts.medium} <i className="flood-low" />Low: {floodAreas.severityCounts.low}</span>
          {floodAreas.severityCounts.unknown > 0 && <small>Unspecified severity: {floodAreas.severityCounts.unknown}</small>}
          <small>Tap a circle or reported area for details</small>
          <small>Dots mark verified landmark locations mentioned in posts</small>
          <small>Colored borders mark barangays mentioned in flood reports; exact flooded streets may be unknown.</small>
          {floodAreas.ignored > 0 && <small>{floodAreas.ignored} post{floodAreas.ignored === 1 ? '' : 's'} skipped: no matched barangay or verified place</small>}
          {floodAreas.unmatched > 0 && <small>{floodAreas.unmatched} report{floodAreas.unmatched === 1 ? '' : 's'} without a matched barangay</small>}
          </div></div>
        </div>
      )}

      {location && (
        <details key={selectedLocationId} className="location-barangay-panel" ref={barangayListRef}>
          <summary>
            <span><strong>{location.name}</strong><small>View {sortedBarangays.length} barangays</small></span>
            <span aria-hidden="true">⌃</span>
          </summary>
          <ul aria-label={`Barangays in ${location.name}`}>
            {sortedBarangays.map((feature) => (
              <li key={feature.id}>
                <span><strong>{feature.properties.name}</strong>
                  <small>{feature.properties.municipality || location.name}</small></span>
                <button type="button" aria-label={`Locate ${feature.properties.name}`} onClick={() => focusBarangay(feature)}>
                  Locate
                </button>
              </li>
            ))}
            {!sortedBarangays.length && <li>No barangay locations available yet.</li>}
          </ul>
        </details>
      )}

      <nav className="bottom-nav" aria-label="Primary">
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
            aria-current={activeNav === item.id ? 'page' : undefined}
            onClick={() => {
              setActiveNav(item.id)
              setScreen(item.id)
            }}
          >
            <span className="nav-icon"><Icon name={item.icon} size={20} /></span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}
