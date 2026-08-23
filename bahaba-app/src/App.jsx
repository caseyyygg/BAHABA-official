import { useEffect, useMemo, useState } from 'react'
import './App.css'
import SplashPage from './pages/SplashPage'
import AuthPage from './pages/AuthPage'
import SelectionPage from './pages/SelectionPage'
import MapPage from './pages/MapPage'
import AlertsPage from './pages/AlertsPage'
import CommandPage from './pages/CommandPage'
import SettingsPage from './pages/SettingsPage'

const STORAGE_KEY = 'bahaba_local_accounts'
const SESSION_KEY = 'bahaba_current_user'

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

const cities = [
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

const barangays = [
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
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [selectedRegion, setSelectedRegion] = useState('National Capital Region — Metro Manila')
  const [selectedCity, setSelectedCity] = useState('Malabon')
  const [selectedBarangays, setSelectedBarangays] = useState(['Concepcion', 'Bayan-bayanan'])
  const [activeNav, setActiveNav] = useState('alerts')
  const [severity, setSeverity] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [accounts, setAccounts] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : []
  })
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem(SESSION_KEY)
    return saved ? JSON.parse(saved) : null
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts))
  }, [accounts])

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser))
  }, [currentUser])

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

  const handleSignupChange = (field, value) => {
    setSignupForm((current) => ({ ...current, [field]: value }))
  }

  const saveCreatedAccount = () => {
    if (!signupForm.email || !signupForm.username || !signupForm.password) {
      alert('Please complete your email, username, and password.')
      return
    }

    const newUser = {
      id: Date.now(),
      email: signupForm.email,
      username: signupForm.username,
      password: signupForm.password,
      location: signupForm.location,
      region: selectedRegion,
      city: selectedCity,
      barangays: selectedBarangays,
    }

    setAccounts((current) => {
      const filtered = current.filter((account) => account.username !== newUser.username)
      return [newUser, ...filtered]
    })
    setCurrentUser(newUser)
    setSignupForm(emptySignup)
    setScreen('map')
  }

  const handleLogin = () => {
    const match = accounts.find(
      (account) =>
        account.username === loginForm.username.trim() && account.password === loginForm.password,
    )

    if (!match) {
      alert('No local account matches that username and password.')
      return
    }

    setCurrentUser(match)
    setSelectedRegion(match.region || selectedRegion)
    setSelectedCity(match.city || selectedCity)
    setSelectedBarangays(match.barangays || selectedBarangays)
    setScreen('map')
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
            onSignupNext={() => setScreen('region')}
            onLoginSubmit={handleLogin}
            onSwitchMode={(nextMode) => setScreen(nextMode)}
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
            onSignupNext={() => setScreen('region')}
            onLoginSubmit={handleLogin}
            onSwitchMode={(nextMode) => setScreen(nextMode)}
          />
        )

      case 'region':
        return (
          <SelectionPage
            title="Your Location"
            subtitle="Choose a region to receive real-time flood alerts."
            items={regions}
            selectedValue={selectedRegion}
            onBack={() => setScreen('signup')}
            onSelect={(value) => {
              setSelectedRegion(value)
              setScreen('city')
            }}
          />
        )

      case 'city':
        return (
          <SelectionPage
            title="Select City"
            subtitle="Choose your city within Metro Manila."
            items={cities}
            selectedValue={selectedCity}
            onBack={() => setScreen('region')}
            onSelect={(value) => {
              setSelectedCity(value)
              setScreen('barangay')
            }}
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
              {barangays.map((barangay) => (
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
              <button className="primary-button" onClick={saveCreatedAccount}>Create Account</button>
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
          />
        )

      default:
        return null
    }
  }

  return <div className={`app-shell ${darkMode ? 'theme-dark' : ''}`}>{renderScreen()}</div>
}

export default App
