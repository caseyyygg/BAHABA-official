export default function CommandPage({ selectedCity, reports = [], nlpEvents = [], announcements = [], commandCenter, navigation, activeNav, setActiveNav, setScreen }) {
  const locationReports = [...reports, ...nlpEvents]
  return (
    <div className="phone-screen command-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-banner command-banner">
        <div className="logo-inline">
          <span className="mini-mark" />
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
