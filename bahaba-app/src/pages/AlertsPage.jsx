import { BrandMark, Icon } from '../components/Icon'

export default function AlertsPage({ currentUser, selectedCity, reports = [], nlpEvents = [], announcements = [], commandCenter, navigation, activeNav, setActiveNav, setScreen }) {
  const floodItems = [...reports, ...nlpEvents]
  const riskLabel = floodItems.some((item) => String(item.severity).toLowerCase() === 'high')
    ? 'High'
    : floodItems.length ? 'Monitor' : 'No active reports'
  return (
    <div className="phone-screen alerts-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /><i /><i /><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-banner alert-banner">
        <div className="logo-inline">
          <BrandMark />
          <span>{currentUser ? `Good day, ${currentUser.username}` : 'Good day, John'}</span>
        </div>
      </div>

      <div className="alert-box">
        <span className="alert-dot" />
        <span>{riskLabel}</span>
      </div>

      <div className="alert-list">
        {floodItems.slice(0, 5).map((item) => (
          <div className="alert-row" key={`${item.id || item.created_at}-${item.barangay || ''}`}>
            <span>{item.barangay ? `${item.barangay}, ` : ''}{selectedCity}</span>
            <span className={`risk-tag ${String(item.severity).toLowerCase() === 'high' ? 'red' : 'amber'}`}>{item.severity || 'Report'}</span>
          </div>
        ))}
        {!floodItems.length && <div className="alert-row"><span>No flood reports for {selectedCity}.</span></div>}
      </div>

      <div className="stats-panel">
        <h3>Emergency contacts</h3>
        <div className="stats-grid">
          <div><strong>{commandCenter?.hotline || '—'}</strong><small>Hotline</small></div>
          <div><strong>{commandCenter?.telephone || '—'}</strong><small>Telephone</small></div>
          <div><strong>{commandCenter?.mobile_number || '—'}</strong><small>Mobile</small></div>
          <div><strong>{announcements.length}</strong><small>Current advisories</small></div>
        </div>
        {commandCenter?.address && <p>{commandCenter.address}</p>}
      </div>

      {announcements.length > 0 && (
        <div className="stats-panel">
          <h3>Local advisories</h3>
          {announcements.slice(0, 3).map((announcement) => (
            <div className="alert-row" key={announcement.id}><span>{announcement.title}</span></div>
          ))}
        </div>
      )}

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
