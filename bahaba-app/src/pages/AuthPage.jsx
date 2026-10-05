import { BrandMark, Icon } from '../components/Icon'

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
              <input
                type="password"
                placeholder="Enter your password"
                value={loginForm.password}
                onChange={(e) => onLoginFieldChange('password', e.target.value)}
              />
            </div>
          </div>

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
        <div className="logo-inline">
          <BrandMark />
          <span>BAHABA</span>
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
            <input
              type="password"
              placeholder="Create a password"
              value={signupForm.password}
              onChange={(e) => onSignupFieldChange('password', e.target.value)}
            />
          </div>
        </div>

        <div className="field-block">
          <label htmlFor="signup-location">Desired Location</label>
          <div className="input-wrap">
            <Icon className="field-icon" name="pin" size={17} />
            <select
              id="signup-location"
              value={signupForm.selected_location}
              onChange={(e) => onSignupFieldChange('selected_location', e.target.value)}
              required
            >
              <option value="">Select your location</option>
              {supportedLocations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
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
