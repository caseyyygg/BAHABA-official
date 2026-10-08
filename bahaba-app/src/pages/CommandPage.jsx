import { useState } from 'react'
import { BrandMark, Icon } from '../components/Icon'

/* ---------- local glyphs ---------- */
function Glyph({ name, size = 18 }) {
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
    case 'phone':
      return <svg {...common}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>
    case 'telephone':
      return (
        <svg {...common}>
          <path d="M4 10c4.2-4 11.8-4 16 0l-1.8 3-3.2-1.6V9.9a9 9 0 0 0-6 0v1.5L5.8 13z" />
          <rect x="5" y="14.5" width="14" height="5.5" rx="2" />
        </svg>
      )
    case 'mobile':
      return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></svg>
    case 'chat':
      return <svg {...common}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
    case 'mail':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
    case 'link':
      return <svg {...common}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
    case 'pin':
      return <svg {...common}><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
    case 'check':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></svg>
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.8h.01" /></svg>
    case 'bell':
      return <svg {...common}><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
    case 'waves':
      return (
        <svg {...common}>
          <path d="M3 7c2 0 2-1.5 4.5-1.5S10 7 12 7s2.5-1.5 4.5-1.5S19 7 21 7" />
          <path d="M3 12c2 0 2-1.5 4.5-1.5S10 12 12 12s2.5-1.5 4.5-1.5S19 12 21 12" />
          <path d="M3 17c2 0 2-1.5 4.5-1.5S10 17 12 17s2.5-1.5 4.5-1.5S19 17 21 17" />
        </svg>
      )
    case 'shelter':
      return <svg {...common}><path d="M3 11 12 3l9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>
    case 'chevron':
      return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>
    default:
      return null
  }
}

const digitsOnly = (value) => String(value).replace(/[^\d+]/g, '')

const externalLink = (value) => {
  const text = String(value).trim()
  if (/^https?:\/\//i.test(text)) return text
  if (/^(www\.|facebook\.com|fb\.com|m\.facebook\.com)/i.test(text)) return `https://${text}`
  return null
}

const formatReportedAt = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/* Expandable row with a real "View details" button */
function ExpandableRow({ id, className = '', header, children }) {
  const [open, setOpen] = useState(false)
  const panelId = `cc-details-${id}`

  return (
    <div className={`${className} ${open ? 'open' : ''}`.trim()}>
      {header}
      <div className="cc-row-foot">
        <button
          type="button"
          className="cc-details-btn"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? 'Hide details' : 'View details'}
          <Glyph name="chevron" size={14} />
        </button>
      </div>
      {open && <div className="cc-details" id={panelId}>{children}</div>}
    </div>
  )
}

