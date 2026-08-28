import { useEffect, useMemo, useState } from 'react'
import './App.css'
import SplashPage from './pages/SplashPage'
import AuthPage from './pages/AuthPage'
import SelectionPage from './pages/SelectionPage'
import MapPage from './pages/MapPage'
import AlertsPage from './pages/AlertsPage'
import CommandPage from './pages/CommandPage'
import SettingsPage from './pages/SettingsPage'
import { checkVerification, login, logout, signup } from './api'

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

const mapCards = [
  { name: 'Barangay Concepcion', city: 'Malabon City', risk: 'high', evac: 'Concepcion Elementary School, Sto. Niño Multi-Purpose Hall' },
  { name: 'Barangay Baritan', city: 'Malabon City', risk: 'high', evac: 'Baritan Elementary School, Barangay Hall' },
  { name: 'Barangay Tumana', city: 'Malabon City', risk: 'high', evac: 'Malanday Elementary School, Barangay Hall' },
  { name: 'Barangay Malanday', city: 'Malabon City', risk: 'medium', evac: 'Malanday Elementary School' },
  { name: 'Barangay Longos', city: 'Malabon City', risk: 'low', evac: 'Longos Elementary School' },
  { name: 'Barangay Muzon', city: 'Malabon City', risk: 'low', evac: 'Muzon Covered Court' },
]

const locationSearchSuggestions = [
  { name: 'Barangay Concepcion', city: 'Malabon City', status: 'high' },
  { name: 'Barangay Malanday', city: 'Malabon City', status: 'medium' },
  { name: 'Barangay Longos', city: 'Malabon City', status: 'low' },
  { name: 'Barangay Baritan', city: 'Malabon City', status: 'high' },
  { name: 'Barangay Tumana', city: 'Malabon City', status: 'high' },
  { name: 'Barangay Muzon', city: 'Malabon City', status: 'low' },
  { name: 'Navotas City', city: 'Navotas', status: 'medium' },
  { name: 'Las Piñas', city: 'Las Piñas', status: 'low' },
]

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
  const [severity, setSeverity] = useState('all')
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
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('verified') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname)
      setScreen('verify')
    }
  }, [])

  const filteredMapCards = useMemo(() => {
    if (severity === 'all') return mapCards
    return mapCards.filter((item) => item.risk === severity)
  }, [severity])

  const filteredSearchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    if (!query) {
      return locationSearchSuggestions.slice(0, 5)
    }

    return locationSearchSuggestions.filter((item) =>
      item.name.toLowerCase().includes(query) || item.city.toLowerCase().includes(query),
    )
  }, [searchTerm])

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

  const continueSignup = () => {
    setAuthError('')
    if (!/^[^\s@]+@gmail\.com$/i.test(signupForm.email.trim())) {
      setAuthError('Please enter a valid Gmail address ending in @gmail.com.')
      return
    }
    if (!signupForm.username.trim() || signupForm.password.length < 8) {
      setAuthError('Add a username and a password with at least 8 characters.')
      return
    }
    setScreen('region')
  }

  const saveCreatedAccount = async () => {
    setAuthError('')
    if (!selectedCity || selectedBarangays.length === 0) {
      setAuthError('Select a city and at least one barangay before creating your account.')
      return
    }
    setAuthBusy(true)
    try {
      await signup({ ...signupForm, region: selectedRegion, city: selectedCity, barangays: selectedBarangays })
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
      setCurrentUser(result.user)
      setSelectedRegion(result.user.region || selectedRegion)
      setSelectedCity(result.user.city || selectedCity)
      setSelectedBarangays(result.user.barangays || selectedBarangays)
      setScreen('map')
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
      setSelectedRegion(result.user.region || selectedRegion)
      setSelectedCity(result.user.city || selectedCity)
      setSelectedBarangays(result.user.barangays || selectedBarangays)
      setScreen('map')
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
    setLoginForm({ email: '', password: '' })
    setScreen('splash')
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
        return <AuthPage mode="verify" onVerify={handleVerificationCheck} onSwitchMode={(nextMode) => { setAuthError(''); setScreen(nextMode) }} error={authError} busy={authBusy} />

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
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredSearchResults={filteredSearchResults}
            setSelectedBarangays={setSelectedBarangays}
            severity={severity}
            setSeverity={setSeverity}
            filteredMapCards={filteredMapCards}
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
            navigation={navigation}
            activeNav={activeNav}
            setActiveNav={setActiveNav}
            setScreen={setScreen}
          />
        )

      case 'command':
        return (
          <CommandPage
            selectedBarangays={selectedBarangays}
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
