export default function AuthPage({
  mode = 'signup',
  signupForm,
  loginForm,
  onSignupFieldChange,
  onLoginFieldChange,
  onSignupNext,
  onLoginSubmit,
  onSwitchMode,
}) {
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
            <label>Username</label>
            <div className="input-wrap">
              <span className="field-icon">👤</span>
              <input
                type="text"
                placeholder="Enter your username"
                value={loginForm.username}
                onChange={(e) => onLoginFieldChange('username', e.target.value)}
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

          <button className="primary-button" onClick={onLoginSubmit}>Log in</button>

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

        <button className="primary-button" onClick={onSignupNext}>NEXT</button>

        <p className="small-link">
          Already have an account? <button type="button" onClick={() => onSwitchMode('login')}>Log In</button>
        </p>
      </div>
    </div>
  )
}
