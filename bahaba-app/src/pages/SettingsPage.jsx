import { Icon } from '../components/Icon'

export default function SettingsPage({ currentUser, darkMode, setDarkMode, navigation, activeNav, setActiveNav, setScreen, onLogout, floodAlertsEnabled, setFloodAlertsEnabled, locationSharingEnabled, onLocationToggle, pushNotificationsEnabled, onNotificationsToggle, locationStatus, notificationStatus, currentPlace, supportedLocations, onDesiredLocationChange, locationChangeBusy, locationChangeStatus }) {
  return (
    <div className="phone-screen settings-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /><i /><i /><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="settings-scroll">
        <h2 className="settings-title">Settings</h2>

        <div className="profile-card">
          <div className="avatar">{(currentUser?.username || 'JD').slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{currentUser?.username || 'John Doe'}</strong>
            <small>{currentUser?.email || 'johndoe@gmail.com'}</small>
            <small className="profile-location">Desired location: {currentUser?.selected_location_name || 'Choose a supported location'}</small>
            <small className="profile-location">
              {locationSharingEnabled && currentPlace && currentPlace !== 'Finding your place...'
                ? `Sharing: ${currentPlace}`
                : locationSharingEnabled
                  ? 'Finding your place...'
                : 'Not sharing location'}
            </small>
          </div>
        </div>

        <div className="settings-form location-settings-form">
          <label htmlFor="desired-location">Change Desired Location</label>
          <select
            id="desired-location"
            value={currentUser?.selected_location || ''}
            onChange={(event) => onDesiredLocationChange(event.target.value)}
            disabled={locationChangeBusy}
          >
            <option value="" disabled>Select a location</option>
            {supportedLocations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
          {locationChangeStatus && <p className="auth-error">{locationChangeStatus}</p>}
        </div>

        <div className="settings-list">
          <div className="settings-row">
            <span>Flood Alerts</span>
            <button
              type="button"
              className={`switch ${floodAlertsEnabled ? 'on' : ''}`}
              onClick={() => setFloodAlertsEnabled((current) => !current)}
              aria-label="Toggle flood alerts"
            />
          </div>
          <div className="settings-row">
            <span>Location Sharing</span>
            <button
              type="button"
              className={`switch ${locationSharingEnabled ? 'on' : ''}`}
              onClick={() => onLocationToggle(!locationSharingEnabled)}
              aria-label="Toggle location sharing"
            />
          </div>
          <div className="settings-row">
            <span>Push Notifications</span>
            <button
              type="button"
              className={`switch ${pushNotificationsEnabled ? 'on' : ''}`}
              onClick={() => onNotificationsToggle(!pushNotificationsEnabled)}
              aria-label="Toggle push notifications"
            />
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

        {(locationStatus || notificationStatus) && (
          <div className="settings-status">
            {locationStatus && <p>{locationStatus}</p>}
            {notificationStatus && <p>{notificationStatus}</p>}
          </div>
        )}

        <div className="settings-form">
          <input type="text" value={currentUser?.username || 'John Doe'} readOnly />
          <input type="email" value={currentUser?.email || 'johndoe@gmail.com'} readOnly />
          <input type="password" value={currentUser?.password || '**********'} readOnly />
        </div>

        <button className="primary-button muted-button" onClick={() => setScreen('map')}>Save Changes</button>
        <button className="logout-button" type="button" onClick={onLogout}>Log out</button>
      </div>

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