import { useEffect, useMemo, useRef } from 'react'
import { locationById } from '../locations'

export default function LocationScopeSelect({ locations = [], value, onChange, className = '', label = 'Choose location' }) {
  const picker = useRef(null)
  const options = useMemo(() => [...new Set(locations)].map(id => locationById(id)).filter(Boolean), [locations])
  if (!options.length) return null
  const selected = options.find(location => location.id === value) || options[0]
  useEffect(() => {
    const closeOutside = event => { if (picker.current && !picker.current.contains(event.target)) picker.current.open = false }
    const closeEscape = event => { if (event.key === 'Escape' && picker.current?.open) picker.current.open = false }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeEscape) }
  }, [])

  return (
    <details ref={picker} className={`location-scope ${className}`}>
      <summary aria-label={label}>
      <i aria-hidden="true" />
        <span className="location-scope-value">{selected.name}</span>
        <span className="location-scope-chevron" aria-hidden="true" />
      </summary>
      <div className="location-scope-menu">
        <div className="location-scope-options" role="listbox" aria-label={label}>
          {options.map(location => <button type="button" role="option" aria-selected={location.id === selected.id} key={location.id} onClick={event => { onChange(location.id); event.currentTarget.closest('details').open = false }}>{location.name}</button>)}
        </div>
      </div>
    </details>
  )
}
