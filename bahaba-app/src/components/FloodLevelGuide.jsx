import { useState } from 'react'

const levels = [
  { key: 'low', title: 'Low flood', depth: '<1.64 ft', surface: 238, rain: 6, bubbles: 0, sky: ['#b9c9d6', '#dbe5ec'], water: '#4f9ccf' },
  { key: 'mid', title: 'Mid flood', depth: '1.64\u20133.28 ft', surface: 205, rain: 14, bubbles: 4, sky: ['#8ea3b3', '#b8c7d3'], water: '#3b86bd' },
  { key: 'high', title: 'High flood', depth: '3.28\u20136.56 ft', surface: 118, rain: 26, bubbles: 9, sky: ['#6a7f90', '#98aab8'], water: '#2d74a8' },
]

const humanLevels = levels.map((level, index) => ({
  ...level,
  title: ['Low', 'Moderate', 'High'][index],
  surface: [230, 180, 116][index],
}))

function Human() {
  return <g className="flg-human" fill="#172b38">
    <circle cx="200" cy="64" r="18" />
    <path d="M184 88Q200 82 216 88Q225 92 227 105L234 151Q235 158 228 160Q221 162 219 154L211 114V164L220 240Q221 251 211 252Q202 253 201 243L195 187L190 243Q189 253 179 252Q170 251 172 240L181 164V114L174 154Q172 162 165 160Q158 158 160 151L169 105Q171 92 184 88Z" />
    <path d="M183 99Q200 93 214 99L214 158H181Z" fill="#2d4554" />
  </g>
}

const captions = {
  sedan: ['Water at the tires. It still drives, slowly.', 'Water at the doors. It creeps along, hazards on.', 'Water over the roof. It is stuck underwater.'],
  jeepney: ['Water at the tires. The jeepney keeps its route.', 'Water at the windows. It crawls, hazards on.', 'Water over the roof. It is stuck underwater.'],
}

const buildings = [[8, 50, 110], [68, 40, 150], [118, 60, 90], [190, 45, 130], [245, 55, 100], [310, 40, 140], [352, 44, 96]]

function Vehicle({ type }) {
  const wheel = (cx) => <g key={cx} transform={`translate(${cx} 232)`}>
    <circle r="24" fill="#000" />
    <g className="flg-wheel"><circle r="20" fill="#262626" /><circle r="11" fill="#9aa5ad" />
      <path d="M-11 0H11M0-11V11M-7.8-7.8L7.8 7.8M7.8-7.8L-7.8 7.8" stroke="#6c7780" strokeWidth="2" /><circle r="3" fill="#6c7780" />
    </g>
  </g>
  return <g className="flg-drive">
    <g className="flg-vehicle-body">
      {type === 'sedan' ? <>
        <rect x="100" y="198" width="200" height="36" rx="12" fill="#000" />
        <path d="m138 200 22-34q2-3 7-3h73q5 0 8 3l24 34z" fill="#000" />
        <path d="m151 197 15-27h31v27zm54-27h33l19 27h-52z" fill="#b9c6cf" />
        <rect x="100" y="222" width="200" height="6" fill="#2a2a2a" />
        <path d="M201 172v57" stroke="#555" strokeWidth="2" />
        <rect x="180" y="205" width="14" height="3" rx="1.5" fill="#555" /><rect x="208" y="205" width="14" height="3" rx="1.5" fill="#555" />
        <rect className="flg-lamp" x="291" y="205" width="9" height="10" rx="3" fill="#ffe27a" /><rect className="flg-lamp" x="100" y="205" width="8" height="10" rx="3" fill="#ff5b4d" />
        {wheel(142)}{wheel(260)}
      </> : <>
        <rect x="78" y="172" width="222" height="62" rx="8" fill="#000" />
        <path d="m300 200 26 0q16 2 18 18v16h-44z" fill="#000" />
        <rect x="84" y="154" width="210" height="20" rx="6" fill="#0b0b0b" stroke="#555" strokeWidth="1.5" />
        <rect x="90" y="147" width="198" height="4" rx="2" fill="#111" />
        <path d="M100 151v4m80-4v4m90-4v4" stroke="#111" strokeWidth="3" />
        <path d="M294 176v25h24l-12-25z" fill="#b9c6cf" />
        {[92, 138, 184, 230].map(x => <rect key={x} x={x} y="180" width="38" height="24" rx="3" fill="#b9c6cf" />)}
        <rect x="78" y="211" width="266" height="6" fill="#444" /><rect x="78" y="220" width="266" height="3" fill="#666" />
        {Array.from({ length: 9 }, (_, i) => <circle key={i} cx={92 + i * 24} cy="228" r="3" fill={i % 2 ? '#fff' : '#888'} />)}
        <rect x="338" y="226" width="12" height="8" rx="3" fill="#333" /><rect x="70" y="226" width="10" height="8" rx="3" fill="#333" />
        <circle className="flg-lamp" cx="337" cy="206" r="5" fill="#ffe27a" /><rect className="flg-lamp" x="78" y="198" width="6" height="10" rx="2" fill="#ff5b4d" />
        {wheel(132)}{wheel(306)}
      </>}
    </g>
  </g>
}