export default function CommandPage({ selectedCity, reports = [], nlpEvents = [], announcements = [], commandCenter, evacuationCenters = [], navigation, activeNav, setActiveNav, setScreen }) {
  const locationReports = [...reports, ...nlpEvents]
  const hasHighReport = locationReports.some((report) => String(report.severity).toLowerCase() === 'high')

  const contactEntries = [
    { label: 'Hotline', value: commandCenter?.hotline, kind: 'phone', glyph: 'phone' },
    { label: 'Telephone', value: commandCenter?.telephone, kind: 'phone', glyph: 'telephone' },
    { label: 'Mobile', value: commandCenter?.mobile_number, kind: 'mobile', glyph: 'mobile' },
    { label: 'Email', value: commandCenter?.email, kind: 'email', glyph: 'mail' },
    { label: 'Facebook', value: commandCenter?.facebook_page, kind: 'link', glyph: 'link' },
  ].filter((entry) => entry.value)

  const hasCommandDetails = Boolean(
    contactEntries.length
    || commandCenter?.address
    || commandCenter?.emergency_contact
    || commandCenter?.other_information,
  )

  return (
    <div className="phone-screen command-screen">
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
            <h1 className="cc-brand-title">Command Center</h1>
            <small>LGU Operations Dashboard</small>
          </div>
        </div>
        {selectedCity && <span className="cc-live"><i aria-hidden="true" />{selectedCity}</span>}
      </header>

      <main className="cc-body">
        {/* Command center details */}
        <section className="cc-card" aria-label="Command center details">
          <div className="cc-card-head">
            <span className="cc-pill-ic blue"><Glyph name="telephone" /></span>
            <h2 className="cc-title">{commandCenter?.name || `${selectedCity || 'Local'} Command Center`}</h2>
            <span className={`cc-badge ${hasCommandDetails ? 'ok' : 'info'}`}>{hasCommandDetails ? 'On file' : 'Pending'}</span>
          </div>

          {commandCenter?.address && (
            <div className="cc-address">
              <span className="cc-pill-ic slate"><Glyph name="pin" /></span>
              <p>{commandCenter.address}</p>
            </div>
          )}

          {!hasCommandDetails && (
            <div className="cc-empty">
              <span className="cc-pill-ic blue"><Glyph name="info" /></span>
              <p>Command Center contact details have not been provided yet.</p>
            </div>
          )}

          {contactEntries.length > 0 && (
            <ul className="cc-contact-list">
              {contactEntries.map(({ label, value, kind, glyph }) => {
                const link = kind === 'link' ? externalLink(value) : null
                return (
                  <li className="cc-contact" key={label}>
                    <span className="cc-pill-ic slate"><Glyph name={glyph} /></span>
                    <div className="cc-contact-info">
                      <small>{label}</small>
                      <strong>{value}</strong>
                    </div>
                    <div className="cc-actions">
                      {(kind === 'phone' || kind === 'mobile') && (
                        <a className="cc-action call" href={`tel:${digitsOnly(value)}`} aria-label={`Call ${label}: ${value}`}>
                          <Glyph name="phone" size={17} />
                        </a>
                      )}
                      {kind === 'mobile' && (
                        <a className="cc-action msg" href={`sms:${digitsOnly(value)}`} aria-label={`Text ${label}: ${value}`}>
                          <Glyph name="chat" size={17} />
                        </a>
                      )}
                      {kind === 'email' && (
                        <a className="cc-action msg" href={`mailto:${value}`} aria-label={`Email ${value}`}>
                          <Glyph name="mail" size={17} />
                        </a>
                      )}
                      {link && (
                        <a className="cc-action msg" href={link} target="_blank" rel="noreferrer" aria-label={`Open ${label} page`}>
                          <Glyph name="link" size={17} />
                        </a>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {commandCenter?.emergency_contact && (
            <div className="cc-note"><span className="cc-pill-ic amber"><Glyph name="bell" /></span><p>{commandCenter.emergency_contact}</p></div>
          )}
          {commandCenter?.other_information && (
            <div className="cc-note"><span className="cc-pill-ic blue"><Glyph name="info" /></span><p>{commandCenter.other_information}</p></div>
          )}
        </section>

        {/* Flood reports */}
        <section className="cc-card" aria-label="Flood reports">
          <div className="cc-card-head">
            <span className="cc-pill-ic blue"><Glyph name="waves" /></span>
            <h2 className="cc-title">Flood reports · {locationReports.length}</h2>
            <span className={`cc-badge ${!locationReports.length ? 'ok' : hasHighReport ? 'danger' : 'warn'}`}>
              {!locationReports.length ? 'All clear' : hasHighReport ? 'High risk' : 'Monitoring'}
            </span>
          </div>

          <div className="cc-list">
            {locationReports.slice(0, 5).map((report, index) => {
              const isHigh = String(report.severity).toLowerCase() === 'high'
              const reportedAt = formatReportedAt(report.created_at)
              const rowKey = `${report.id || report.created_at}-${report.barangay || ''}-${index}`
              return (
                <ExpandableRow
                  key={rowKey}
                  id={`report-${index}`}
                  className="cc-row"
                  header={(
                    <div className="cc-row-head">
                      <div className="cc-row-main">
                        <strong>{report.barangay || selectedCity}</strong>
                        {report.barangay && selectedCity && <small>{selectedCity}</small>}
                      </div>
                      <span className={`risk-tag ${isHigh ? 'red' : 'amber'}`}>{report.severity || 'Report'}</span>
                    </div>
                  )}
                >
                  <dl>
                    <div><dt>Location</dt><dd>{[report.barangay, selectedCity].filter(Boolean).join(', ') || 'Not specified'}</dd></div>
                    <div><dt>Severity</dt><dd>{report.severity || 'Report'}</dd></div>
                    {reportedAt && <div><dt>Reported</dt><dd>{reportedAt}</dd></div>}
                    {typeof report.description === 'string' && report.description && <div><dt>Notes</dt><dd>{report.description}</dd></div>}
                  </dl>
                </ExpandableRow>
              )
            })}
            {!locationReports.length && (
              <div className="cc-empty ok">
                <span className="cc-pill-ic green"><Glyph name="check" /></span>
                <p>No current flood reports for {selectedCity}.</p>
              </div>
            )}
          </div>

          {announcements.length > 0 && (
            <div className="cc-note">
              <span className="cc-pill-ic blue"><Glyph name="bell" /></span>
              <p>{announcements.length} published local advisories.</p>
            </div>
          )}
        </section>

        {/* Evacuation centers */}
        <section className="cc-card evacuation-centers-panel" aria-label="Evacuation centers">
          <div className="cc-card-head">
            <span className="cc-pill-ic blue"><Glyph name="shelter" /></span>
            <h2 className="cc-title">Evacuation centers · {evacuationCenters.length}</h2>
            <span className={`cc-badge ${evacuationCenters.length ? 'ok' : 'info'}`}>{evacuationCenters.length ? 'LGU shared' : 'None yet'}</span>
          </div>
          <p className="cc-sub">Centers shared by your local LGU.</p>

          <div className="cc-list">
            {evacuationCenters.map((center) => {
              const capacity = Number(center.capacity) || 0
              const evacuees = Number(center.evacuees) || 0
              const occupancy = capacity > 0 ? Math.min(100, Math.round((evacuees / capacity) * 100)) : 0
              const occupancyTone = capacity <= 0 ? 'muted' : occupancy >= 90 ? 'danger' : occupancy >= 60 ? 'warn' : 'ok'
              return (
                <ExpandableRow
                  key={center.id}
                  id={`center-${center.id}`}
                  className="cc-row evacuation-center-row"
                  header={(
                    <>
                      <div className="cc-row-head">
                        <div className="cc-row-main">
                          <strong>{center.name}</strong>
                          <small>{center.barangay}{center.city ? `, ${center.city}` : ''}</small>
                        </div>
                        <span className={`cc-badge ${occupancyTone}`}>{capacity > 0 ? `${occupancy}% full` : 'No capacity set'}</span>
                      </div>
                      <div className="cc-capacity" role="img" aria-label={`${occupancy}% occupied`}>
                        <span style={{ width: `${occupancy}%` }} />
                      </div>
                    </>
                  )}
                >
                  <dl>
                    {center.address && <div><dt>Address</dt><dd>{center.address}</dd></div>}
                    <div><dt>Occupancy</dt><dd>{evacuees.toLocaleString()} / {capacity.toLocaleString()} spaces filled</dd></div>
                    {center.created_by && <div><dt>Shared by</dt><dd>{center.created_by}</dd></div>}
                  </dl>
                </ExpandableRow>
              )
            })}
            {!evacuationCenters.length && (
              <div className="cc-empty">
                <span className="cc-pill-ic blue"><Glyph name="info" /></span>
                <p>No evacuation centers have been shared for {selectedCity || 'your location'} yet.</p>
              </div>
            )}
          </div>
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