import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useSavedSetting } from './useSavedSetting'
import { notificationRegistration, showBahabaNotification, withNotificationTimeout } from './notifications'
import './App.css'
import SplashPage from './pages/SplashPage'
import RisingFloodTransition from './components/RisingFloodTransition'
import AuthPage from './pages/AuthPage'
import ForgotPassword from './components/ForgotPassword'
import AlertsPage from './pages/AlertsPage'
import CommandPage from './pages/CommandPage'
import SettingsPage from './pages/SettingsPage'
import LocationPicker from './components/LocationPicker'
import ReportLocationMap from './components/ReportLocationMap'
import { getNotificationEvents, getResidentReportLocation, registerPushDevice, resolveCurrentLocation, submitResidentReport, unregisterPushDevice } from './api'
import {
  checkVerification,
  getLocationData,
  getProfile,
  login,
  logout,
  deleteAccount,
  resendVerification,
  signup,
  updateProfile,
} from './api'
import { locationById, supportedLocations, completedPreferences } from './locations'
const NationwideMap = lazy(() => import('./pages/NationwideMap'))
const preferredStartLocation = (user) => {
  const preferred = Array.isArray(user?.preferred_locations) ? user.preferred_locations : []
  return preferred.includes(user?.selected_location) ? user.selected_location : preferred[0] || user?.selected_location || ''
}

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

