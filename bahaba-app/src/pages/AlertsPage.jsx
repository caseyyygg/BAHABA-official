export default function AlertsPage({ currentUser, selectedCity, navigation, activeNav, setActiveNav, setScreen }) {
  return (
    <div className="phone-screen alerts-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-banner alert-banner">
        <div className="logo-inline">
          <span className="mini-mark" />
          <span>{currentUser ? `Good day, ${currentUser.username}` : 'Good day, John'}</span>
        </div>
      </div>

      <div className="alert-box">
        <span className="alert-dot" />
        <span>High Alert</span>
      </div>

      <div className="alert-list">
        <div className="alert-row">
          <span>{selectedCity || 'Malabon'}</span>
          <span className="risk-tag red">High</span>
        </div>
        <div className="alert-row">
          <span>Navotas</span>
          <span className="risk-tag amber">Medium</span>
        </div>
        <div className="alert-row">
          <span>Valenzuela</span>
          <span className="risk-tag gray">Low</span>
        </div>
      </div>

      <div className="stats-panel">
        <h3>Emergency contacts</h3>
        <div className="stats-grid">
          <div><strong>388</strong><small>Affected residents</small></div>
          <div><strong>5,282</strong><small>Evacuation centers</small></div>
          <div><strong>7</strong><small>Evacuation centers</small></div>
          <div><strong>3</strong><small>Teams deployed</small></div>
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
