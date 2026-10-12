import { CurrentAdvisoriesCard, FloodReportsCard } from '../components/ReportCards'
import FloodLevelGuide from '../components/FloodLevelGuide'
import { BrandMark, Icon } from '../components/Icon'
import LocationScopeSelect from '../components/LocationScopeSelect'

/* ---------- small local glyphs (no dependency on the shared Icon set) ---------- */
function Glyph({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  switch (name) {
    case 'triangle':
      return (
        <svg {...common}>
          <path d="M12 3.2 2.6 19.6a1 1 0 0 0 .9 1.5h17a1 1 0 0 0 .9-1.5z" fill="currentColor" />
          <path d="M12 9.5v4.6" stroke="#fff" strokeWidth="2.2" />
          <circle cx="12" cy="17.3" r="1.1" fill="#fff" stroke="none" />
        </svg>
      )
    case 'handset':
      return (
        <svg {...common}>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
        </svg>
      )
    case 'telephone':
      return (
        <svg {...common}>
          <path d="M4 10c4.2-4 11.8-4 16 0l-1.8 3-3.2-1.6V9.9a9 9 0 0 0-6 0v1.5L5.8 13z" />
          <rect x="5" y="14.5" width="14" height="5.5" rx="2" />
        </svg>
      )
    case 'mobile':
      return (
        <svg {...common}>
          <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      )
    default:
      return null
  }
}

const severityRank = { low: 1, medium: 2, moderate: 2, high: 3 }
const severityOf = (item) => {
  const severity = String(item?.severity || '').toLowerCase()
  return severity === 'moderate' ? 'medium' : severity
}

const formatBarangay = (name) => {
  if (!name) return ''
  const text = String(name).trim()
  return /^(barangay|brgy\.?)\s/i.test(text) ? text : `Barangay ${text}`
}

export default function AlertsPage({
  selectedCity,
  availableLocations = [],
  selectedLocationId,
  onLocationChange,
  reports = [],
  nlpEvents = [],
  announcements = [],
  navigation,
  activeNav,
  setActiveNav,
  setScreen,
}) {
  const cityLabel = selectedCity || 'your selected location'
  const floodItems = [...reports, ...nlpEvents]
  const sortedItems = [...floodItems].sort((a, b) => (severityRank[severityOf(b)] || 0) - (severityRank[severityOf(a)] || 0))
  const highestSeverity = severityOf(sortedItems[0])
  const highItems = floodItems.filter(item => severityOf(item) === 'high')
  const hasHigh = highItems.length > 0
  const riskLevel = highestSeverity || 'none'
  const advice = {
    high: ['Move to higher ground or evacuate when local officials direct you.', 'Avoid walking or driving through floodwater; use only confirmed safe routes.', 'Keep your phone charged and contact emergency services if anyone is in immediate danger.'],
    medium: ['Prepare to evacuate: pack medicines, documents, water, and essentials.', 'Charge phones and power banks; conserve battery and electricity.', 'Move appliances and valuables above expected water level and check on people who may need help.'],
    low: ['Charge your phone and power bank, and save battery and electricity.', 'Prepare an evacuation bag with medicines, water, and important documents.', 'Monitor official updates and avoid flooded roads and waterways.'],
  }

  let heroTitle
  let heroText
  if (hasHigh) {
    const first = highItems[0]
    const where = [formatBarangay(first.barangay), first.city, first.province].filter(Boolean).join(', ') || cityLabel
    const extra = highItems.length - 1
    heroTitle = (
      <>
        <span className="al-hero-count">{highItems.length}</span>
        <span>High Alert{highItems.length > 1 ? 's' : ''}</span>
      </>
    )
    heroText = `${where} — flooding reported nearby${extra > 0 ? ` (+${extra} more)` : ''}`
  } else if (floodItems.length) {
    heroTitle = (
      <>
        <span className="al-hero-count">{floodItems.length}</span>
        <span>Flood Report{floodItems.length > 1 ? 's' : ''}</span>
      </>
    )
    heroText = `Conditions are being monitored in ${cityLabel}.`
  } else {
    heroTitle = <span>No reports available</span>
    heroText = 'No reports does not confirm absence of flooding. Some LGUs do not supply data.'
  }

  return (
    <div className="phone-screen alerts-screen">
      <div className="statusbar">
        <span>9:47</span>
        <div className="status-icons">
          <span className="signal"><i /><i /><i /><i /></span>
          <span className="wifi" />
          <span className="battery" />
        </div>
      </div>

      <header className="top-banner command-banner">
        <div className="logo-inline cc-brand">
          <BrandMark />
          <div className="cc-brand-text">
            <h1 className="cc-brand-title">Alerts</h1>
            <small>Flood &amp; Safety Updates</small>
          </div>
        </div>
        {selectedCity && <LocationScopeSelect locations={availableLocations} value={selectedLocationId} onChange={onLocationChange} label="Choose location for alerts" className="cc-location-scope" />}
      </header>

      <main className="al-body">
        {/* Flood-risk hero card */}
        <section className="al-hero" data-level={riskLevel} role="status" aria-live="polite">
          <span className="al-hero-ic">
            {riskLevel === 'none' ? <Icon name="alerts" size={26} /> : <Glyph name="triangle" size={30} />}
          </span>
          <div className="al-hero-copy">
            <strong className="al-hero-title">{heroTitle}</strong>
            <p>{heroText}</p>
          </div>
        </section>

        <section className={`al-safety-advice ${riskLevel}`} aria-live="polite">
          <div className="al-safety-head"><span className="al-safety-pulse" aria-hidden="true" /><div><strong>{highestSeverity ? `${highestSeverity === 'medium' ? 'Moderate' : highestSeverity[0].toUpperCase() + highestSeverity.slice(1)} flood readiness` : 'Flood readiness'}</strong><small>{floodItems.length ? `Based on ${floodItems.length} current report${floodItems.length === 1 ? '' : 's'} for ${cityLabel}.` : `No verified flood reports for ${cityLabel}; stay prepared.`}</small></div></div>
          <ul>{(advice[highestSeverity] || ['Keep your phone charged and prepare essential items.', 'Follow official local advisories and check on people who may need assistance.', 'No reports do not confirm that flooding is absent.']).map(item => <li key={item}>{item}</li>)}</ul>
        </section>

        {/* Advisories + recent flood reports */}
        <CurrentAdvisoriesCard selectedCity={selectedCity} announcements={announcements} />
        <FloodLevelGuide />

        <FloodReportsCard selectedCity={selectedCity} reports={reports} nlpEvents={nlpEvents} />

      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {navigation.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeNav === item.id ? 'nav-item active' : 'nav-item'}
            aria-current={activeNav === item.id ? 'page' : undefined}
            onClick={() => {
              setActiveNav(item.id)
              setScreen(item.id)
            }}
          >
            <span className="nav-icon"><Icon name={item.icon} size={20} /></span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}
