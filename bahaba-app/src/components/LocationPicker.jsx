import { useState } from 'react'
import { Icon } from './Icon'
import { supportedLocations, searchLocations, locationById } from '../locations'
import registry from '../../psgc-registry.json'

export default function LocationPicker({ initial = [], onSave, onCancel, onLogout }) {
  const [selected, setSelected] = useState(initial)
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('')
  const [province, setProvince] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const regions = [...new Set(supportedLocations.map(l => l.region))].sort()
  const provinces = [...new Set(supportedLocations.filter(l => !region || l.region === region).map(l => l.province).filter(Boolean))].sort()
  const matches = searchLocations(query, { region, province })
  async function save() {
    setBusy(true); setError('')
    try { await onSave(selected) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="location-picker">
    <header className="preferences-header"><div><small>NOTIFICATION PREFERENCES</small><h2>Preferred locations</h2><p>Choose 1 to 3 cities or municipalities.</p></div><span className="preferences-header-icon"><Icon name="pin" size={26} /></span></header>
    <div className="preferences-body">
      <div className="preferences-explainer"><Icon name="alerts" size={19} /><p>Get flood and LGU updates for your selected places. Your current GPS location stays separate.</p></div>
      <div className="preferences-filters">
        <label>Region<select aria-label="Region" value={region} onChange={e => { setRegion(e.target.value); setProvince('') }}><option value="">All regions</option>{regions.map(r => <option key={r}>{r}</option>)}</select></label>
        <label>Province<select aria-label="Province" value={province} onChange={e => setProvince(e.target.value)}><option value="">All provinces / independent cities</option>{provinces.map(p => <option key={p}>{p}</option>)}</select></label>
      </div>
      <label className="preferences-search-label">Search city, municipality, province or region<span className="preferences-search"><Icon name="search" size={18} /><input value={query} placeholder="Find a city or municipality" onChange={e => setQuery(e.target.value)} /></span></label>
      <div className="preferences-section-title"><h3>Your locations</h3><span className={selected.length >= 1 && selected.length <= 3 ? 'selection-count complete' : 'selection-count'}>{selected.length} selected</span></div>
      <ul className="preferred-location-list">{selected.map(id => <li key={id}><Icon name="pin" size={18} /><span><strong>{locationById(id)?.name || id}</strong><small>{locationById(id)?.region}</small></span><button type="button" disabled={busy} onClick={() => setSelected(selected.filter(x => x !== id))}>Remove</button></li>)}</ul>
      {!selected.length && <p className="preferences-empty">No locations selected yet. Find and add your first location below.</p>}
      <div className="preferences-section-title"><h3>Add locations</h3><small>{matches.length} matches</small></div>
      <div className="location-results">{matches.slice(0, 60).map(l => <button type="button" key={l.id} disabled={busy || selected.includes(l.id) || selected.length >= 3} onClick={() => setSelected(current => current.length < 3 && !current.includes(l.id) ? [...current, l.id] : current)}><Icon name="pin" size={18} /><span><strong>{l.name}</strong><small>{l.region}</small></span><span className="location-add-mark" aria-hidden="true">{selected.includes(l.id) ? '✓' : '+'}</span></button>)}</div>
      {!matches.length && <p className="preferences-empty">No matching locations. Try another name or change your filters.</p>}
      {matches.length > 60 && <p className="preferences-result-hint">Showing the first 60 matches. Search or filter to find more.</p>}
      {registry.status !== 'official-workbook' && <p className="preferences-catalogue-note">Location catalogue is provisional and awaits refresh from the latest official PSA workbook.</p>}
    </div>
    <footer className="preferences-footer">
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="preferences-save-hint" aria-live="polite">{selected.length === 0 ? 'Choose at least 1 location to continue.' : selected.length > 3 ? 'Remove locations until you have at most 3.' : selected.length === 3 ? 'Maximum of 3 locations selected. Ready to save.' : 'Ready to save. You can select up to 3 locations.'}</p>
      <div className="preferences-actions">{onCancel && <button className="preferences-cancel" type="button" disabled={busy} onClick={onCancel}>Cancel</button>}<button className="primary-button" type="button" disabled={busy || selected.length < 1 || selected.length > 3} onClick={save}>{busy ? 'Saving…' : 'Save locations'}</button></div>
      {!onCancel && onLogout && <button className="preferences-signout" type="button" disabled={busy} onClick={onLogout}>Log out</button>}
    </footer>
  </section>
}
