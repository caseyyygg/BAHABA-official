const scenes = [
  { level: 'low', title: 'Low', threshold: '<0.5 m', surface: 292, rain: 8, bubbles: 0, skyTop: '#b9c9d6', skyBottom: '#dbe5ec', water: '#4f9ccf', ground: '#6b5a48' },
  { level: 'moderate', title: 'Moderate', threshold: '0.5–1 m', surface: 214, rain: 16, bubbles: 4, skyTop: '#8ea3b3', skyBottom: '#b8c7d3', water: '#3b86bd', ground: '#5a4b3b' },
  { level: 'high', title: 'High', threshold: '1–2 m', surface: 158, rain: 22, bubbles: 6, skyTop: '#7b90a1', skyBottom: '#a7b8c5', water: '#347eb5', ground: '#514436' },
]

const manParts = (
  <g className="flg-walker">
    <g className="flg-bob flg-man">
      <g className="flg-arm-left"><rect x="106" y="168" width="14" height="70" rx="7" /></g>
      <g className="flg-arm-right"><rect x="180" y="168" width="14" height="70" rx="7" /></g>
      <g className="flg-leg-left"><rect x="128" y="236" width="20" height="84" rx="9" /></g>
      <g className="flg-leg-right"><rect x="152" y="236" width="20" height="84" rx="9" /></g>
      <rect x="120" y="162" width="60" height="86" rx="14" />
      <circle cx="150" cy="136" r="19" />
    </g>
  </g>
)

function Scene({ scene, index }) {
  const gradientId = `flg-sky-${index}`
  const clipId = `flg-clip-${index}`

  return (
    <figure className={`flg-scene flg-${scene.level}`}>
      <svg viewBox="0 0 300 360" role="img" aria-label={`${scene.title} flood level, ${scene.threshold}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={scene.skyTop} />
            <stop offset="1" stopColor={scene.skyBottom} />
          </linearGradient>
          <clipPath id={clipId}><rect width="300" height="360" /></clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect width="300" height="360" fill={`url(#${gradientId})`} />
          {Array.from({ length: scene.rain }, (_, rainIndex) => {
            const x = (rainIndex * 47 + index * 19) % 300
            return <line key={rainIndex} className="flg-rain" x1={x} y1="0" x2={x - 4} y2="14" style={{ animationDelay: `${-(rainIndex % 7) * 0.18}s`, animationDuration: `${0.7 + (rainIndex % 4) * 0.12}s` }} />
          })}
          <rect y="320" width="300" height="40" fill={scene.ground} />
          {manParts}
          <g className="flg-swell">
            <g transform={`translate(0 ${scene.surface})`}>
              <g className="flg-wave-back"><path d="M-100 0 Q-50 -5 0 0 T100 0 T200 0 T300 0 T400 0 T500 0 V420 H-100 Z" fill={scene.water} fillOpacity=".55" /></g>
              <g className="flg-wave-front"><path d="M0 6 Q50 2 100 6 T200 6 T300 6 T400 6 V420 H0 Z" fill={scene.water} fillOpacity=".72" /></g>
            </g>
          </g>
          {Array.from({ length: scene.bubbles }, (_, bubbleIndex) => (
            <circle key={bubbleIndex} className="flg-bubble" cx={62 + bubbleIndex * 29} cy={scene.surface + 70 + (bubbleIndex % 4) * 25} r={3 + (bubbleIndex % 3)} />
          ))}
        </g>
      </svg>
      <figcaption><strong>{scene.title}</strong><span>{scene.threshold}</span></figcaption>
    </figure>
  )
}

export default function FloodLevelGuide() {
  return (
    <section className="flg-card" aria-labelledby="flg-title">
      <div className="flg-heading">
        <div><h2 id="flg-title">Flood hazard thresholds</h2><p>Water depth by hazard tier.</p></div>
      </div>
      <div className="flg-grid">{scenes.map((scene, index) => <Scene key={scene.level} scene={scene} index={index} />)}</div>
    </section>
  )
}
