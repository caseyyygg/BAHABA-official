const API_URL = import.meta.env.VITE_API_URL || '/api'

async function request(endpoint, options = {}) {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong.')
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
