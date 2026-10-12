import { BrandMark } from './Icon'

export default function SectionBrandBanner({ title, subtitle, scope, identityName, identityDetail, identityMeta = [] }) {
  return (
    <header className="top-banner command-banner section-brand-banner">
      <div className="logo-inline cc-brand">
        <BrandMark />
        <div className="cc-brand-text">
          <h1 className="cc-brand-title">{title}</h1>
          <small>{subtitle}</small>
          {identityName && <strong className="section-banner-user">{identityName}</strong>}
          {identityDetail && <span className="section-banner-detail">{identityDetail}</span>}
          {identityMeta.map((line) => <span className="section-banner-detail" key={line}>{line}</span>)}
        </div>
      </div>
      {scope && <span className="cc-live section-banner-scope"><i />{scope}</span>}
    </header>
  )
}
