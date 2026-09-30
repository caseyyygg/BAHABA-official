export default function AuthPage({
  mode = 'signup',
  signupForm,
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
        <div className="top-banner top-banner-small"><div className="mini-mark" /></div>
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
            <span className="signal"><i /></span>
            <span className="wifi" />
            <span className="battery" />
          </div>
        </div>

        <div className="top-banner top-banner-small">
          <div className="mini-mark" />
        </div>

        <div className="auth-card login-card">
          <h2>Log in</h2>

          <div className="field-block">
            <label>Gmail address</label>
            <div className="input-wrap">
              <span className="field-icon">👤</span>
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
              <span className="field-icon">🔒</span>
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
          <span className="signal"><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="top-banner">
        <div className="logo-inline">
          <span className="mini-mark" />
          <span>BAHABA</span>
        </div>
        <small>Create your account</small>
      </div>

      <div className="auth-card">
        <h2>SIGN UP</h2>

        <div className="field-block">
          <label>Email</label>
          <div className="input-wrap">
            <span className="field-icon">✉</span>
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
            <span className="field-icon">👤</span>
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
            <span className="field-icon">🔒</span>
            <input
              type="password"
              placeholder="Create a password"
              value={signupForm.password}
              onChange={(e) => onSignupFieldChange('password', e.target.value)}
            />
          </div>
        </div>

        <div className="field-block">
          <label>Location</label>
          <div className="input-wrap">
            <span className="field-icon">📍</span>
            <input
              type="text"
              placeholder="Enter Home Address"
              value={signupForm.location}
              onChange={(e) => onSignupFieldChange('location', e.target.value)}
            />
          </div>
        </div>

        {error && <p className="auth-error">{error}</p>}
        <button className="primary-button" onClick={onSignupNext} disabled={busy}>NEXT</button>

        <p className="small-link">
          Already have an account? <button type="button" onClick={() => onSwitchMode('login')}>Log In</button>
        </p>
      </div>
    </div>
  )
}
