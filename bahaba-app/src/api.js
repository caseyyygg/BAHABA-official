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
    throw new Error('Cannot reach the BAHABA API. Make sure the PHP API server is running and VITE_API_URL is configured correctly.')
  }

  const responseText = await response.text()
  let payload = {}
  try {
    payload = JSON.parse(responseText)
  } catch {
    if (response.ok) {
      throw new Error('The BAHABA API returned an invalid response. Check the API server logs.')
    }
  }

  if (!response.ok) {
    const error = new Error(
      payload.error
      || `The BAHABA API returned HTTP ${response.status}. Check that the PHP API server is running and review its logs.`,
    )
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
export const getProfile = () => request('profile.php')
export const updateProfile = (data) => request('profile.php', { method: 'PUT', body: JSON.stringify(data) })
export const getLocationData = () => request('location-data.php')
