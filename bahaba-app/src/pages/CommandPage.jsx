import { Glyph, ExpandableRow } from '../components/ReportCards'
import { BrandMark, Icon } from '../components/Icon'
import LocationScopeSelect from '../components/LocationScopeSelect'

/* ---------- local glyphs ---------- */
const digitsOnly = (value) => String(value).replace(/[^\d+]/g, '')

const externalLink = (value) => {
  const text = String(value).trim()
  if (/^https?:\/\//i.test(text)) return text
  if (/^(www\.|facebook\.com|fb\.com|m\.facebook\.com)/i.test(text)) return `https://${text}`
  return null
}

const googleMapsLink = (value) => {
  try {
    const url = new URL(String(value || ''))
    const host = url.hostname.toLowerCase()
    const isGoogleMaps = (host === 'google.com' || host.endsWith('.google.com') || /^google\.[a-z.]+$/.test(host)) && url.pathname.startsWith('/maps')
    const isShortMaps = host === 'maps.app.goo.gl' || host === 'goo.gl' && url.pathname.startsWith('/maps')
    return url.protocol === 'https:' && (isGoogleMaps || isShortMaps) ? url.href : null
  } catch { return null }
}

export default function CommandPage({ selectedCity, availableLocations = [], selectedLocationId, onLocationChange, commandCenter, evacuationCenters = [], navigation, activeNav, setActiveNav, setScreen, onRefresh, refreshing = false }) {

  const emergencyContacts = [
    { label: 'Hotline', value: commandCenter?.hotline, kind: 'phone', glyph: 'phone', tone: 'red' },
    { label: 'Telephone', value: commandCenter?.telephone, kind: 'phone', glyph: 'telephone', tone: 'blue' },
    { label: 'Mobile', value: commandCenter?.mobile_number, kind: 'mobile', glyph: 'mobile', tone: 'amber' },
  ]

  const contactEntries = [
    { label: 'Email', value: commandCenter?.email, kind: 'email', glyph: 'mail' },
    { label: 'Facebook', value: commandCenter?.facebook_page, kind: 'link', glyph: 'link' },
  ].filter((entry) => entry.value)

  const hasCommandDetails = Boolean(
    commandCenter?.name
    || contactEntries.length
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
        {selectedCity && <LocationScopeSelect locations={availableLocations} value={selectedLocationId} onChange={onLocationChange} label="Choose location for Command Center" className="cc-location-scope" />}
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
            <div className="cc-note"><span className="cc-pill-ic amber"><Glyph name="bell" /></span><div><strong>Emergency contact information</strong><p style={{ whiteSpace: 'pre-wrap' }}>{commandCenter.emergency_contact}</p></div></div>
          )}
          {commandCenter?.other_information && (
            <div className="cc-note"><span className="cc-pill-ic blue"><Glyph name="info" /></span><div><strong>Other information</strong><p style={{ whiteSpace: 'pre-wrap' }}>{commandCenter.other_information}</p></div></div>
          )}
        </section>

        <section className="cc-card" aria-label="Emergency contacts">
          <div className="cc-card-head">
            <span className="cc-pill-ic red"><Glyph name="phone" /></span>
            <h2 className="cc-title">Emergency contacts</h2>
            {onRefresh && <button type="button" className="cc-refresh" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>}
          </div>
          <ul className="cc-contact-list">
            {emergencyContacts.map(({ label, value, kind, glyph, tone }) => (
              <li className="cc-contact" key={label}>
                <span className={`cc-pill-ic ${tone}`}><Glyph name={glyph} /></span>
                <div className="cc-contact-info"><small>{label}</small><strong>{value || 'Not provided yet'}</strong></div>
                <div className="cc-actions">
                  {value ? <a className="cc-action call" href={`tel:${digitsOnly(value)}`} aria-label={`Call ${label}: ${value}`}><Glyph name="phone" size={17} /></a> : <span className="cc-badge info">Not set</span>}
                  {value && kind === 'mobile' && <a className="cc-action msg" href={`sms:${digitsOnly(value)}`} aria-label={`Text ${label}: ${value}`}><Glyph name="chat" size={17} /></a>}
                </div>
              </li>
            ))}
          </ul>
          {commandCenter?.address && <p className="cc-sub">{commandCenter.address}</p>}
        </section>

        <section className="al-national cc-national-emergency" aria-label="National emergency">
          <span className="al-tile red solid"><Glyph name="phone" size={18} /></span>
          <div className="al-contact-info">
            <strong>National Emergency</strong>
            <small>All emergencies nationwide</small>
          </div>
          <a className="al-911" href="tel:911" aria-label="Call National Emergency 911">911</a>
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
              const mapLink = googleMapsLink(center.map_link)
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
                      {mapLink && <a className="evacuation-map-link" href={mapLink} target="_blank" rel="noopener noreferrer">Open in Google Maps <span aria-hidden="true">↗</span></a>}
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
