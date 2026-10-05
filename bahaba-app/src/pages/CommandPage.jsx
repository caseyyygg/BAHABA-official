import { BrandMark, Icon } from '../components/Icon'

export default function CommandPage({ selectedCity, reports = [], nlpEvents = [], announcements = [], commandCenter, evacuationCenters = [], navigation, activeNav, setActiveNav, setScreen }) {
  const locationReports = [...reports, ...nlpEvents]
  return (
    <div className="phone-screen command-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /><i /><i /><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-banner command-banner">
        <div className="logo-inline">
          <BrandMark />
          <span>Command Center</span>
        </div>
      </div>

      <div className="stats-panel compact-panel">
        <h3>{commandCenter?.name || `${selectedCity || 'Local'} Command Center`}</h3>
        <p>{commandCenter?.address || 'Command Center contact details have not been provided yet.'}</p>
        <div className="alert-list small-list">
          {[
            ['Hotline', commandCenter?.hotline],
            ['Telephone', commandCenter?.telephone],
            ['Mobile', commandCenter?.mobile_number],
            ['Email', commandCenter?.email],
            ['Facebook', commandCenter?.facebook_page],
          ].filter(([, value]) => value).map(([label, value]) => (
            <div key={label} className="alert-row"><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
        {commandCenter?.emergency_contact && <p>{commandCenter.emergency_contact}</p>}
        {commandCenter?.other_information && <p>{commandCenter.other_information}</p>}
      </div>

      <div className="stats-panel compact-panel">
        <h3>Flood reports · {locationReports.length}</h3>
        <div className="alert-list small-list">
          {locationReports.slice(0, 5).map((report) => (
            <div key={`${report.id || report.created_at}-${report.barangay || ''}`} className="alert-row">
              <span>{report.barangay || selectedCity}</span>
              <span className="risk-tag red">{report.severity || 'Report'}</span>
            </div>
          ))}
          {!locationReports.length && <div className="alert-row"><span>No current flood reports for {selectedCity}.</span></div>}
        </div>
        {announcements.length > 0 && <p>{announcements.length} published local advisories.</p>}
      </div>

      <div className="stats-panel compact-panel evacuation-centers-panel">
        <h3>Evacuation centers · {evacuationCenters.length}</h3>
        <p>Centers shared by your local LGU.</p>
        <div className="alert-list small-list">
          {evacuationCenters.map((center) => {
            const capacity = Number(center.capacity) || 0
            const evacuees = Number(center.evacuees) || 0
            const occupancy = capacity > 0 ? Math.min(100, Math.round((evacuees / capacity) * 100)) : 0
            return (
              <div key={center.id} className="evacuation-center-row">
                <div className="evacuation-center-heading">
                  <strong>{center.name}</strong>
                  <span>{center.barangay}{center.city ? `, ${center.city}` : ''}</span>
                </div>
                {center.address && <span className="evacuation-center-address">{center.address}</span>}
                <div className="evacuation-capacity" aria-label={`${occupancy}% occupied`}>
                  <span style={{ width: `${occupancy}%` }} />
                </div>
                <div className="evacuation-center-meta">
                  <span>{evacuees.toLocaleString()} / {capacity.toLocaleString()} spaces filled</span>
                  {center.created_by && <span>Shared by {center.created_by}</span>}
                </div>
              </div>
            )
          })}
          {!evacuationCenters.length && (
            <div className="alert-row">
              <span>No evacuation centers have been shared for {selectedCity || 'your location'} yet.</span>
            </div>
          )}
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
            <span className="nav-icon"><Icon name={item.icon} size={20} /></span>
            <small>{item.label}</small>
          </button>
        ))}
      </div>
    </div>
  )
}
