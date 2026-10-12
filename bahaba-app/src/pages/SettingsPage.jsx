import PasswordInput from '../components/PasswordInput'
import { Icon } from '../components/Icon'
import SectionBrandBanner from '../components/SectionBrandBanner'
import { useState } from 'react'

export default function SettingsPage({ currentUser, darkMode, setDarkMode, navigation, activeNav, setActiveNav, setScreen, onLogout, floodAlertsEnabled, setFloodAlertsEnabled, locationSharingEnabled, onLocationToggle, pushNotificationsEnabled, onNotificationsToggle, locationStatus, notificationStatus, currentPlace, selectedCity, onSaveProfile }) {
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

      <SectionBrandBanner
        title="Settings"
        subtitle="Account & Safety Preferences"
        scope={locationSharingEnabled && currentPlace ? currentPlace : selectedCity}
        identityName={currentUser?.username || 'John Doe'}
        identityDetail={currentUser?.email || 'johndoe@gmail.com'}
        identityMeta={[`Preferred locations: ${currentUser?.preferred_locations?.length || 0}`]}
      />

      <div className="settings-scroll">
        <div className="settings-form location-settings-form">
<button className="manage-preferences-button" type="button" onClick={() => setScreen('preferences')}><span className="manage-preferences-icon"><Icon name="pin" size={21} /></span><span><strong>Manage preferred locations</strong><small>{currentUser?.preferred_locations?.length || 0} locations for flood and LGU updates</small></span><span aria-hidden="true">›</span></button>
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
            <span>Browser Notifications</span>
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

        <form className="settings-profile-form" onSubmit={saveProfile}>
          <fieldset className="settings-form settings-profile-fields" disabled={saving}>
            <legend>Account information</legend>
            <label htmlFor="profile-name">Name</label>
            <input id="profile-name" type="text" autoComplete="nickname" value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={50} required />
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={currentUser?.email || ''} readOnly />
            <small>Email cannot be changed.</small>
            <label htmlFor="profile-new-password">New password</label>
            <PasswordInput id="profile-new-password"  autoComplete="new-password" placeholder="Leave blank to keep your password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} />
            {password && <>
              <label htmlFor="profile-current-password">Current password</label>
              <PasswordInput id="profile-current-password"  autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
              <label htmlFor="profile-confirm-password">Confirm new password</label>
              <PasswordInput id="profile-confirm-password"  autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required />
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
