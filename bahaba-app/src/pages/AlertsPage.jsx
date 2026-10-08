import { BrandMark, Icon } from '../components/Icon'

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

const isHigh = (item) => String(item?.severity).toLowerCase() === 'high'

const formatBarangay = (name) => {
  if (!name) return ''
  const text = String(name).trim()
  return /^(barangay|brgy\.?)\s/i.test(text) ? text : `Barangay ${text}`
}

export default function AlertsPage({
  currentUser,
  selectedCity,
  reports = [],
  nlpEvents = [],
  announcements = [],
  commandCenter,
  navigation,
  activeNav,
  setActiveNav,
  setScreen,
  onRefresh,
  refreshing = false,
}) {
  const cityLabel = selectedCity || 'your area'
  const floodItems = [...reports, ...nlpEvents]
  const highItems = floodItems.filter(isHigh)
  const hasHigh = highItems.length > 0
  const riskLevel = hasHigh ? 'high' : floodItems.length ? 'monitor' : 'none'

  let heroTitle
  let heroText
  if (hasHigh) {
    const first = highItems[0]
    const where = [formatBarangay(first.barangay), selectedCity].filter(Boolean).join(', ') || cityLabel
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
    heroTitle = <span>No active alerts</span>
    heroText = `No flood reports for ${cityLabel}.`
  }

  const contacts = [
    { label: 'Hotline', value: commandCenter?.hotline, tone: 'red', glyph: 'handset' },
    { label: 'Telephone', value: commandCenter?.telephone, tone: 'blue', glyph: 'telephone' },
    { label: 'Mobile', value: commandCenter?.mobile_number, tone: 'amber', glyph: 'mobile' },
  ]

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

      <header className="top-banner alert-banner">
        <div className="logo-inline al-brand">
          <BrandMark />
          <h1 className="al-hello">Good day, {currentUser ? currentUser.username : 'John'}</h1>
        </div>
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

        {/* Emergency contacts */}
        <section className="al-section" aria-labelledby="al-contacts-title">
          <div className="al-section-head">
            <h2 className="al-eyebrow" id="al-contacts-title">Emergency contacts</h2>
            {onRefresh && (
              <button type="button" className="al-refresh" onClick={onRefresh} disabled={refreshing}>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>

          {selectedCity && (
            <div className="al-chips">
              <span className="al-chip active">{selectedCity}</span>
            </div>
          )}
          <p className="al-hint">Based on your selected location/s</p>

          <ul className="al-contact-list">
            {contacts.map(({ label, value, tone, glyph }) => (
              <li className="al-contact" key={label}>
                <span className={`al-tile ${tone}`}><Glyph name={glyph} size={18} /></span>
                <div className="al-contact-info">
                  <strong>{label}</strong>
                  <small>{value || 'Not provided yet'}</small>
                </div>
                {value ? (
                  <a className="al-call" href={`tel:${String(value).replace(/[^\d+]/g, '')}`} aria-label={`Call ${label}: ${value}`}>
                    <Glyph name="handset" size={13} /> Call
                  </a>
                ) : (
                  <span className="badge muted">Not set</span>
                )}
              </li>
            ))}
          </ul>

          {commandCenter?.address && <p className="al-address">{commandCenter.address}</p>}
        </section>

        {/* Advisories + recent flood reports */}
        <section className="al-card" aria-label="Advisories">
          <div className="al-row">
            <span className={`al-tile ${announcements.length ? 'amber' : 'green'}`}><Icon name="alerts" size={18} /></span>
            <div className="al-contact-info">
              <strong>Current advisories</strong>
              <small>{announcements.length ? `${announcements.length} published` : 'Nothing issued'}</small>
            </div>
            <span className={`badge ${announcements.length ? 'warn' : 'ok'}`}>{announcements.length ? 'Active' : 'All clear'}</span>
          </div>
          {announcements.slice(0, 3).map((announcement) => (
            <div className="al-row al-row-text" key={announcement.id}><span>{announcement.title}</span></div>
          ))}
        </section>

        {floodItems.length > 0 && (
          <section className="al-card" aria-label="Flood reports">
            <h3 className="al-card-title">Flood reports</h3>
            {floodItems.slice(0, 5).map((item, index) => (
              <div className="al-row al-row-text" key={`${item.id || item.created_at}-${item.barangay || ''}-${index}`}>
                <span>{item.barangay ? `${item.barangay}, ` : ''}{selectedCity}</span>
                <span className={`risk-tag ${isHigh(item) ? 'red' : 'amber'}`}>{item.severity || 'Report'}</span>
              </div>
            ))}
          </section>
        )}

        {/* National emergency */}
        <section className="al-national" aria-label="National emergency">
          <span className="al-tile red solid"><Glyph name="handset" size={18} /></span>
          <div className="al-contact-info">
            <strong>National Emergency</strong>
            <small>All emergencies nationwide</small>
          </div>
          <a className="al-911" href="tel:911" aria-label="Call National Emergency 911">911</a>
        </section>
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