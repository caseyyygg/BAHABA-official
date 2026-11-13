const originalTime = value => {
  if (!value) return NaN;
  const text = String(value).trim().replace(' ', 'T');
  return Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(text) ? text : text + 'Z');
};
const normalize = value => String(value || '').normalize('NFKC').trim().toLowerCase();
const boundaryNames = feature => [...new Set(
  [feature.properties?.name, feature.properties?.sourceName]
    .filter(Boolean)
    .flatMap(name => [normalize(name), normalize(String(name).replace(/\s*\([^)]*\)/gu, ''))])
    .filter(Boolean),
)];
const philippineDayStart = now => {
  const manilaDate = new Date(now + 8 * 60 * 60 * 1000);
  return Date.UTC(manilaDate.getUTCFullYear(),manilaDate.getUTCMonth(),manilaDate.getUTCDate()) - 8 * 60 * 60 * 1000;
};
const mentions = (text, name) => {
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped && new RegExp('(?<![\\p{L}\\p{N}])' + escaped + '(?![\\p{L}\\p{N}])', 'u').test(normalize(text));
};

export function provisionalBarangaySignals(events, boundaries, now = Date.now()) {
  const groups = new Map(), seen = new Set(), dayStart = philippineDayStart(now);
  for (const event of events) {
    const published = originalTime(event.published_at);
    if (normalize(event.classification) !== 'flood' || !Number.isFinite(published) || published > now || published < dayStart) continue;
    const id = String(event.source_post_id || event.post_url || event.id || '');
    const identity = normalize(event.source) + ':' + id;
    if (!id || seen.has(identity)) continue;
    seen.add(identity);
    const matches = boundaries.filter(feature => {
      const names = boundaryNames(feature);
      return names.some(name => normalize(event.barangay).replace(/^(?:barangay|brgy\.?)\s+/u, '') === name || mentions(event.post_text, name));
    });
    // Identically named boundaries must not be assigned an invented location.
    for (const boundary of matches) {
      const names = boundaryNames(boundary);
      if (matches.some(other => String(other.id) !== String(boundary.id) && boundaryNames(other).some(name => names.includes(name)))) continue;
      const key = String(boundary.id);
      const pin = groups.get(key) || { event_id:null, location_key:'provisional:' + key, barangay_feature_id:key, label:boundary.properties.name, precision_level:'barangay', phase:'MONITORING', verification_status:'reported', latitude:null, longitude:null, post_count:0, latest_post_at:event.published_at, severity_counts:{} };
      pin.post_count++;
      if (published > originalTime(pin.latest_post_at)) pin.latest_post_at = event.published_at;
      const severity = normalizeReportSeverity(event.severity);
      const label = severity === 'unknown' ? 'Unspecified' : severity[0].toUpperCase() + severity.slice(1);
      pin.severity_counts[label] = (pin.severity_counts[label] || 0) + 1;
      groups.set(key,pin);
    }
  }
  return [...groups.values()].map(pin => {
    const counts = Object.entries(pin.severity_counts), max = Math.max(...counts.map(([,count]) => count));
    const leaders = counts.filter(([,count]) => count === max);
    return {...pin,expires_at_ms:dayStart+86400000,severity:leaders.length === 1 ? leaders[0][0] : 'Mixed'};
  });
}

export async function loadAdminFloodSignals(endpoint, scope, boundaries, fetcher = fetch, now = Date.now()) {
  let progress, progressError = '';
  try {
    const response = await fetcher(endpoint + '?' + new URLSearchParams({action:'nlp-progress',location:scope}), {credentials:'include',cache:'no-store'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    progress = await response.json();
    if (!Array.isArray(progress.pins)) throw Error('Invalid signal response');
  } catch (error) { progressError = error.message; }
  let feed;
  try {
    const response = await fetcher(endpoint + '?' + new URLSearchParams({action:'nlp-events',location:scope,limit:'100'}), {credentials:'include',cache:'no-store'});
    if (!response.ok) throw Error('HTTP ' + response.status);
    feed = await response.json();
    if (!Array.isArray(feed.events)) throw Error('Invalid classified-post response');
  } catch (error) {
    if (!progress) throw Error('NLP signal request ' + (progressError || 'failed') + '; classified-post request ' + error.message);
    return {...progress,signal_error:'Classified-post request ' + error.message};
  }
  const serverPins = Array.isArray(progress?.pins) ? progress.pins : [];
  const derivedPins = provisionalBarangaySignals(feed.events,boundaries,now);
  const pins = [...serverPins];
  for (const derived of derivedPins) {
    const existing = pins.find(pin => String(pin.barangay_feature_id) === String(derived.barangay_feature_id));
    if (!existing) pins.push(derived);
  }
  return {
    ...(progress || {cities:[],required_posts:null,window_minutes:1440}),
    pins,
    provisional_fallback:serverPins.length===0 && derivedPins.length>0,
    progress_error:progressError,
  };
}
import { normalizeReportSeverity } from './report-severity.mjs';