function ReportFloodModal({ open, onClose, draft, onSubmit, onRetry, onDescriptionChange, description, submitting, status }) {
  if (!open) return null
  const location = draft?.address || 'Detecting your location…'
  return (
    <div className="report-fab-overlay" role="dialog" aria-modal="true" aria-label="Report flood">
      <div className="report-fab-card">
        <div className="report-fab-header">
          <div>
            <p className="report-fab-eyebrow">Report Flood</p>
            <h2>Report Flood</h2>
          </div>
          <button type="button" className="report-fab-close" aria-label="Close flood report form" onClick={onClose}>×</button>
        </div>

        <div className="report-fab-locator">
          <ReportLocationMap latitude={draft?.latitude} longitude={draft?.longitude} />
          <div className="report-fab-location-copy">
            <strong>Current GPS location</strong>
            <p>{location}</p>
            <small>
              {draft?.latitude != null && draft?.longitude != null
                ? `${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)} · ±${Math.round(draft.accuracy)} m`
                : 'Waiting for GPS…'}
            </small>
          </div>
        </div>

        <div className="report-fab-meta">
          <div><span>Barangay</span><strong>{draft?.barangay || 'Unidentified'}</strong></div>
          <div><span>Municipality</span><strong>{draft?.municipality || 'Unidentified'}</strong></div>
        </div>

        <label className="report-fab-description">
          Flood details (optional)
          <textarea maxLength={1000} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Describe what you observed." />
        </label>

        {status && <p className="report-fab-status">{status}</p>}

        <div className="report-fab-actions">
          {(!draft?.requestKey || !draft?.barangayFeatureId) && <button type="button" className="report-fab-secondary" onClick={onRetry} disabled={submitting}>Retry GPS</button>}
          <button type="button" className="report-fab-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="button" className="report-fab-primary" onClick={onSubmit} disabled={!draft?.requestKey || !draft?.barangayFeatureId || submitting}>
            {submitting ? 'Sending…' : 'Confirm Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

const navigation = [
  {
    id: 'alerts',
    label: 'Alerts',
    icon: 'alerts',
  },
  {
    id: 'map',
    label: 'Reports',
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
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const [loginTransitionActive, setLoginTransitionActive] = useState(false)
  const [loginTransitionRevealed, setLoginTransitionRevealed] = useState(false)
  const [signupForm, setSignupForm] = useState(emptySignup)
  const [loginForm, setLoginForm] = useState({
    email: '',
    password: '',
  })
  const [activeLocationId, setActiveLocationId] = useState('')
  const [activeNav, setActiveNav] = useState('alerts')
  const [darkMode, setDarkMode] = useSavedSetting('bahaba_dark_mode', false)
  const [floodAlertsEnabled, setFloodAlertsEnabled] = useSavedSetting('bahaba_flood_alerts', true)
  const [locationSharingEnabled, setLocationSharingEnabled] = useSavedSetting('bahaba_location_sharing', false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [currentPlace, setCurrentPlace] = useState('')
  const [currentPsgc, setCurrentPsgc] = useState(null)
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useSavedSetting('bahaba_notifications', true)
  const nativePushToken = useRef('')
  const notificationPreferences = useRef({})
  notificationPreferences.current = { push: pushNotificationsEnabled, flood: floodAlertsEnabled }
  const [locationStatus, setLocationStatus] = useState('')
  const [notificationStatus, setNotificationStatus] = useState('')
  const [alertBanner, setAlertBanner] = useState(null)
  const [reportFloodOpen, setReportFloodOpen] = useState(false)
  const [reportDraft, setReportDraft] = useState(null)
  const [reportLocationStatus, setReportLocationStatus] = useState('Requesting your current GPS location…')
  const [reportDescription, setReportDescription] = useState('')
  const [reportSubmitting, setReportSubmitting] = useState(false)
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
  useEffect(() => {
    if (!currentUser?.id) return
    setPushNotificationsEnabled(currentUser.push_notifications_enabled !== false)
    setFloodAlertsEnabled(currentUser.flood_notifications_enabled !== false)
  }, [currentUser?.id, currentUser?.push_notifications_enabled, currentUser?.flood_notifications_enabled, setPushNotificationsEnabled, setFloodAlertsEnabled])

  useEffect(() => {
    if (!currentUser?.id || !pushNotificationsEnabled || !Capacitor.isNativePlatform()) return
    let cancelled = false
    const listeners = []
    const listen = async () => {
      listeners.push(await PushNotifications.addListener('registration', token => {
        if (cancelled || !token?.value) return
        nativePushToken.current = token.value
        registerPushDevice(token.value).catch(error => setNotificationStatus(`Push token could not be saved: ${error.message}`))
      }))
      listeners.push(await PushNotifications.addListener('registrationError', () => {
        if (!cancelled) setNotificationStatus('Could not register this device for push notifications. Check your connection and try again.')
      }))
      listeners.push(await PushNotifications.addListener('pushNotificationReceived', notification => {
        if (!cancelled) setAlertBanner({ title: notification.title || 'BANTALA alert', body: notification.body || '', isTest: false })
      }))
      listeners.push(await PushNotifications.addListener('pushNotificationActionPerformed', action => {
        const data = action.notification?.data || {}
        if (data.psgc_id) setActiveLocationId(String(data.psgc_id))
        setScreen('map')
        setActiveNav('alerts')
      }))
      try {
        await PushNotifications.createChannel({ id: 'flood-alerts', name: 'Flood alerts and LGU announcements', description: 'Verified flood reports, preliminary flood signals, and published LGU announcements.', importance: 5, sound: 'default', vibration: true, visibility: 1 })
        let permission = await PushNotifications.checkPermissions()
        if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions()
        if (permission.receive !== 'granted') {
          if (!cancelled) setNotificationStatus('Allow notifications in Android settings to receive alerts while BANTALA is closed.')
          return
        }
        await PushNotifications.register()
      } catch {
        if (!cancelled) setNotificationStatus('Push notifications are unavailable on this device right now.')
      }
    }
    listen()
    return () => {
      cancelled = true
      listeners.forEach(listener => listener.remove())
    }
  }, [currentUser?.id, pushNotificationsEnabled])
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
  const revealLoginTransition = useCallback(() => setLoginTransitionRevealed(true), [])
  const finishLoginTransition = useCallback(() => setLoginTransitionActive(false), [])

  // Always validate the server cookie; local storage is only a convenience cache.
  useEffect(() => {
    let active = true
    const verificationLink = new URLSearchParams(window.location.search).get('verified') === '1'
    setSessionError('')
    getProfile()
      .then(({ user }) => {
        if (!active) return
        setCurrentUser(user)
        setActiveLocationId(preferredStartLocation(user))
        saveUserSession(user)
        setLoginTransitionRevealed(false)
        setLoginTransitionActive(true)
        setScreen('map')
        if (verificationLink) window.history.replaceState({}, document.title, window.location.pathname)
      })
      .catch(error => {
        if (!active) return
        if (error.status === 401) {
          clearUserSession()
          if (verificationLink) {
            window.history.replaceState({}, document.title, window.location.pathname)
            setScreen('verify')
          }
          setSessionChecked(true)
        } else {
          setSessionError('Could not check your session. Check your connection and try again.')
        }
      })
      .finally(() => { if (active) setSessionChecked(true) })
    return () => { active = false }
  }, [sessionAttempt])

  const preferredLocationIds = useMemo(() => Array.isArray(currentUser?.preferred_locations) ? currentUser.preferred_locations : [], [currentUser?.preferred_locations])
  const availableLocationIds = useMemo(() => [...new Set([
    ...preferredLocationIds,
    ...(!preferredLocationIds.length && currentUser?.selected_location ? [currentUser.selected_location] : []),
    ...(currentPsgc ? [currentPsgc] : []),
  ])], [preferredLocationIds, currentUser?.selected_location, currentPsgc])
  const fallbackLocationId = preferredStartLocation(currentUser)
  const selectedLocationId = availableLocationIds.includes(activeLocationId) ? activeLocationId : fallbackLocationId || currentPsgc
  const selectedCity = locationById(selectedLocationId)?.city || currentUser?.city || ''

  useEffect(() => {
    if (!currentUser?.id) return
    setActiveLocationId(current => availableLocationIds.includes(current) ? current : fallbackLocationId || currentPsgc || '')
  }, [currentUser?.id, availableLocationIds, fallbackLocationId, currentPsgc])

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
        const events = data.events.filter(e => !['flood', 'flood_signal'].includes(e.kind) || notificationPreferences.current.flood)
        if (!events.length) return
        const title = events.length === 1 ? `BANTALA: ${events[0].title}` : `BANTALA: ${events.length} new alerts`
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
    const refresh = () => getLocationData(currentPsgc, selectedLocationId).then(data => { if (!cancelled) setLocationData(data) }).catch(() => {})
    refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [notificationScope, currentUser?.id, currentPsgc, selectedLocationId])

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
      setLocationData(await getLocationData(currentPsgc, selectedLocationId))
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
      setActiveLocationId(preferredStartLocation(result.user))
      setLoginTransitionRevealed(false)
      setLoginTransitionActive(true)
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
      setActiveLocationId(preferredStartLocation(result.user))
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
    if (nativePushToken.current) {
      await unregisterPushDevice(nativePushToken.current).catch(() => {})
      nativePushToken.current = ''
      if (Capacitor.isNativePlatform()) await PushNotifications.unregister().catch(() => {})
    }
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

  const handleDeleteAccount = async (currentPassword) => {
    await deleteAccount({ current_password: currentPassword })
    if (nativePushToken.current && Capacitor.isNativePlatform()) {
      await PushNotifications.unregister().catch((error) => {
        console.warn('Could not unregister local push notifications after account deletion:', error.message)
      })
      nativePushToken.current = ''
    }
    setCurrentUser(null)
    setCurrentPsgc(null)
    setCurrentLocation(null)
    setCurrentPlace('')
    setLocationData({ reports: [], nlp_events: [], announcements: [], command_center: null, evacuation_centers: [] })
    clearUserSession()
    setLoginForm({ email: '', password: '' })
    setLocationSharingEnabled(false)
    setPushNotificationsEnabled(false)
    setFloodAlertsEnabled(false)
    setScreen('splash')
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

  const handleReportFlood = async (retry = false) => {
    setReportFloodOpen(true)
    if (!retry) setReportDescription('')
    setReportDraft(null)
    if (!navigator.geolocation) {
      setReportLocationStatus('GPS is unavailable in this browser. Use HTTPS or the Android app, then retry.')
      return
    }

    setReportLocationStatus('Requesting your current GPS location…')
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000,
        })
      })
      const { latitude, longitude, accuracy } = position.coords
      const { location } = await getResidentReportLocation({ latitude, longitude, accuracy })
      if (!location?.barangay || !location?.barangay_feature_id || !location?.city) {
        throw new Error('A supported barangay could not be identified from this GPS location.')
      }
      setReportDraft({
        latitude,
        longitude,
        accuracy,
        barangay: location.barangay,
        municipality: location.city,
        barangayFeatureId: location.barangay_feature_id,
        locationId: location.location_id,
        requestKey: crypto.randomUUID(),
        address: `${location.barangay}, ${location.city}`,
      })
      setReportLocationStatus('GPS location matched to official barangay boundaries.')
    } catch (error) {
      const message = error?.code === 1
        ? 'Location permission was denied. Allow GPS access in your device settings and retry.'
        : error?.code === 2
          ? 'GPS detection is unavailable right now. Please try again in a moment.'
          : error?.code === 3
            ? 'Location detection timed out. Please try again or enter a location manually.'
            : error?.message || 'Could not detect a supported barangay. Please retry.'
      setReportLocationStatus(message)
    }
  }

  const handleReportConfirm = async () => {
    if (!reportDraft?.requestKey || reportDraft.latitude == null || reportDraft.longitude == null || !reportDraft.barangayFeatureId) {
      setReportLocationStatus('A valid GPS location inside a supported barangay is required before sending a report.')
      return
    }

    setReportSubmitting(true)
    setReportLocationStatus('Sending your report securely to the responsible LGU…')
    try {
      const { report } = await submitResidentReport({
        request_key: reportDraft.requestKey,
        latitude: reportDraft.latitude,
        longitude: reportDraft.longitude,
        accuracy: reportDraft.accuracy,
        description: reportDescription,
      })
      setReportFloodOpen(false)
      setReportDraft(null)
      setAlertBanner({
        title: 'Flood report received',
        body: `Report #${report.id} for ${reportDraft.barangay}, ${reportDraft.municipality} is pending LGU verification.`,
        isTest: false,
      })
    } catch (error) {
      setReportLocationStatus(`Report was not submitted: ${error.message}`)
    } finally {
      setReportSubmitting(false)
    }
  }

  const handleNotificationsToggle = async (enabled) => {
    if (!enabled) {
      setPushNotificationsEnabled(false)
      if (currentUser?.id) updateProfile({ push_notifications_enabled: false }).then(({ user }) => setCurrentUser(user)).catch(() => setNotificationStatus('Could not save notification preference. Try again.'))
      setNotificationStatus('Push notifications are off.')
      return
    }

    if (Capacitor.isNativePlatform()) {
      setPushNotificationsEnabled(true)
      try {
        const { user } = await updateProfile({ push_notifications_enabled: true })
        setCurrentUser(user)
        setNotificationStatus('Requesting Android notification permission…')
      } catch (error) {
        setPushNotificationsEnabled(false)
        setNotificationStatus(`Could not enable notifications: ${error.message}`)
      }
      return
    }

    setNotificationStatus('Starting notification test…')
    setAlertBanner({ title: 'Test notification', body: 'This is how flood alerts will appear in BANTALA.', isTest: true })
    if (!window.isSecureContext) {
      setNotificationStatus('Notifications require HTTPS or localhost. Open BANTALA using a secure address.')
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
      await showBahabaNotification('BANTALA alerts enabled', {
        body: 'This is a test notification. Keep BANTALA open to receive new LGU flood alerts.',
        tag: `bahaba-notification-test-${Date.now()}`,
      }, registration)
      setPushNotificationsEnabled(true)
      await updateProfile({ push_notifications_enabled: true }).then(({ user }) => setCurrentUser(user))
      const visible = await withNotificationTimeout(registration.getNotifications(), 'Reading active notifications')
      setNotificationStatus(visible.length > 0 ? 'Test sent. Keep BANTALA open to receive new flood alerts.' : 'Test sent. Check your notification center if no banner appeared.')
    } catch (error) {
      setPushNotificationsEnabled(false)
      setNotificationStatus(
        `Could not show the test notification: ${error.message || 'Unknown browser error'}. Check browser and device notification settings.`,
      )
    }
  }

  const handleFloodAlertsToggle = async (enabled) => {
    setFloodAlertsEnabled(enabled)
    if (!currentUser?.id) return
    try {
      const { user } = await updateProfile({ flood_notifications_enabled: enabled })
      setCurrentUser(user)
    } catch {
      setFloodAlertsEnabled(!enabled)
      setNotificationStatus('Could not save flood alert preference. Try again.')
    }
  }

  const renderScreen = () => {
    if (!sessionChecked || sessionError) return <div className="phone-screen splash-screen">
      <div className="splash-content" role="status">
        <h1>BANTALA</h1>
        <p>{sessionError || 'Restoring your session?'}</p>
        {sessionError && <button className="primary-button" type="button" onClick={() => { setSessionChecked(false); setSessionAttempt(attempt => attempt + 1) }}>Try again</button>}
      </div>
    </div>
    switch (screen) {
      case 'splash':
        return (
          <SplashPage
            onGetStarted={() => setScreen('signup')}
            onLogin={() => setScreen('login')}
            transitionEnabled={sessionChecked && !currentUser}
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
          onDeleteAccount={handleDeleteAccount}
        /></div>

      case 'map':
        return <Suspense fallback={<div className="phone-screen">Loading nationwide map…</div>}><NationwideMap currentPsgc={currentPsgc} currentLocation={currentLocation} locationSharingEnabled={locationSharingEnabled} preferred={currentUser?.preferred_locations || []}
          navigation={navigation} setScreen={setScreen} /></Suspense>

      case 'alerts':
        return (
          <AlertsPage
            currentUser={currentUser}
            selectedCity={selectedCity}
            availableLocations={availableLocationIds}
            selectedLocationId={selectedLocationId}
            onLocationChange={setActiveLocationId}
            reports={locationData.reports}
            nlpEvents={locationData.nlp_events}
            cityFloodSignals={locationData.flood_signals}
            announcements={locationData.announcements}
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
            availableLocations={availableLocationIds}
            selectedLocationId={selectedLocationId}
            onLocationChange={setActiveLocationId}
            reports={locationData.reports}
            nlpEvents={locationData.nlp_events}
            announcements={locationData.announcements}
            commandCenter={locationData.command_center}
            onRefresh={handleRefreshLocationData}
            refreshing={locationRefreshing}
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
            setFloodAlertsEnabled={handleFloodAlertsToggle}
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
    <div ref={appShellRef} className={`app-shell ${darkMode ? 'theme-dark' : ''}${loginTransitionActive && !loginTransitionRevealed ? ' login-transition-pending' : ''}`}>
      {renderScreen()}
      <RisingFloodTransition
        enabled={loginTransitionActive}
        onReveal={revealLoginTransition}
        onComplete={finishLoginTransition}
      />

      {currentUser && ['map', 'alerts', 'command', 'settings'].includes(screen) && (
        <button type="button" className="report-fab" aria-label="Report Flood" title="Report Flood" onClick={handleReportFlood}>
          <span aria-hidden="true">!</span>
        </button>
      )}

      <ReportFloodModal
        open={reportFloodOpen}
        draft={reportDraft}
        onClose={() => setReportFloodOpen(false)}
        onSubmit={handleReportConfirm}
        onRetry={() => handleReportFlood(true)}
        description={reportDescription}
        onDescriptionChange={setReportDescription}
        submitting={reportSubmitting}
        status={reportLocationStatus}
      />

      {alertBanner && notificationHost && createPortal(
        <aside className="in-app-alert" aria-label="BANTALA notification">
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
