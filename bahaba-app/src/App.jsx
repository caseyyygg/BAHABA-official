import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSavedSetting } from './useSavedSetting'
import { notificationRegistration, showBahabaNotification, withNotificationTimeout } from './notifications'
import './App.css'
import SplashPage from './pages/SplashPage'
import AuthPage from './pages/AuthPage'
import ForgotPassword from './components/ForgotPassword'
import AlertsPage from './pages/AlertsPage'
import CommandPage from './pages/CommandPage'
import SettingsPage from './pages/SettingsPage'
import LocationPicker from './components/LocationPicker'
import { getNotificationEvents, resolveCurrentLocation } from './api'
import {
  checkVerification,
  getLocationData,
  getProfile,
  login,
  logout,
  resendVerification,
  signup,
  updateProfile,
} from './api'
import { locationById, supportedLocations, completedPreferences } from './locations'
const NationwideMap = lazy(() => import('./pages/NationwideMap'))

const getPlaceName = async ({ latitude, longitude }) => {
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
  )
  if (!response.ok) {
    throw new Error('Could not look up your address. Please enter it manually.')
  }

  const place = await response.json()
  const area = place.locality || place.city || place.principalSubdivision
  if (!area) {
    throw new Error('Could not identify your current area. Please enter your address manually.')
  }

  const neighborhood = place.localityInfo?.administrative?.find(
    (item) =>
      ['suburb', 'neighbourhood', 'borough'].includes(
        item.description?.toLowerCase(),
      ),
  )?.name

  return neighborhood ? `${neighborhood}, ${area}` : area
}

