const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

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
export const checkVerification = () => request('me.php')
export const logout = () => request('logout.php', { method: 'POST' })
