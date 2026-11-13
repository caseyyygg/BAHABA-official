import {readFileSync} from 'node:fs';

const marker = '/* BAHABA live feed:';
const helpers = readFileSync(new URL('admin-live-feed.js', import.meta.url), 'utf8');

export function patchLiveFeed(app, html){
  if(!app.includes(marker)){
    const originalTime = /function formatNlpTime\(value\)\{[\s\S]*?\n\}/;
    if(!originalTime.test(app)) throw new Error('Could not find live-feed timestamp formatter.');
    app = app.replace(originalTime, helpers.trimEnd());
    const filterEnd = '    return cityMatch && barangayMatch;\n  });';
    if(!app.includes(filterEnd)) throw new Error('Could not find local live-feed filters.');
    app = app.replace(filterEnd, filterEnd + "\n  const pageEvents = paginateNlpEvents(events, 'nlp', JSON.stringify([city, selectedBarangay]));");
    const localRows = 'eventHolder.innerHTML = events.map(event => {';
    if(!app.includes(localRows)) throw new Error('Could not find local live-feed row renderer.');
    app = app.replace(localRows, 'eventHolder.innerHTML = pageEvents.map(event => {');
    const allHolder = "  const holder = document.getElementById('all-nlp-events-list');\n  if(!holder) return;";
    if(!app.includes(allHolder)) throw new Error('Could not find platform live-feed row renderer.');
    app = app.replace(allHolder, allHolder + "\n  const pageEvents = paginateNlpEvents(ALL_NLP_EVENTS, 'all-nlp');");
    app = app.replace('holder.innerHTML = ALL_NLP_EVENTS.map(event => {', 'holder.innerHTML = pageEvents.map(event => {');
    app = app.replaceAll('${formatNlpTime(event.detected_at)}', '${renderNlpTimes(event)}');
    app = app.replace("timestamp: event.detected_at || event.received_at || '',", "timestamp: event.received_at || '',");
  }
  // Keep the year and Philippine timezone explicit; received_at drives 24-hour retention.
  html = html.replaceAll('<th>DETECTED</th>', '<th>COLLECTED / PUBLISHED (PHT)</th>');
  if(!html.includes('Posts remain here for 24 hours after collection')) html = html.replace('Social posts classified by BAHABA', 'Posts remain here for 24 hours after collection, with 10 posts per page. Social posts classified by BAHABA');
  html = html.replace('Live classifications from every city and barangay, including source post links when supplied.', 'Posts collected in the last 24 hours, with 10 posts per page. Includes every city and barangay and source post links when supplied.');
  return {app, html};
}
