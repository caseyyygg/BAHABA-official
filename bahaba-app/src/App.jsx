import { useEffect, useState } from 'react'
import './App.css'
import SplashPage from './pages/SplashPage'
import AuthPage from './pages/AuthPage'
import SelectionPage from './pages/SelectionPage'
import MapPage from './pages/MapPage'
import AlertsPage from './pages/AlertsPage'
import CommandPage from './pages/CommandPage'
import SettingsPage from './pages/SettingsPage'
import { checkVerification, getLocationData, getProfile, login, logout, resendVerification, signup, updateProfile } from './api'
import { locationById, supportedLocations } from './locations'

const regions = [
  'National Capital Region — Metro Manila',
  'Cordillera Administrative Region',
  'Region I (Ilocos Region)',
  'Region II (Cagayan Valley)',
  'Region III (Central Luzon)',
  'Region IV-A (CALABARZON)',
  'Region IV-B (MIMAROPA)',
  'Region V (Bicol Region)',
]

const fallbackCities = [
  'Caloocan',
  'Navotas',
  'Las Piñas',
  'Parañaque',
  'Makati',
  'Pasay',
  'Malabon',
  'Quezon City',
  'Manila',
  'San Juan',
  'Marikina',
  'Taguig',
  'Muntinlupa',
  'Valenzuela',
]

const fallbackBarangays = [
  'Acacia',
  'Niugan',
  'Baritan',
  'Panghulo',
  'Bayan-bayanan',
  'Potrero',
  'Catmon',
  'San Agustin',
  'Dampalit',
  'Tañong',
  'Hulong Duhat',
  'Tinajeros',
  'Ibaba',
  'Tonsuya',
  'Longos',
  'Tugatog',
  'Concepcion',
  'Santulan',
]

const regionCodes = {
  'National Capital Region — Metro Manila': '130000000',
  'Cordillera Administrative Region': '140000000',
  'Region I (Ilocos Region)': '010000000',
  'Region II (Cagayan Valley)': '020000000',
  'Region III (Central Luzon)': '030000000',
  'Region IV-A (CALABARZON)': '040000000',
  'Region IV-B (MIMAROPA)': '170000000',
  'Region V (Bicol Region)': '050000000',
}

