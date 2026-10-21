export function activeSignalFeatures(snapshot, now = Date.now()) {
  return { type: 'FeatureCollection', features: (snapshot?.pins || []).filter(pin =>
    Number(pin.expires_at_ms) > now && ['Point', 'Polygon', 'MultiPolygon'].includes(pin.geometry?.type)
  ).map(pin => ({type:'Feature',id:`${pin.event_id}:${pin.location_key}`,geometry:pin.geometry,properties:{...pin,geometry:undefined}})).concat(
    activeCitySignals(snapshot, now).filter(city => ['Polygon','MultiPolygon'].includes(city.geometry?.type)).map(city => ({
      type:'Feature',id:`city:${city.city_id}`,geometry:city.geometry,
      properties:{label:city.city_name,precision_level:'city',post_count:city.event_post_count,latest_post_at:city.last_post_at,severity:'Unconfirmed',verification_status:'reported'}
    }))
  ) }

}

export function activeCitySignals(snapshot, now = Date.now()) {
  return (snapshot?.cities || []).filter(city => city.phase === 'ACTIVE' &&
    Date.parse(String(city.last_post_at).replace(' ','T')+'Z') + 3600000 > now)
}
