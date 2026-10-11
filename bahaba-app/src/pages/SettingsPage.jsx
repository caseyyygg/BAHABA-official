import { Icon } from '../components/Icon'
import { useState } from 'react'

export default function SettingsPage({ currentUser, darkMode, setDarkMode, navigation, activeNav, setActiveNav, setScreen, onLogout, floodAlertsEnabled, setFloodAlertsEnabled, locationSharingEnabled, onLocationToggle, pushNotificationsEnabled, onNotificationsToggle, locationStatus, notificationStatus, currentPlace, supportedLocations, onDesiredLocationChange, locationChangeBusy, locationChangeStatus, onSaveProfile }) {
  const [name, setName] = useState(currentUser?.username || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [profileStatus, setProfileStatus] = useState('')
  const saveProfile = async (event) => {
    event.preventDefault()
    if (saving) return
    setProfileStatus('')
    if (password && password !== confirmation) { setProfileStatus('New passwords do not match.'); return }
    const changes = { username: name.trim() }
    if (password) { changes.password = password; changes.current_password = currentPassword }
    setSaving(true)
    try {
      await onSaveProfile(changes)
      setCurrentPassword(''); setPassword(''); setConfirmation('')
      setProfileStatus('Your changes have been saved.')
    } catch (error) { setProfileStatus(error.message) }
    finally { setSaving(false) }
  }
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
              role="switch"
              aria-checked={floodAlertsEnabled}
            />
          </div>
          <div className="settings-row">
            <span>Location Sharing</span>
            <button
              type="button"
              className={`switch ${locationSharingEnabled ? 'on' : ''}`}
              onClick={() => onLocationToggle(!locationSharingEnabled)}
              aria-label="Toggle location sharing"
              role="switch"
              aria-checked={locationSharingEnabled}
            />
          </div>
          <div className="settings-row">
            <span>Push Notifications</span>
            <button
              type="button"
              className={`switch ${pushNotificationsEnabled ? 'on' : ''}`}
              onClick={() => onNotificationsToggle(!pushNotificationsEnabled)}
              aria-label="Toggle push notifications"
              role="switch"
              aria-checked={pushNotificationsEnabled}
            />
          </div>
          <div className="settings-row">
            <span>Dark mode</span>
            <button
              type="button"
              className={`switch ${darkMode ? 'on' : ''}`}
              onClick={() => setDarkMode((current) => !current)}
              aria-label="Toggle dark mode"
              role="switch"
              aria-checked={darkMode}
            />
          </div>
        </div>

        {(locationStatus || notificationStatus) && (
          <div className="settings-status" role="status" aria-live="polite">
            {locationStatus && <p>{locationStatus}</p>}
            {notificationStatus && <p>{notificationStatus}</p>}
          </div>
        )}

        <form className="settings-profile-form" onSubmit={saveProfile}>
          <fieldset className="settings-form settings-profile-fields" disabled={saving}>
            <legend>Account information</legend>
            <label htmlFor="profile-name">Name</label>
            <input id="profile-name" type="text" autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={50} required />
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={currentUser?.email || ''} readOnly />
            <small>Email cannot be changed.</small>
            <label htmlFor="profile-new-password">New password</label>
            <input id="profile-new-password" type="password" autoComplete="new-password" placeholder="Leave blank to keep your password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} />
            {password && <>
              <label htmlFor="profile-current-password">Current password</label>
              <input id="profile-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              <label htmlFor="profile-confirm-password">Confirm new password</label>
              <input id="profile-confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required />
            </>}
          </fieldset>
          {profileStatus && <p className="settings-status" role="status">{profileStatus}</p>}
          <button className="primary-button settings-save-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </form>
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
