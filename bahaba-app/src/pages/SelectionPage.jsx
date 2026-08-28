export default function SelectionPage({
  title,
  subtitle,
  items,
  selectedValue,
  onBack,
  onSelect,
  loading = false,
  gridMode = false,
}) {
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
        <div>{title}</div>
        <small>{subtitle}</small>
      </div>

      <button className="back-link" type="button" onClick={onBack}>← Back</button>

      <div className={`selection-list ${gridMode ? 'city-grid' : ''}`}>
        <div className="list-title">{gridMode ? 'Cities / Municipalities' : 'Luzon Regions'}</div>
        {loading && <div className="selection-loading">Loading locations...</div>}
        {!loading && items.map((item) => {
          const value = typeof item === 'string' ? item : item.name
          return (
          <button
            key={value}
            type="button"
            className={`option-row ${selectedValue === value ? 'selected' : ''}`}
            onClick={() => onSelect(item)}
          >
            {value}
          </button>
          )
        })}
        {!loading && items.length === 0 && <div className="selection-loading">No locations found for this region.</div>}
      </div>
    </div>
  )
}