const navigation = [
  { id: 'alerts', label: 'Alerts', icon: '⚑' },
  { id: 'map', label: 'Map', icon: '🗺' },
  { id: 'command', label: 'Command', icon: '☎' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const emptySignup = {
  email: '',
  username: '',
  password: '',
  location: '',
  selected_location: '',
}

function App() {
  const [screen, setScreen] = useState('splash')
  const [signupForm, setSignupForm] = useState(emptySignup)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [selectedRegion, setSelectedRegion] = useState('National Capital Region — Metro Manila')
  const [selectedCity, setSelectedCity] = useState('Malabon')
  const [selectedBarangays, setSelectedBarangays] = useState(['Concepcion', 'Bayan-bayanan'])
  const [availableCities, setAvailableCities] = useState(fallbackCities)
  const [availableBarangays, setAvailableBarangays] = useState(fallbackBarangays)
  const [locationDataLoading, setLocationDataLoading] = useState(false)
  const [activeNav, setActiveNav] = useState('alerts')
  const [searchTerm, setSearchTerm] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [floodAlertsEnabled, setFloodAlertsEnabled] = useState(true)
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [currentPlace, setCurrentPlace] = useState('')
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false)
  const [locationStatus, setLocationStatus] = useState('')
  const [notificationStatus, setNotificationStatus] = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const [locationData, setLocationData] = useState({ reports: [], nlp_events: [], announcements: [], command_center: null })
  const [locationChangeStatus, setLocationChangeStatus] = useState('')
  const [locationChangeBusy, setLocationChangeBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  // Session persistence
  useEffect(() => {
    // Check for saved session on app load
    const savedUser = localStorage.getItem('bahaba_app_user')
    const sessionExpiry = localStorage.getItem('bahaba_app_session_expiry')
    
    if (savedUser && sessionExpiry && new Date().getTime() < parseInt(sessionExpiry)) {
      getProfile().then(({ user }) => {
        setCurrentUser(user)
        setSelectedRegion(user.region || 'National Capital Region — Metro Manila')
        setSelectedCity(locationById(user.selected_location)?.city || user.city || '')
        setSelectedBarangays(Array.isArray(user.barangays) ? user.barangays : [])
        setScreen(user.selected_location ? 'map' : 'settings')
        saveUserSession(user)
      }).catch(() => clearUserSession())
    } else {
      localStorage.removeItem('bahaba_app_user')
      localStorage.removeItem('bahaba_app_session_expiry')
    }

    // Check for verification link in URL
    if (new URLSearchParams(window.location.search).get('verified') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname)
      setScreen('verify')
    }
  }, [])

  useEffect(() => {
    if (!currentUser?.selected_location) {
      setLocationData({ reports: [], nlp_events: [], announcements: [], command_center: null })
      return undefined
    }

    let cancelled = false
    const refreshLocationData = () => getLocationData().then((data) => {
      if (!cancelled) setLocationData(data)
    }).catch((error) => {
      if (!cancelled) {
        setLocationData({ reports: [], nlp_events: [], announcements: [], command_center: null })
        console.warn('Could not load location data:', error.message)
      }
    })
    refreshLocationData()
    const refreshTimer = window.setInterval(refreshLocationData, 30000)
    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
    }
  }, [currentUser?.id, currentUser?.selected_location])

  // Save user to localStorage when they log in
  const saveUserSession = (user) => {
    try {
      localStorage.setItem('bahaba_app_user', JSON.stringify(user))
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + 30) // 30 days
      localStorage.setItem('bahaba_app_session_expiry', expiryDate.getTime().toString())
    } catch (e) {
      console.warn('Failed to save session:', e)
    }
  }

  const clearUserSession = () => {
    try {
      localStorage.removeItem('bahaba_app_user')
      localStorage.removeItem('bahaba_app_session_expiry')
    } catch (e) {
      console.warn('Failed to clear session:', e)
    }
  }

  const toggleBarangay = (barangay) => {
    setSelectedBarangays((current) =>
      current.includes(barangay)
        ? current.filter((item) => item !== barangay)
        : [...current, barangay],
    )
  }

  const loadLocationData = async (url, fallback) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Location data unavailable')
      const data = await response.json()
      return data.map((item) => ({ name: item.name, code: item.code }))
    } catch {
      return fallback.map((name) => ({ name, code: name }))
    }
  }

  const handleRegionSelect = async (region) => {
    setSelectedRegion(region)
    setSelectedCity('')
    setSelectedBarangays([])
    setLocationDataLoading(true)
    const citiesForRegion = await loadLocationData(
      `https://psgc.gitlab.io/api/regions/${regionCodes[region]}/cities-municipalities/`,
      region === 'National Capital Region — Metro Manila' ? fallbackCities : [],
    )
    setAvailableCities(citiesForRegion)
    setLocationDataLoading(false)
    setScreen('city')
  }

  const handleCitySelect = async (city) => {
    setSelectedCity(city.name)
    setSelectedBarangays([])
    setLocationDataLoading(true)
    const fallback = city.name === 'Malabon' ? fallbackBarangays : []
    const barangaysForCity = await loadLocationData(
      `https://psgc.gitlab.io/api/cities-municipalities/${city.code}/barangays/`,
      fallback,
    )
    setAvailableBarangays(barangaysForCity.map((item) => item.name))
    setLocationDataLoading(false)
    setScreen('barangay')
  }

  const handleSignupChange = (field, value) => {
    setSignupForm((current) => ({ ...current, [field]: value }))
  }

  const continueSignup = async () => {
    setAuthError('')
    const email = String(signupForm?.email ?? '').trim()
    const username = String(signupForm?.username ?? '').trim()
    const password = String(signupForm?.password ?? '')
    if (!locationById(signupForm.selected_location)) {
      setAuthError('Choose one of the supported locations before creating your account.')
      return
    }

    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
      setAuthError('Please enter a valid Gmail address ending in @gmail.com.')
      return
    }
    if (!username || password.length < 8) {
      setAuthError('Add a username and a password with at least 8 characters.')
      return
    }
    setAuthBusy(true)
    try {
      await signup({ ...signupForm, selected_location: signupForm.selected_location })
      setSignupForm(emptySignup)
      setScreen('verify')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  const saveCreatedAccount = async () => {
    setAuthError('')
    const safeBarangays = Array.isArray(selectedBarangays) ? selectedBarangays : []
    if (!selectedCity || safeBarangays.length === 0) {
      setAuthError('Select a city and at least one barangay before creating your account.')
      return
    }
    setAuthBusy(true)
    try {
      await signup({
        ...signupForm,
        selected_location: signupForm.selected_location,
        region: selectedRegion,
        city: selectedCity,
        barangays: safeBarangays,
      })
      setSignupForm(emptySignup)
      setScreen('verify')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogin = async () => {
    setAuthError('')
    setAuthBusy(true)
    try {
      const result = await login(loginForm)
      const userBarangays = Array.isArray(result?.user?.barangays) ? result.user.barangays : []
      setCurrentUser(result.user)
      saveUserSession(result.user)
      setSelectedRegion(result.user.region || selectedRegion)
      setSelectedCity(locationById(result.user.selected_location)?.city || result.user.city || '')
      setSelectedBarangays(userBarangays)
      setScreen(result.user.selected_location ? 'map' : 'settings')
    } catch (error) {
      setAuthError(error.message)
      if (error.needsVerification) setScreen('verify')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleVerificationCheck = async () => {
    setAuthError('')
    setAuthBusy(true)
    try {
      const result = await checkVerification()
      setCurrentUser(result.user)
      saveUserSession(result.user)
      setSelectedRegion(result.user.region || selectedRegion)
      setSelectedCity(locationById(result.user.selected_location)?.city || result.user.city || '')
      setSelectedBarangays(result.user.barangays || [])
      setScreen(result.user.selected_location ? 'map' : 'settings')
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  const handleResendVerification = async () => {
    setAuthError('')
    setAuthNotice('')
    setAuthBusy(true)
    try {
      const result = await resendVerification()
      setAuthNotice(result.message)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // Return to the signed-out screen even if the API session already expired.
    }
    setCurrentUser(null)
    clearUserSession()
    setLoginForm({ email: '', password: '' })
    setScreen('splash')
  }

  const handleDesiredLocationChange = async (selectedLocation) => {
    setLocationChangeStatus('')
    setLocationChangeBusy(true)
    try {
      const result = await updateProfile({ selected_location: selectedLocation })
      setCurrentUser(result.user)
      saveUserSession(result.user)
      setSelectedRegion(result.user.region)
      setSelectedCity(locationById(result.user.selected_location)?.city || '')
      setSelectedBarangays([])
      setActiveNav('map')
      setScreen('map')
    } catch (error) {
      setLocationChangeStatus(error.message)
    } finally {
      setLocationChangeBusy(false)
    }
  }

  const handleLocationToggle = (enabled) => {
    if (!enabled) {
      setLocationSharingEnabled(false)
      setCurrentLocation(null)
      setCurrentPlace('')
      setLocationStatus('Location sharing is off.')
      return
    }

    if (!navigator.geolocation) {
      setLocationSharingEnabled(false)
      setCurrentLocation(null)
      setCurrentPlace('')
      setLocationStatus('Location is not available in this browser.')
      return
    }

    setLocationStatus('Requesting your location...')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocationSharingEnabled(true)
        setCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude })
        setCurrentPlace('Finding your place...')
        setLocationStatus('Finding your current place...')
        fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`)
          .then((response) => response.ok ? response.json() : Promise.reject(new Error('Reverse geocoding failed')))
          .then((place) => {
            const area = place.locality || place.city || place.principalSubdivision || 'Current location'
            const neighborhood = place.localityInfo?.administrative?.find((item) =>
              ['suburb', 'neighbourhood', 'borough'].includes(item.description?.toLowerCase()),
            )?.name
            const label = neighborhood ? `${neighborhood}, ${area}` : area
            setCurrentPlace(label)
            setLocationStatus(`Location active: ${label}.`)
          })
          .catch(() => {
            setCurrentPlace('Place unavailable')
            setLocationStatus('Location is active, but the place name could not be found.')
          })
      },
      () => {
        setLocationSharingEnabled(false)
        setCurrentLocation(null)
        setLocationStatus('Location permission was not granted.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const handleNotificationsToggle = async (enabled) => {
    if (!enabled) {
      setPushNotificationsEnabled(false)
      setNotificationStatus('Push notifications are off.')
      return
    }

    if (!('Notification' in window)) {
      setNotificationStatus('Notifications are not available in this browser.')
      return
    }

    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushNotificationsEnabled(false)
        setNotificationStatus('Notification permission was not granted. Allow it in browser settings, then try again.')
        return
      }

      setPushNotificationsEnabled(true)
      setNotificationStatus('Push notifications are enabled.')
      if (floodAlertsEnabled) {
        new Notification('BAHABA alerts enabled', { body: 'You will receive flood alert notifications here.' })
      }
    } catch {
      setPushNotificationsEnabled(false)
      setNotificationStatus('Notifications are blocked for this site. Allow them in browser settings, then try again.')
    }
  }

  const renderScreen = () => {
    switch (screen) {
      case 'splash':
        return <SplashPage onGetStarted={() => setScreen('signup')} onLogin={() => setScreen('login')} />

      case 'signup':
        return (
          <AuthPage
            mode="signup"
            signupForm={signupForm}
            supportedLocations={supportedLocations}
            loginForm={loginForm}
            onSignupFieldChange={handleSignupChange}
            onLoginFieldChange={(field, value) => setLoginForm((current) => ({ ...current, [field]: value }))}
            onSignupNext={continueSignup}
            onLoginSubmit={handleLogin}
            onSwitchMode={(nextMode) => setScreen(nextMode)}
            error={authError}
            busy={authBusy}
          />
        )

      case 'login':
        return (
          <AuthPage
            mode="login"
            signupForm={signupForm}
            loginForm={loginForm}
            onSignupFieldChange={handleSignupChange}
            onLoginFieldChange={(field, value) => setLoginForm((current) => ({ ...current, [field]: value }))}
            onSignupNext={continueSignup}
            onLoginSubmit={handleLogin}
            onSwitchMode={(nextMode) => setScreen(nextMode)}
            error={authError}
            busy={authBusy}
          />
        )

      case 'verify':
        return <AuthPage mode="verify" onVerify={handleVerificationCheck} onResendVerification={handleResendVerification} onSwitchMode={(nextMode) => { setAuthError(''); setAuthNotice(''); setScreen(nextMode) }} error={authError} notice={authNotice} busy={authBusy} />

      case 'region':
        return (
          <SelectionPage
            title="Your Location"
            subtitle="Choose a region to receive real-time flood alerts."
            items={regions}
            selectedValue={selectedRegion}
            onBack={() => setScreen('signup')}
            onSelect={handleRegionSelect}
          />
        )

      case 'city':
        return (
          <SelectionPage
            title="Select City"
            subtitle={`Choose a city or municipality in ${selectedRegion}.`}
            items={availableCities}
            selectedValue={selectedCity}
            onBack={() => setScreen('region')}
            onSelect={handleCitySelect}
            loading={locationDataLoading}
            gridMode
          />
        )

      case 'barangay':
        return (
          <div className="phone-screen selection-screen">
            <div className="statusbar">
              <span>9:47</span>
              <div className="status-icons">
                <span className="signal"><i /></span>
                <span className="wifi" />
                <span className="battery" />
              </div>
            </div>

            <div className="header-panel dark">
              <div>Select Barangay</div>
              <small>Pick your barangay in {selectedCity} for precise alerts.</small>
            </div>

            <button className="back-link" type="button" onClick={() => setScreen('city')}>← Back</button>

            <div className="selection-list city-grid">
              <div className="list-title">Barangays</div>
              {availableBarangays.map((barangay) => (
                <button
                  key={barangay}
                  type="button"
                  className={`option-row ${selectedBarangays.includes(barangay) ? 'selected' : ''}`}
                  onClick={() => toggleBarangay(barangay)}
                >
                  {barangay}
                </button>
              ))}
            </div>

            <div className="bottom-actions">
              <button className="primary-button" onClick={saveCreatedAccount} disabled={authBusy}>
                {authBusy ? 'CREATING ACCOUNT...' : 'Create Account'}
              </button>
              {authError && <p className="auth-error selection-error">{authError}</p>}
            </div>
          </div>
        )

      case 'map':
        return (
          <MapPage
            key={currentUser?.selected_location || 'no-location'}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            setSelectedBarangays={setSelectedBarangays}
            selectedLocationId={currentUser?.selected_location}
            reports={locationData.reports}
            nlpEvents={locationData.nlp_events}
            navigation={navigation}
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            setScreen={setScreen}
          />
        )

      case 'alerts':
        return (
          <AlertsPage
            currentUser={currentUser}
            selectedCity={selectedCity}
            reports={locationData.reports}
            nlpEvents={locationData.nlp_events}
            announcements={locationData.announcements}
            commandCenter={locationData.command_center}
            navigation={navigation}
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            setScreen={setScreen}
          />
        )

      case 'command':
        return (
          <CommandPage
            selectedCity={selectedCity}
            reports={locationData.reports}
            nlpEvents={locationData.nlp_events}
            announcements={locationData.announcements}
            commandCenter={locationData.command_center}
            navigation={navigation}
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            setScreen={setScreen}
          />
        )

      case 'settings':
        return (
          <SettingsPage
            currentUser={currentUser}
            darkMode={darkMode}
            setDarkMode={setDarkMode}
            navigation={navigation}
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            setScreen={setScreen}
            onLogout={handleLogout}
            floodAlertsEnabled={floodAlertsEnabled}
            setFloodAlertsEnabled={setFloodAlertsEnabled}
            locationSharingEnabled={locationSharingEnabled}
            onLocationToggle={handleLocationToggle}
            pushNotificationsEnabled={pushNotificationsEnabled}
            onNotificationsToggle={handleNotificationsToggle}
            locationStatus={locationStatus}
            notificationStatus={notificationStatus}
            currentLocation={currentLocation}
            currentPlace={currentPlace}
            supportedLocations={supportedLocations}
            onDesiredLocationChange={handleDesiredLocationChange}
            locationChangeBusy={locationChangeBusy}
            locationChangeStatus={locationChangeStatus}
            selectedCity={selectedCity}
            selectedBarangays={selectedBarangays}
          />
        )

      default:
        return null
    }
  }

  return <div className={`app-shell ${darkMode ? 'theme-dark' : ''}`}>{renderScreen()}</div>
}

export default App
