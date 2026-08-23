export default function CommandPage({ selectedBarangays, navigation, activeNav, setActiveNav, setScreen }) {
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
        <h3>Selected barangays</h3>
        <div className="alert-list small-list">
          {(selectedBarangays.length ? selectedBarangays : ['Concepcion']).map((barangay) => (
            <div key={barangay} className="alert-row">
              <span>{barangay}</span>
              <span className="risk-tag red">High</span>
            </div>
          ))}
        </div>
      </div>

      <div className="stats-panel compact-panel">
        <h3>Incident metrics</h3>
        <div className="stats-grid">
          <div><strong>121,408</strong><small>People affected</small></div>
          <div><strong>408</strong><small>Evacuation centers</small></div>
          <div><strong>4</strong><small>Teams</small></div>
          <div><strong>5</strong><small>Rooms</small></div>
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
