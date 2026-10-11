import { useState } from 'react'
import { BrandMark, Icon } from './Icon'
import { requestPasswordReset } from '../api'

export default function ForgotPassword({ onBack }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    try { setMessage((await requestPasswordReset(email)).message) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <div className="phone-screen auth-screen login-screen">
    <div className="top-banner top-banner-small"><BrandMark /></div>
    <div className="auth-card login-card">
      <h2>Forgot password?</h2>
      <p className="auth-message">Enter your account email to request a password reset link.</p>
      <form onSubmit={submit}>
        <div className="field-block"><label htmlFor="recovery-email">Email address</label>
          <div className="input-wrap"><Icon className="field-icon" name="mail" size={17} />
            <input id="recovery-email" type="email" autoComplete="email" placeholder="Enter your email address" value={email} onChange={event => setEmail(event.target.value)} required />
          </div>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {message && <p className="auth-notice" role="status">{message}</p>}
        <button className="primary-button" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <p className="small-link"><button type="button" onClick={onBack}>Back to log in</button></p>
    </div>
  </div>
}