const navigation = [
  {
    id: 'alerts',
    label: 'Alerts',
    icon: 'alerts',
  },
  {
    id: 'map',
    label: 'Map',
    icon: 'map',
  },
  {
    id: 'command',
    label: 'Command Center',
    icon: 'command',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
  },
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
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })
  const [selectedCity, setSelectedCity] = useState('')
  const [activeNav, setActiveNav] = useState('alerts')
  const [darkMode, setDarkMode] = useSavedSetting('bahaba_dark_mode', false)
  const [floodAlertsEnabled, setFloodAlertsEnabled] = useSavedSetting('bahaba_flood_alerts', true)
  const [locationSharingEnabled, setLocationSharingEnabled] = useSavedSetting('bahaba_location_sharing', false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [currentPlace, setCurrentPlace] = useState('')
  const [currentPsgc, setCurrentPsgc] = useState(null)
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useSavedSetting('bahaba_notifications', true)
  const notificationPreferences = useRef({})
  notificationPreferences.current = { push: pushNotificationsEnabled, flood: floodAlertsEnabled }
  const [locationStatus, setLocationStatus] = useState('')
  const [notificationStatus, setNotificationStatus] = useState('')
  const [alertBanner, setAlertBanner] = useState(null)
  const appShellRef = useRef(null)
  const [notificationHost, setNotificationHost] = useState(null)
  useLayoutEffect(() => {
    const shell = appShellRef.current
    const update = () => setNotificationHost(shell?.querySelector('.phone-screen') || null)
    update()
    // Suspense can replace the screen after this effect runs.
    const observer = new MutationObserver(update)
    if (shell) observer.observe(shell, { childList: true })
    return () => observer.disconnect()
  }, [screen])
  const [currentUser, setCurrentUser] = useState(null)
  const [locationData, setLocationData] = useState({
    reports: [],
    nlp_events: [],
    announcements: [],
    command_center: null,
    evacuation_centers: [],
  })
  const [locationRefreshing, setLocationRefreshing] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [signupLocationBusy, setSignupLocationBusy] = useState(false)
  const [signupLocationNotice, setSignupLocationNotice] = useState(null)

  // Session persistence
  useEffect(() => {
    // Check for saved session on app load
    const savedUser = localStorage.getItem('bahaba_app_user')
    const sessionExpiry = localStorage.getItem('bahaba_app_session_expiry')

    if (
      savedUser &&
      sessionExpiry &&
      new Date().getTime() < parseInt(sessionExpiry)
    ) {
      getProfile()
        .then(({ user }) => {
          setCurrentUser(user)
          setSelectedCity(
            locationById(user.selected_location)?.city || user.city || '',
          )
          // Returning sessions use the locations already stored on the account.
          setScreen('map')
          saveUserSession(user)
        })
        .catch(() => clearUserSession())
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

  const notificationScope = `${currentUser?.id || ''}:${currentUser?.preferences_updated_at || ''}:${(currentUser?.preferred_locations || []).join(',')}`
  useEffect(() => {
    setAlertBanner(null)
    if (!currentUser?.id) return
    let cancelled = false
    let refreshing = false
    let cursor = null
    const refresh = async () => {
      if (cancelled || refreshing) return
      refreshing = true
      try {
        const data = await getNotificationEvents(cursor, currentPsgc || '')
        if (cancelled) return
        cursor = data.cursor
        const events = data.events.filter(e => e.kind !== 'flood' || notificationPreferences.current.flood)
        if (!events.length) return
        const title = events.length === 1 ? `BAHABA: ${events[0].title}` : `BAHABA: ${events.length} new alerts`
        const body = events.map(e => [e.city, e.province, e.barangay, e.title].filter(Boolean).join(', ')).join(' · ')
        setAlertBanner({ title, body, isTest: false })
        if (notificationPreferences.current.push && 'Notification' in window && Notification.permission === 'granted') {
          const registration = await notificationRegistration()
          if (!cancelled && notificationPreferences.current.push) await showBahabaNotification(title, {
            body, tag: `bahaba-events-${events.map(e => e.id).join('-')}`, data: { url: '/' },
          }, registration)
        }
      } catch (e) {
        if (!cancelled) setNotificationStatus(`Notifications unavailable: ${e.message}`)
      } finally { refreshing = false }
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [notificationScope, currentUser?.id, currentPsgc])

  useEffect(() => {
    if (!currentUser?.id) return
    let cancelled = false
    const refresh = () => getLocationData(currentPsgc).then(data => { if (!cancelled) setLocationData(data) }).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [notificationScope, currentUser?.id, currentPsgc])

  // Keep the bottom-nav highlight in sync with whichever tab screen is showing
  useEffect(() => {
    if (navigation.some((item) => item.id === screen)) {
      setActiveNav(screen)
    }
  }, [screen])

  // Manual refresh for the Alerts page, in addition to automatic location updates.
  const handleRefreshLocationData = async () => {
    if (!currentUser?.id || locationRefreshing) return
    setLocationRefreshing(true)
    try {
      setLocationData(await getLocationData(currentPsgc))
    } catch (error) {
      console.warn('Could not refresh location data:', error.message)
    } finally {
      setLocationRefreshing(false)
    }
  }

  // Save user to localStorage when they log in
  const saveUserSession = (user) => {
    try {
      localStorage.setItem('bahaba_app_user', JSON.stringify(user))
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + 30) // 30 days
      localStorage.setItem(
        'bahaba_app_session_expiry',
        expiryDate.getTime().toString(),
      )
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

  const handleSignupChange = (field, value) => {
    setSignupForm((current) => ({
      ...current,
      [field]: value,
    }))
    if (field === 'location') setSignupLocationNotice(null)
  }

  const handleUseSignupLocation = async () => {
    setSignupLocationNotice(null)
    if (!navigator.geolocation) {
      setSignupLocationNotice({
        type: 'error',
        text: 'Location is not available in this browser. You can enter your address manually.',
      })
      return
    }

    setSignupLocationBusy(true)
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        })
      })
      const placeName = await getPlaceName(position.coords)
      handleSignupChange('location', placeName)
      setSignupLocationNotice({
        type: 'success',
        text: `Location added: ${placeName}`,
      })
    } catch (error) {
      const message =
        error.code === 1
          ? 'Location permission was not granted. You can enter your address manually.'
          : error.code === 2
            ? 'Your location could not be determined. You can enter your address manually.'
            : error.code === 3
              ? 'Location request timed out. Try again or enter your address manually.'
              : error.message ||
                'Could not get your location. You can enter your address manually.'
      setSignupLocationNotice({
        type: 'error',
        text: message,
      })
    } finally {
      setSignupLocationBusy(false)
    }
  }

  const continueSignup = async () => {
    setAuthError('')
    const email = String(signupForm?.email ?? '').trim()
    const username = String(signupForm?.username ?? '').trim()
    const password = String(signupForm?.password ?? '')
    if (!locationById(signupForm.selected_location)) {
      setAuthError(
        'Choose one of the supported locations before creating your account.',
      )
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
      await signup({
        ...signupForm,
        selected_location: signupForm.selected_location,
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
      setCurrentUser(result.user)
      saveUserSession(result.user)
      setSelectedCity(
        locationById(result.user.selected_location)?.city ||
          result.user.city ||
          '',
      )
      // Location onboarding belongs to account activation, not every login.
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
      saveUserSession(result.user)
      setSelectedCity(
        locationById(result.user.selected_location)?.city ||
          result.user.city ||
          '',
      )
      setScreen(completedPreferences(result.user) ? 'map' : 'preferences')
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
    setCurrentUser(null)
    setCurrentPsgc(null)
    setCurrentLocation(null)
    setCurrentPlace('')
    setLocationData({ reports: [], nlp_events: [], announcements: [], command_center: null, evacuation_centers: [] })
    clearUserSession()
    setLoginForm({
      email: '',
      password: '',
    })
    setScreen('splash')
    logout().catch((error) => {
      console.warn(
        'Could not end the server session during logout:',
        error.message,
      )
    })
  }

  const handleSaveProfile = async (changes) => {
    const { user } = await updateProfile(changes)
    setCurrentUser(user)
    saveUserSession(user)
  }

  const handleLocationToggle = useCallback((enabled) => {
    setLocationSharingEnabled(enabled)
    if (!enabled) {
      setCurrentPsgc(null); setCurrentLocation(null); setCurrentPlace('')
      setLocationStatus('Location sharing is off. Saved preferences remain active.')
    }
  }, [setLocationSharingEnabled])

  useEffect(() => {
    if (!currentUser?.id || !locationSharingEnabled) return
    if (!navigator.geolocation) {
      setCurrentPsgc(null); setLocationStatus('GPS is unavailable. Saved preferences remain active.')
      return
    }
    let cancelled = false
    let lookup = 0
    setLocationStatus('Requesting your current location…')
    const watch = navigator.geolocation.watchPosition(async ({ coords }) => {
      const own = ++lookup
      setCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude })
      try {
        const { location } = await resolveCurrentLocation(coords)
        if (cancelled || own !== lookup) return
        setCurrentPsgc(location?.id || null); setCurrentPlace(location?.name || '')
        setLocationStatus(location ? `Current location: ${location.name}` : 'Current municipality could not be verified. Saved preferences remain active.')
      } catch {
        if (!cancelled && own === lookup) {
          setCurrentPsgc(null); setCurrentPlace('')
          setLocationStatus('Location detection failed. Saved preferences remain active.')
        }
      }
    }, () => {
      if (cancelled) return
      lookup++; setCurrentPsgc(null); setCurrentLocation(null); setCurrentPlace('')
      setLocationStatus('GPS permission denied or detection failed. Saved preferences remain active.')
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 })
    return () => { cancelled = true; navigator.geolocation.clearWatch(watch); setCurrentPsgc(null) }
  }, [currentUser?.id, locationSharingEnabled])

  const handleNotificationsToggle = async (enabled) => {
    if (!enabled) {
      setPushNotificationsEnabled(false)
      setNotificationStatus('Push notifications are off.')
      return
    }

    setNotificationStatus('Starting notification test…')
    setAlertBanner({ title: 'Test notification', body: 'This is how flood alerts will appear in BAHABA.', isTest: true })
    if (!window.isSecureContext) {
      setNotificationStatus('Notifications require HTTPS or localhost. Open BAHABA using a secure address.')
      return
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setNotificationStatus(
        'Notifications are not available in this browser.',
      )
      return
    }

    try {
      setNotificationStatus(`Checking Chrome notification permission (${Notification.permission})… If a permission prompt appears, choose Allow.`)
      const permission = await withNotificationTimeout(Notification.requestPermission(), 'Permission request')
      if (permission !== 'granted') {
        setPushNotificationsEnabled(false)
        setNotificationStatus(
          'Notification permission was not granted. Allow it in browser settings, then try again.',
        )
        return
      }

      setNotificationStatus('Permission granted. Starting notification worker…')
      const registration = await notificationRegistration()
      setNotificationStatus('Worker ready. Asking Chrome to display the notification…')
      await showBahabaNotification('BAHABA alerts enabled', {
        body: 'This is a test notification. Keep BAHABA open to receive new LGU flood alerts.',
        tag: `bahaba-notification-test-${Date.now()}`,
      }, registration)
      setPushNotificationsEnabled(true)
      const visible = await withNotificationTimeout(registration.getNotifications(), 'Reading active notifications')
      setNotificationStatus(visible.length > 0 ? 'Test sent. Keep BAHABA open to receive new flood alerts.' : 'Test sent. Check your notification center if no banner appeared.')
    } catch (error) {
      setPushNotificationsEnabled(false)
      setNotificationStatus(
        `Could not show the test notification: ${error.message || 'Unknown browser error'}. Check browser and device notification settings.`,
      )
    }
  }

  const renderScreen = () => {
    switch (screen) {
      case 'splash':
        return (
          <SplashPage
            onGetStarted={() => setScreen('signup')}
            onLogin={() => setScreen('login')}
          />
        )

      case 'signup':
        return (
          <AuthPage
            mode="signup"
            signupForm={signupForm}
            supportedLocations={supportedLocations}
            onUseSignupLocation={handleUseSignupLocation}
            signupLocationBusy={signupLocationBusy}
            signupLocationNotice={signupLocationNotice}
            loginForm={loginForm}
            onSignupFieldChange={handleSignupChange}
            onLoginFieldChange={(field, value) =>
              setLoginForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onSignupNext={continueSignup}
            onLoginSubmit={handleLogin}
            onSwitchMode={(nextMode) => setScreen(nextMode)}
            error={authError}
            busy={authBusy}
          />
        )

      case 'forgot':
        return <ForgotPassword onBack={() => setScreen('login')} />

      case 'login':
        return (
          <AuthPage
            mode="login"
            signupForm={signupForm}
            loginForm={loginForm}
            onSignupFieldChange={handleSignupChange}
            onLoginFieldChange={(field, value) =>
              setLoginForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onSignupNext={continueSignup}
            onLoginSubmit={handleLogin}
            onSwitchMode={(nextMode) => setScreen(nextMode)}
            error={authError}
            busy={authBusy}
          />
        )

      case 'verify':
        return (
          <AuthPage
            mode="verify"
            onVerify={handleVerificationCheck}
            onResendVerification={handleResendVerification}
            onSwitchMode={(nextMode) => {
              setAuthError('')
              setAuthNotice('')
              setScreen(nextMode)
            }}
            error={authError}
            notice={authNotice}
            busy={authBusy}
          />
        )

      case 'preferences':
        return <div className="phone-screen preferences-screen"><LocationPicker
          initial={currentUser?.preferred_locations || []}
          onSave={async ids => { await handleSaveProfile({ preferred_locations: ids }); setScreen('map') }}
          onCancel={completedPreferences(currentUser) ? () => setScreen('settings') : undefined}
          onLogout={handleLogout}
        /></div>

      case 'map':
        return <Suspense fallback={<div className="phone-screen">Loading nationwide map…</div>}><NationwideMap currentPsgc={currentPsgc} preferred={currentUser?.preferred_locations || []}
          navigation={navigation} setScreen={setScreen} /></Suspense>

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
            onRefresh={handleRefreshLocationData}
            refreshing={locationRefreshing}
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
            evacuationCenters={locationData.evacuation_centers}
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
            onSaveProfile={handleSaveProfile}
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
          />
        )

      default:
        return null
    }
  }

  return (
    <div ref={appShellRef} className={`app-shell ${darkMode ? 'theme-dark' : ''}`}>
      {renderScreen()}
      {alertBanner && notificationHost && createPortal(
        <aside className="in-app-alert" aria-label="BAHABA notification">
          <div role="status" aria-live="polite" aria-atomic="true">
            <strong>{alertBanner.title}</strong>
            <p>{alertBanner.body}</p>
          </div>
          <div className="in-app-alert-actions">
            {!alertBanner.isTest && <button type="button" onClick={() => { setScreen('alerts'); setAlertBanner(null) }}>View alerts</button>}
            <button type="button" onClick={() => setAlertBanner(null)} aria-label="Dismiss notification">Dismiss</button>
          </div>
        </aside>, notificationHost
      )}
    </div>
  )
}

export default App