function Scene({ level, index, type }) {
  const id = `flg-${type}-${index}`
  const note = type === 'human' ? ['Water around the ankles.', 'Water around the knees.', 'Water around the chest.'][index] : captions[type][index]
  return <figure className="flg-scene">
    <svg viewBox="0 0 400 300" role="img" aria-label={`${type} in ${level.title.toLowerCase()}, ${level.depth}. ${note}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={level.sky[0]} /><stop offset="1" stopColor={level.sky[1]} /></linearGradient>
        <clipPath id={`${id}-clip`}><rect width="400" height="300" /></clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="400" height="300" fill={`url(#${id})`} />
        {buildings.map(([x, width, height], i) => <rect key={i} x={x} y={252 - height} width={width} height={height} fill="rgba(55,75,90,.35)" />)}
        {Array.from({ length: level.rain }, (_, i) => {
          const x = (i * 97 + index * 43 + (type === 'jeepney' ? 23 : 0)) % 400
          return <line key={i} className="flg-drop" x1={x} y1="0" x2={x - 4} y2="13" style={{ animationDuration: `${0.7 + (i % 5) * 0.12}s`, animationDelay: `${-(i % 7) * 0.19}s` }} />
        })}
        <rect y="252" width="400" height="48" fill="#4a4f55" />
        <path d="M0 276H400" stroke="#d9d9d9" strokeWidth="3" strokeDasharray="26 22" opacity=".7" />
        <g className={`flg-tier flg-tier-${level.key}`}>{type === 'human' ? <Human /> : <Vehicle type={type} />}
          {type !== 'human' && level.key !== 'high' && <><ellipse className="flg-foam" cx={type === 'sedan' ? 308 : 358} cy={level.surface + 2} rx="14" ry="3.5" fill="#fff" /><ellipse className="flg-foam flg-foam-rear" cx={type === 'sedan' ? 92 : 82} cy={level.surface + 2} rx="12" ry="3" fill="#fff" /></>}
        </g>
        <g className={`flg-depth flg-depth-${level.key}`}>
          <g className="flg-swell">
            <g transform={`translate(0 ${level.surface})`}>
              <path className="flg-wave-back" d="M-100 0Q-50-5 0 0T100 0T200 0T300 0T400 0T500 0V420H-100Z" fill={level.water} fillOpacity=".55" />
              <path className="flg-wave-front" d="M0 6Q50 2 100 6T200 6T300 6T400 6V420H0Z" fill={level.water} fillOpacity=".62" />
            </g>
          </g>
          {Array.from({ length: level.bubbles }, (_, i) => <circle key={i} className="flg-bubble" cx={70 + ((i * 67 + index * 17) % 260)} cy={level.surface + 50 + ((i * 37) % 110)} r={2 + (i % 3)} />)}
        </g>
      </g>
    </svg>
    <figcaption><strong>{level.title}</strong><span className="flg-depth-label">{level.depth}</span><span>{note}</span></figcaption>
  </figure>
}

export default function FloodLevelGuide() {
  const [selected, setSelected] = useState('human')
  const options = [['human', 'Human'], ['jeepney', 'Jeepney'], ['sedan', 'Sedan']]
  return <section className="flg-card" aria-labelledby="flg-title">
    <header className="flg-guide-header">
      <div><h2 id="flg-title">Flood hazard reference</h2><p>Choose a simulator to view its flood levels.</p></div>
    </header>
    <div className="flg-simulator-tabs" role="group" aria-label="Choose what to simulate">{options.map(([key, title]) => <button key={key} type="button" className={selected === key ? 'selected' : ''} aria-pressed={selected === key} onClick={() => setSelected(key)}>{title}</button>)}</div>
    <section className="flg-selected-section" aria-label={`${options.find(([key]) => key === selected)?.[1]} flood levels`}>
      <h3>{options.find(([key]) => key === selected)?.[1]}</h3>
      <div className="flg-grid">{(selected === 'human' ? humanLevels : levels).map((level, index) => <Scene key={level.key} level={level} index={index} type={selected} />)}</div>
    </section>
  </section>
}
