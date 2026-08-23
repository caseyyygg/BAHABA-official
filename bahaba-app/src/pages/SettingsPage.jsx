export default function SettingsPage({ currentUser, darkMode, setDarkMode, navigation, activeNav, setActiveNav, setScreen }) {
  return (
    <div className="phone-screen settings-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <h2 className="settings-title">Settings</h2>

      <div className="profile-card">
        <div className="avatar">{(currentUser?.username || 'JD').slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{currentUser?.username || 'John Doe'}</strong>
          <small>{currentUser?.email || 'johndoe@gmail.com'}</small>
        </div>
      </div>

      <div className="settings-list">
        <div className="settings-row">
          <span>Flood Alerts</span>
          <span className="switch on" />
        </div>
        <div className="settings-row">
          <span>Location Sharing</span>
          <span className="tag green">On</span>
        </div>
        <div className="settings-row">
          <span>Push Notifications</span>
          <span className="tag gray">Off</span>
        </div>
        <div className="settings-row">
          <span>Dark mode</span>
          <button
            type="button"
            className={`switch ${darkMode ? 'on' : ''}`}
            onClick={() => setDarkMode((current) => !current)}
            aria-label="Toggle dark mode"
          />
        </div>
      </div>

      <div className="settings-form">
        <input type="text" value={currentUser?.username || 'John Doe'} readOnly />
        <input type="email" value={currentUser?.email || 'johndoe@gmail.com'} readOnly />
        <input type="password" value={currentUser?.password || '**********'} readOnly />
      </div>

      <button className="primary-button muted-button" onClick={() => setScreen('map')}>Save Changes</button>

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
