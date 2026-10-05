import { BrandMark } from '../components/Icon'

export default function SplashPage({ onGetStarted, onLogin }) {
  return (
    <div className="phone-screen splash-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /><i /><i /><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <div className="splash-content">
        <div className="splash-brand">
          <BrandMark className="brand-mark" />
          <h1>BAHABA</h1>
          <p>Stay Safe, Stay Alert</p>
        </div>

        <button className="primary-button" onClick={onGetStarted}>Get Started</button>
        <p className="inline-link">
          Already have an account? <button type="button" onClick={onLogin}>Log In</button>
        </p>
      </div>

      <div className="wave-footer" />
    </div>
  )
}
