export default function MapPage({
  searchTerm,
  setSearchTerm,
  filteredSearchResults,
  setSelectedBarangays,
  severity,
  setSeverity,
  filteredMapCards,
  navigation,
  activeNav,
  setActiveNav,
  setScreen,
}) {
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

      {filteredSearchResults.length > 0 && (
        <div className="search-dropdown">
          {filteredSearchResults.map((item) => (
            <button
              key={item.name}
              type="button"
              className="search-option"
              onClick={() => {
                setSearchTerm(item.name)
                setSelectedBarangays((current) =>
                  current.includes(item.name.replace('Barangay ', ''))
                    ? current
                    : [...current, item.name.replace('Barangay ', '')],
                )
              }}
            >
              <div className="search-option-main">
                <span>{item.name}</span>
                <small>{item.city}</small>
              </div>
              <span className={`search-status ${item.status}`}>{item.status}</span>
            </button>
          ))}
        </div>
      )}

      <div className="map-scroll-area">
        <div className="risk-tabs">
          {['all', 'high', 'medium', 'low'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={severity === tab ? 'risk-tab active' : 'risk-tab'}
              onClick={() => setSeverity(tab)}
            >
              {tab === 'all' ? 'All' : tab === 'high' ? 'High Risk' : tab === 'medium' ? 'Medium Risk' : 'Low Risk'}
            </button>
          ))}
        </div>

        <div className="map-result-list">
          {filteredMapCards.map((item) => (
            <div key={item.name} className="map-card">
              <div className="map-card-header">
                <div className="map-card-title-wrap">
                  <div className="map-card-name">{item.name}</div>
                  <div className="map-card-city">{item.city}</div>
                </div>
                <span className={`risk-pill ${item.risk}`}>{item.risk.toUpperCase()}</span>
              </div>

              <div className="map-card-body">
                <div className="map-card-label">Evacuation Centers:</div>
                <div className="map-card-detail">{item.evac}</div>
              </div>

              <button className="details-link" type="button">See Details</button>
            </div>
          ))}
        </div>

        <div className="map-preview">
          <div className="map-surface mini-map">
            {filteredMapCards.slice(0, 4).map((item, index) => (
              <div key={`mini-${item.name}`} className={`map-pin pin-${index + 1}`} />
            ))}
          </div>
        </div>
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
