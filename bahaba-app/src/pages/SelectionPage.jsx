export default function SelectionPage({
  title,
  subtitle,
  items,
  selectedValue,
  onBack,
  onSelect,
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
        {items.map((item) => (
          <button
            key={item}
            type="button"
            className={`option-row ${selectedValue === item ? 'selected' : ''}`}
            onClick={() => onSelect(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}
