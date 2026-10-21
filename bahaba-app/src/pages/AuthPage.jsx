import { useMemo, useState } from 'react'
import PasswordInput from '../components/PasswordInput'
import { BrandMark, Icon } from '../components/Icon'
import { searchLocations } from '../locations'

export default function AuthPage({
  mode = 'signup',
  signupForm,
  supportedLocations = [],
  onUseSignupLocation,
  signupLocationBusy = false,
  signupLocationNotice,
  loginForm,
  onSignupFieldChange,
  onLoginFieldChange,
  onSignupNext,
  onLoginSubmit,
  onSwitchMode,
  onVerify,
  onResendVerification,
  error,
  notice,
  busy,
}) {
  const [locationQuery, setLocationQuery] = useState('')
  const [locationMenuOpen, setLocationMenuOpen] = useState(false)
  const matchingLocations = useMemo(() => searchLocations(locationQuery).slice(0, 8), [locationQuery])
  if (mode === 'verify') {
    return (
      <div className="phone-screen auth-screen login-screen">
        <div className="top-banner top-banner-small"><BrandMark /></div>
        <div className="auth-card login-card">
          <h2>Check your Gmail</h2>
          <p className="auth-message">We sent an activation link to your Gmail address. Open it, then return here to finish signing in.</p>
          {error && <p className="auth-error">{error}</p>}
          {notice && <p className="auth-notice">{notice}</p>}
          <button className="primary-button" onClick={onVerify} disabled={busy}>{busy ? 'CHECKING...' : "I'VE VERIFIED MY EMAIL"}</button>
          <p className="small-link"><button type="button" onClick={onResendVerification} disabled={busy}>Resend activation link</button></p>
          <p className="small-link"><button type="button" onClick={() => onSwitchMode('login')}>Back to log in</button></p>
        </div>
      </div>
    )
  }

  if (mode === 'login') {
    return (
      <div className="phone-screen auth-screen login-screen">
        <div className="statusbar">
          <span>9:47</span>
          <div className="status-icons">
            <span className="signal"><i /><i /><i /><i /></span>
            <span className="wifi" />
            <span className="battery" />
          </div>
        </div>

        <div className="top-banner top-banner-small">
          <BrandMark />
        </div>

        <div className="auth-card login-card">
          <h2>Log in</h2>

          <div className="field-block">
            <label>Gmail address</label>
            <div className="input-wrap">
              <Icon className="field-icon" name="user" size={17} />
              <input
                type="email"
                placeholder="Enter your Gmail address"
                value={loginForm.email}
                onChange={(e) => onLoginFieldChange('email', e.target.value)}
              />
            </div>
          </div>

          <div className="field-block">
            <label>Password</label>
            <div className="input-wrap">
              <Icon className="field-icon" name="lock" size={17} />
              <PasswordInput
                placeholder="Enter your password"
                value={loginForm.password}
                onChange={(e) => onLoginFieldChange('password', e.target.value)}
              />
            </div>
          </div>

          <p className="small-link" style={{ textAlign: 'right', marginTop: 8 }}><button type="button" onClick={() => onSwitchMode('forgot')}>Forgot password?</button></p>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-button" onClick={onLoginSubmit} disabled={busy}>{busy ? 'LOGGING IN...' : 'Log in'}</button>

          <p className="small-link">
            Don&apos;t have an account? <button type="button" onClick={() => onSwitchMode('signup')}>Sign up</button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="phone-screen auth-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /><i /><i /><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-banner">
        <div className="logo-inline signup-brand">
          <BrandMark />
          <span>BANTALA</span>
        </div>
        <small>Create your account</small>
      </div>

      <div className="auth-card">
        <h2>SIGN UP</h2>

        <div className="field-block">
          <label>Email</label>
          <div className="input-wrap">
            <Icon className="field-icon" name="mail" size={17} />
            <input
              type="email"
              placeholder="Enter your email"
              value={signupForm.email}
              onChange={(e) => onSignupFieldChange('email', e.target.value)}
            />
          </div>
        </div>

        <div className="field-block">
          <label>Username</label>
          <div className="input-wrap">
            <Icon className="field-icon" name="user" size={17} />
            <input
              type="text"
              placeholder="Create a username"
              value={signupForm.username}
              onChange={(e) => onSignupFieldChange('username', e.target.value)}
            />
          </div>
        </div>

        <div className="field-block">
          <label>Password</label>
          <div className="input-wrap">
            <Icon className="field-icon" name="lock" size={17} />
            <PasswordInput
              placeholder="Create a password"
              value={signupForm.password}
              onChange={(e) => onSignupFieldChange('password', e.target.value)}
            />
          </div>
        </div>

        <div className="field-block">
          <label htmlFor="signup-location">Desired Location</label>
          <div className="input-wrap signup-location-search">
            <Icon className="field-icon" name="pin" size={17} />
            <input
              id="signup-location"
              type="search"
              autoComplete="off"
              placeholder="Type your city or municipality"
              value={locationQuery || supportedLocations.find(location => location.id === signupForm.selected_location)?.name || ''}
              onFocus={() => setLocationMenuOpen(true)}
              onChange={(e) => {
                setLocationQuery(e.target.value)
                setLocationMenuOpen(true)
                onSignupFieldChange('selected_location', '')
              }}
              aria-autocomplete="list"
              aria-expanded={locationMenuOpen && Boolean(locationQuery.trim())}
              aria-controls="signup-location-options"
              required
            />
            {locationMenuOpen && locationQuery.trim() && (
              <div className="location-suggestions" id="signup-location-options" role="listbox">
                {matchingLocations.length ? matchingLocations.map(location => (
                  <button key={location.id} type="button" role="option" aria-selected={signupForm.selected_location === location.id}
                    onClick={() => {
                      onSignupFieldChange('selected_location', location.id)
                      setLocationQuery(location.name)
                      setLocationMenuOpen(false)
                    }}>
                    <strong>{location.name}</strong><span>{location.province || location.region}</span>
                  </button>
                )) : <p>No matching city or municipality.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="field-block">
          <label htmlFor="signup-address">Home Address <span className="optional-label">Optional</span></label>
          <div className="input-wrap">
            <Icon className="field-icon" name="crosshair" size={17} />
            <input
              id="signup-address"
              type="text"
              placeholder="Enter Home Address"
              value={signupForm.location}
              onChange={(e) => onSignupFieldChange('location', e.target.value)}
            />
          </div>
          <button
            className="use-location-button"
            type="button"
            onClick={onUseSignupLocation}
            disabled={signupLocationBusy}
          >
            <Icon name="crosshair" size={15} />
            {signupLocationBusy ? 'Finding your location…' : 'Use my location'}
          </button>
          {signupLocationNotice && (
            <p className={`signup-location-notice ${signupLocationNotice.type}`} role="status">
              {signupLocationNotice.text}
            </p>
          )}
        </div>

        {error && <p className="auth-error">{error}</p>}
        <button className="primary-button" onClick={onSignupNext} disabled={busy}>
          {busy ? 'CREATING ACCOUNT...' : 'NEXT'}
        </button>

        <p className="small-link">
          Already have an account? <button type="button" onClick={() => onSwitchMode('login')}>Log In</button>
        </p>
      </div>
    </div>
  )
}
