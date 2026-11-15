const API_URL = import.meta.env.VITE_API_URL || '/api'

async function request(endpoint, options = {}) {
  let response
  try {
    response = await fetch(`${API_URL}/${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new Error('Cannot reach the BANTALA API. Make sure the PHP API server is running and VITE_API_URL is configured correctly.')
  }

  const responseText = await response.text()
  let payload = {}
  try {
    payload = JSON.parse(responseText)
  } catch {
    if (response.ok) {
      throw new Error('The BANTALA API returned an invalid response. Check the API server logs.')
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload.error
      || `The BANTALA API returned HTTP ${response.status}. Check that the PHP API server is running and review its logs.`,
    )
    error.status = response.status
    error.needsVerification = payload.needsVerification
    throw error
  }
  return payload
}

export const signup = (data) => request('signup.php', { method: 'POST', body: JSON.stringify(data) })
export const login = (data) => request('login.php', { method: 'POST', body: JSON.stringify(data) })
export const resendVerification = () => request('resend-verification.php', { method: 'POST' })
export const checkVerification = () => request('me.php')
export const logout = () => request('logout.php', { method: 'POST' })
export const deleteAccount = data => request('delete-account.php', { method: 'POST', body: JSON.stringify(data) })
export const getProfile = () => request('profile.php', { cache: 'no-store' })
export const updateProfile = (data) => request('profile.php', { method: 'PUT', body: JSON.stringify(data) })
export const getLocationData = (current = '', location = '') => request(`location-data.php?${new URLSearchParams({ ...(current ? { current } : {}), ...(location ? { location } : {}) })}`, { cache: 'no-store' })
export const getNotificationEvents = (after, current = '') => request(`notifications.php?${new URLSearchParams({ ...(after === null ? {} : { after }), ...(current ? { current } : {}) })}`, { cache: 'no-store' })
export const registerPushDevice = token => request('push-device.php', { method: 'POST', body: JSON.stringify({ action: 'register', token }) })
export const unregisterPushDevice = token => request('push-device.php', { method: 'POST', body: JSON.stringify({ action: 'unregister', token }) })
export const getMapReports = (params = {}) => request(`map-reports.php?${new URLSearchParams(params)}`, { cache: 'no-store' })
export const getFloodSignals = (location = '') => request(`flood-signals.php?${new URLSearchParams(location ? { location } : {})}`, { cache: 'no-store' })
export const resolveCurrentLocation = ({ latitude, longitude, accuracy }) => request(`resolve-location.php?${new URLSearchParams({ latitude, longitude, accuracy })}`)
export const getResidentReportLocation = ({ latitude, longitude, accuracy }) => request(`report-location.php?${new URLSearchParams({ latitude, longitude, accuracy })}`, { cache: 'no-store' })
export const submitResidentReport = data => request('resident-report.php', { method: 'POST', body: JSON.stringify(data) })
export const getLocationBounds = (location) => request(`resolve-location.php?${new URLSearchParams({ location })}`)

export const requestPasswordReset = email => request('forgot-password.php', { method: 'POST', body: JSON.stringify({ email }) })
