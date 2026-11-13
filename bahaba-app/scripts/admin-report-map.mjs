import { containsPoint } from './report-point.mjs';
import { loadAdminFloodSignals, provisionalBarangaySignals } from './admin-flood-signals.mjs';
import { reportSeverityColor } from './report-severity.mjs?v=20261113-low-severity';
import { map as leafletMap, geoJSON, tileLayer, circleMarker } from './map-vendor/leaflet.mjs';

let map, baseTiles, mapIndexRegistry, detailRegistry, selected, currentLocation, areaLayer, selectedLayer, floodLayer, lifelineLayer;
let reportPoint = null, pointMarker = null, storedPointLayer = null;
let signalLayer = null, signalRequest = 0;
let lifelineRequest = 0;
const lifelineCache = new Map();

async function refreshFloodSignals() {
  if (!map || !currentLocation) return;
  const own = ++signalRequest, scope = currentLocation;
  try {
    const endpoint = ['localhost','127.0.0.1'].includes(location.hostname) ? '/api.php' : '/admin-api.php';
    const data = await loadAdminFloodSignals(endpoint, scope, currentFeatures);
    if (own!==signalRequest || scope!==currentLocation) return;
    const signalStatus=document.getElementById('lgu-map-signal-status');
    const socialPins=socialReportLocation===scope?provisionalBarangaySignals(socialReportEvents,currentFeatures):[];
    const pins=[...(Array.isArray(data.pins)?data.pins:[])];
    for (const socialPin of socialPins) {
      const alreadyShaded=pins.some(pin=>String(pin.barangay_feature_id)===String(socialPin.barangay_feature_id)&&pin.precision_level!=='landmark');
      if(!alreadyShaded)pins.push(socialPin);
    }
    const states=Array.isArray(data.cities)?data.cities:[];
    const active=states.some(city=>city.phase==='ACTIVE');
    const required=Number(data.required_posts)||20;
    const windowLabel='today (Philippine time)';
    const cityPosts=Number(states[0]?.post_count)||0;
    const flood24h=Number(data.flood_signals_24h)||0;
    const majoritySeverity=states[0]?.majority_severity||'Unspecified';
    const summary=`${cityPosts} reported flood case${cityPosts===1?'':'s'} in the last ${windowLabel}. Most common reported severity: ${majoritySeverity}. Each case represents one distinct social post. ${flood24h} flood classifications in 24 hours (a separate total).`;
    if(signalStatus){
      if(pins.length) signalStatus.textContent=summary+' '+(active?'Active flood locations: ':'Provisional reported locations: ')+pins.map(pin=>`${pin.label} (${Number(pin.post_count)||0} posts; majority severity ${pin.severity||'Unspecified'})`).join(', ')+`. ${active?'The citywide signal is active.':`${required} distinct posts in ${windowLabel} activate the citywide signal.`} Reports are not officially verified.`;
      else if(active) signalStatus.textContent=summary+' The citywide signal is active, but recent posts have not identified a supported barangay or verified landmark. Reports are not officially verified.';
      else signalStatus.textContent=summary+` ${required} distinct posts in ${windowLabel} activate the citywide signal. Posts naming a supported barangay appear provisionally on both maps; reports are not officially verified.`;
    }
    if (data.provisional_fallback && signalStatus) signalStatus.textContent = pins.length
      ? 'Provisional flooding reported in ' + pins.map(pin=>pin.label + ' (' + pin.post_count + ' posts)').join(', ') + '. Shaded from recent classified posts; citywide activation is not confirmed.'
      : 'No classified flood posts from today (Philippine time) could be matched to a barangay in this view.';
    if(data.signal_error&&signalStatus) signalStatus.textContent+=' Some classified posts could not be loaded: '+data.signal_error+'.';
    if(data.progress_error&&signalStatus) signalStatus.textContent+=' NLP progress summary unavailable: '+data.progress_error+'.';
    const features = pins.flatMap(pin => {
      const boundary = currentFeatures.find(feature => String(feature.id)===String(pin.barangay_feature_id));
      if (!boundary) return [];
      const hasExactPoint=pin.precision_level==='landmark' && pin.latitude!=null && pin.longitude!=null && Number.isFinite(Number(pin.latitude)) && Number.isFinite(Number(pin.longitude));
      let geometry = hasExactPoint ? {type:'Point',coordinates:[Number(pin.longitude),Number(pin.latitude)]} : boundary.geometry;
      return geometry ? [{type:'Feature',geometry,properties:pin}] : [];
    });

    if (scopeBoundary && (active || cityPosts>0)) {
      features.push({...scopeBoundary,properties:{label:currentLocation,precision_level:active?'city':'city-monitoring',post_count:cityPosts,severity:majoritySeverity,latest_post_at:states.map(city=>city.last_post_at).filter(Boolean).sort().at(-1)}});
    }
    if (!signalLayer) signalLayer = geoJSON(collection([]), {
      style: feature => {
        const color=reportSeverityColor(feature.properties.severity);
        return {color,weight:3,dashArray:feature.properties.precision_level==='city-monitoring'?'7 5':null,fill:feature.geometry.type!=='Point',fillColor:color,fillOpacity:feature.properties.precision_level==='city' ? 0.1 : feature.properties.precision_level==='city-monitoring' ? 0 : 0.28};
      },
      pointToLayer: (feature,latlng)=>{const color=reportSeverityColor(feature.properties.severity);return circleMarker(latlng,{pane:'reportSignalPoints',radius:10,color:'#fff',weight:3,dashArray:'4 3',fillColor:color,fillOpacity:1});},
      onEachFeature(feature,layer) {
        const node=document.createElement('div'), p=feature.properties;
        node.className='admin-nlp-signal-popup';
        const source=document.createElement('span');source.className='admin-nlp-signal-source';source.textContent='AUTOMATED NLP';
        const title=document.createElement('strong');title.textContent=p.label;
        const severity=document.createElement('span'),normalizedSeverity=String(p.severity||'unknown').toLowerCase();
        severity.className='admin-nlp-signal-severity admin-nlp-signal-severity--'+(['high','medium','low'].includes(normalizedSeverity)?normalizedSeverity:'unknown');
        severity.textContent=(p.severity||'Unspecified')+' severity';
        const detail=document.createElement('p');detail.textContent=`${p.post_count} associated post${Number(p.post_count)===1?'':'s'} · ${p.precision_level==='landmark'?'verified landmark':'barangay shade'}`;
        const latestPostDate=new Date(p.latest_post_at||'');
        const timestamp=document.createElement('small');timestamp.textContent=Number.isFinite(latestPostDate.getTime())?'Latest post '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(latestPostDate)+' PHT':'Latest post time unavailable';
        node.append(source,title,severity,detail,timestamp);
        layer.bindPopup(node);
      },
    }).addTo(map);
    signalLayer.clearLayers().addData(collection(features));
  } catch (error) {
    if (own===signalRequest) {
      signalLayer?.clearLayers();
      const signalStatus=document.getElementById('lgu-map-signal-status');
      if(signalStatus) signalStatus.textContent='NLP map locations could not be loaded: ' + error.message + '. Refresh the Reports page to retry.';
    }
  }
}
setInterval(()=>{ if(document.visibilityState==='visible'&&document.getElementById('lgu-report-map')?.offsetParent) refreshFloodSignals(); },10000);
window.addEventListener('focus',()=>{if(document.getElementById('lgu-report-map')?.offsetParent)refreshFloodSignals();});
let requestNumber = 0;
let currentFeatures = [];
let currentBarangays = [];
let currentReports = [];
let socialReportEvents = [], socialReportLocation = '';
let scopeBoundary = null, scopeLayer = null;
let canHideReports=false, canDeleteReports=false;
const form = document.getElementById('lgu-map-report-form');
const select = document.getElementById('lgu-map-barangay');
const message = document.getElementById('lgu-map-report-message');
const signalStatus = document.createElement('p');
signalStatus.id = 'lgu-map-signal-status';
signalStatus.className = 'lgu-map-signal-status';
signalStatus.setAttribute('role','status');
signalStatus.setAttribute('aria-live','polite');
signalStatus.textContent = 'Loading active NLP flood locations...';
form.prepend(signalStatus);
const collection = (features) => ({ type: 'FeatureCollection', features });
const severityRank = { low: 1, medium: 2, high: 3 };
const colors = { low: reportSeverityColor('low'), medium: reportSeverityColor('medium'), high: reportSeverityColor('high') };
const severitySelect = document.getElementById('lgu-map-severity');
function syncDraftSeverity() {
  const color = colors[severitySelect.value] || colors.medium;
  pointMarker?.setStyle({fillColor:color});
  severitySelect.style.setProperty('--severity-color',color);
}
severitySelect.addEventListener('change',syncDraftSeverity);
syncDraftSeverity();
const reportStyles = document.createElement('style');
reportStyles.textContent = `
.lgu-report-map-panel { font-family:Inter,system-ui,sans-serif; }
.lgu-report-map-panel .panel-head { padding:20px 24px; }
.lgu-report-map-panel h3 { font-family:inherit; font-size:15px; font-weight:650; }
.lgu-report-map-panel .view-sub { font-size:12px; line-height:1.7; margin-top:5px; }
.lgu-report-map-layout { padding:24px; gap:24px; align-items:start; }
#lgu-report-map { min-height:480px; border:1px solid var(--line); }
#lgu-map-report-form { min-width:0; gap:8px; }
#lgu-map-report-form label { margin-top:10px; font-size:12px; font-weight:600; color:var(--ink-soft); }
#lgu-map-report-form label:first-child { margin-top:0; }
#lgu-map-report-form input, #lgu-map-report-form select, #lgu-map-report-form textarea { width:100%; min-width:0; padding:12px; border:1px solid var(--line); border-radius:10px; background:var(--mist-50); color:var(--ink); font:400 13px/1.5 Inter,system-ui,sans-serif; }
#lgu-map-report-form input::placeholder, #lgu-map-report-form textarea::placeholder { color:var(--ink-faint); }
#lgu-map-report-form input:focus-visible, #lgu-map-report-form select:focus-visible, #lgu-map-report-form textarea:focus-visible { outline:2px solid var(--blue-100); outline-offset:2px; border-color:var(--blue-500); }
#lgu-map-report-form #lgu-map-severity { border-left:4px solid var(--severity-color); }
.lgu-lifeline-toggle { position:absolute; z-index:1000; top:10px; left:52px; max-width:calc(100% - 64px); padding:8px 10px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#172b4d; box-shadow:0 1px 5px #0f172a33; font:500 11px/1.4 Inter,system-ui,sans-serif; }
.lgu-lifeline-toggle label { display:flex; align-items:center; gap:7px; cursor:pointer; }
.lgu-lifeline-toggle label + label { margin-top:6px; align-items:flex-start; }
.lgu-lifeline-toggle input { width:auto !important; margin:0; }
.lgu-lifeline-toggle label + label span { line-height:1.35; }
.lgu-lifeline-status { display:block; margin-top:3px; color:#475569; font-size:10px; }
.lgu-lifeline-legend { display:block; max-width:320px; margin-top:3px; color:#64748b; font-size:9px; line-height:1.35; }
#lgu-report-point-detail { padding:10px 12px; border-radius:10px; background:var(--blue-100); color:var(--ink-soft); overflow-wrap:anywhere; }
#lgu-map-report-form button { margin-top:8px; min-height:42px; font-size:13px; border-radius:10px; }
.report-draft-queue { grid-column:1/-1; min-width:0; padding:18px; border:1px solid var(--line); border-radius:12px; background:var(--mist-50); }
.report-draft-queue[hidden] { display:none; }
.report-draft-queue > p { font-size:12px; font-weight:600; color:var(--ink-soft); margin-bottom:12px; }
.report-draft-queue-row { display:flex; align-items:center; gap:16px; padding:12px 14px; border:1px solid var(--line); border-left:3px solid var(--severity-color); border-radius:10px; background:#fff; }
.report-draft-queue-row + .report-draft-queue-row { margin-top:10px; }
.report-draft-queue-row span { flex:1; min-width:0; overflow-wrap:anywhere; white-space:pre-wrap; font-size:13px; line-height:1.6; }
.report-draft-queue-row button { flex-shrink:0; font-size:12px; border-radius:8px; }
.lgu-map-report-message { padding:0 24px 20px; font-size:12px; line-height:1.6; }
.lgu-map-report-message:empty { display:none; }
.lgu-map-signal-status { padding:10px 12px; margin:0 0 4px; border-radius:10px; background:#eff6ff; color:#1e40af; font-size:12px; line-height:1.5; }
@media(max-width:850px) { #lgu-report-map { min-height:320px; } .lgu-report-map-layout { padding:18px; gap:18px; } }
`;
document.head.append(reportStyles);

function syncLayers() {
  if (!map) return;
  // Static borders stay mounted while live reports refresh.
  selectedLayer.clearLayers().addData(collection(selected?.geometry ? [selected] : []));
  const affected = currentFeatures.flatMap((feature) => {
    const matches = currentReports.filter((report) => report.latitude == null && !report.map_hidden && !['rejected','resolved','cancelled'].includes(report.status) &&
      (report.barangay_feature_id ? String(report.barangay_feature_id) === String(feature.id) :
        report.barangay === feature.properties.name && currentFeatures.filter((item) => item.properties.name === report.barangay).length === 1));
    if (!matches.length) return [];
    const severity = matches.reduce((value, report) => severityRank[report.severity] > severityRank[value] ? report.severity : value, 'low');
    return [{ ...feature, properties: { ...feature.properties, severity, reports:matches } }];
  });
  floodLayer.clearLayers().addData(collection(affected));
  storedPointLayer?.clearLayers().addData(collection(currentReports.filter(report => report.latitude != null && report.longitude != null && !report.map_hidden && !['rejected','resolved','cancelled'].includes(report.status)).map(report => ({type:'Feature',geometry:{type:'Point',coordinates:[Number(report.longitude),Number(report.latitude)]},properties:{id:report.id,barangay:report.barangay,severity:report.severity,description:report.desc || report.description,reporter:report.reporter,created_at:report.created_at}}))));
}

function fitFeatures(features, maxZoom = 16) {
  if (!map || !features.length) return;
  const bounds = geoJSON(collection(features)).getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [35,35], maxZoom, animate: false });
}

function clearReportPoint() {
  reportPoint = null;
  if(pointMarker) { pointMarker.remove(); pointMarker = null; }
  document.getElementById('lgu-report-point-detail').textContent = 'Click a specific street on the map to add an exact report pin.';
}
function choosePoint(latlng) {
  if (scopeBoundary && !containsPoint(scopeBoundary.geometry,latlng.lng,latlng.lat)) {
    clearReportPoint();
    message.textContent = 'That point is outside your assigned city or province boundary.';
    return;
  }
  const containingFeature = currentFeatures.find(item => containsPoint(item.geometry,latlng.lng,latlng.lat));
  if (!scopeBoundary && !containingFeature) {
    clearReportPoint();
    message.textContent = 'Exact map pins are not available for this location yet. Select its barangay and add the street or landmark by name.';
    return;
  }
  const feature = containingFeature || selected;
  if(!feature) {
    clearReportPoint();
    message.textContent = 'This point is inside your LGU boundary, but its barangay could not be identified. Select the correct barangay, then click this street again.';
    return;
  }
  chooseBarangay(feature.id,false);
  reportPoint = {latitude:latlng.lat, longitude:latlng.lng};
  if(pointMarker) pointMarker.remove();
  pointMarker = circleMarker(latlng,{radius:8,color:'#ffffff',weight:3,fillColor:colors[severitySelect.value] || colors.medium,fillOpacity:1,interactive:false}).addTo(map);
  document.getElementById('lgu-report-point-detail').textContent = 'Report pin: '+latlng.lat.toFixed(6)+', '+latlng.lng.toFixed(6)+' in '+feature.properties.name;
  message.textContent = containingFeature ? '' : 'Pin is inside your LGU boundary. Confirm that the manually selected barangay is correct; this point has no matching barangay polygon.';
}
const pointDetail = document.createElement('p'); pointDetail.id = 'lgu-report-point-detail'; pointDetail.className = 'view-sub'; pointDetail.setAttribute('aria-live','polite');
const selectControl = select.closest('.admin-search-select-wrap') || select;
selectControl.after(pointDetail);
const streetLabel = document.createElement('label'); streetLabel.textContent = 'Street or landmark (optional)'; streetLabel.htmlFor = 'lgu-map-street';
const streetInput = document.createElement('input'); streetInput.id = 'lgu-map-street'; streetInput.maxLength = 150; streetInput.placeholder = 'Name of the street or nearby landmark';
pointDetail.after(streetLabel,streetInput);
clearReportPoint();
function chooseBarangay(id, zoom = true) {
  if(String(selected?.id || '') !== String(id || '')) clearReportPoint();
  selected = currentBarangays.find((feature) => String(feature.id) === String(id)) || null;
  select.value = selected ? String(selected.id) : '';
  window.refreshAdminSearchSelects?.();
  syncLayers();
  if (selected?.geometry && zoom) fitFeatures([selected]);
}

function createMap() {
  const container = document.getElementById('lgu-report-map');
  map = leafletMap(container, { preferCanvas: false, scrollWheelZoom: true }).setView([12.5,122],5);
  map.attributionControl.setPrefix(false);
  map.on('click', (event) => choosePoint(event.latlng));
  for (const [name, order] of [['reportAreas',410],['reportFloods',420],['reportSelection',430],['reportScope',440]]) {
    map.createPane(name).style.zIndex = order;
    map.getPane(name).style.pointerEvents = 'none';
  }
  map.createPane('reportSignalPoints').style.zIndex = 470;
  map.createPane('reportLifelines').style.zIndex=460;
  lifelineLayer=geoJSON(collection([]),{
    pane:'reportLifelines',
    pointToLayer(feature,latlng){const colors={health:'#dc2626',education:'#2563eb',worship:'#7c3aed',bridge:'#475569',transit:'#0891b2',public_safety:'#ea580c',government:'#15803d',utility:'#a16207'};const color=colors[feature.properties.category]||'#475569';return circleMarker(latlng,{radius:6,color:'#fff',weight:2,fillColor:color,fillOpacity:.95,bubblingMouseEvents:false});},
    onEachFeature(feature,layer){const popup=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p'),source=document.createElement('small');title.textContent=feature.properties.name;detail.textContent=feature.properties.label;source.textContent='OpenStreetMap contributor data';popup.append(title,detail,source);layer.bindPopup(popup);},
  }).addTo(map);
  const lifelineControl=document.createElement('div');lifelineControl.className='lgu-lifeline-toggle';
  const lifelineLabel=document.createElement('label'),lifelineCheckbox=document.createElement('input');lifelineCheckbox.type='checkbox';lifelineCheckbox.checked=true;
  const lifelineTitle=document.createElement('span');lifelineTitle.textContent='Nearby lifelines';lifelineLabel.append(lifelineCheckbox,lifelineTitle);
  const lifelineStatus=document.createElement('span');lifelineStatus.className='lgu-lifeline-status';lifelineStatus.textContent='Churches, bridges, health, schools, transit, services';
  const lifelineLegend=document.createElement('span');lifelineLegend.className='lgu-lifeline-legend';lifelineLegend.textContent='Purple worship · gray bridges · red health · blue schools · teal transit · orange safety · green government · brown utilities';
  const signalLegend=document.createElement('div');signalLegend.className='lgu-signal-legend';
  const signalLegendTitle=document.createElement('strong');signalLegendTitle.textContent='Automated NLP flood severity';
  const signalSeverityItems=document.createElement('div');signalSeverityItems.className='lgu-signal-legend-items';
  for(const [severity,label] of [['high','High'],['medium','Medium'],['low','Low']]){
    const item=document.createElement('span'),dot=document.createElement('i');item.className='lgu-signal-legend-item';dot.style.backgroundColor=reportSeverityColor(severity);item.append(dot,document.createTextNode(label));signalSeverityItems.append(item);
  }
  const signalLegendNote=document.createElement('small');signalLegendNote.textContent='Barangay shading follows the NLP severity summary; exact matched landmarks use markers.';
  signalLegend.append(signalLegendTitle,signalSeverityItems,signalLegendNote);
  if(!document.getElementById('admin-nlp-map-styles')){
    const style=document.createElement('style');style.id='admin-nlp-map-styles';style.textContent=`
    .lgu-signal-legend{display:grid;gap:6px;margin-top:8px;padding:9px 10px;border:1px solid #d5e0eb;border-radius:10px;background:#f7faff;color:#24415d;font-size:11px}
    .lgu-signal-legend-items{display:flex;flex-wrap:wrap;gap:10px}
    .lgu-signal-legend-item{display:inline-flex;align-items:center;gap:5px;font-weight:700}
    .lgu-signal-legend-item i{width:9px;height:9px;border-radius:50%}
    .lgu-signal-legend small{color:#5d7186;line-height:1.4}
    .admin-nlp-signal-popup{display:grid;gap:6px;min-width:170px;color:#18324b;font-size:12px}
    .admin-nlp-signal-source{justify-self:start;padding:3px 7px;border-radius:999px;background:#eaf6ee;color:#17653c;font-size:9px;font-weight:800;letter-spacing:.04em}
    .admin-nlp-signal-severity{justify-self:start;padding:4px 8px;border-radius:999px;font-weight:800;text-transform:capitalize}
    .admin-nlp-signal-severity--high{background:#fee2e2;color:#b91c1c}
    .admin-nlp-signal-severity--medium{background:#ffedd5;color:#c2410c}
    .admin-nlp-signal-severity--low{background:#fff2d5;color:#925b08}
    .admin-nlp-signal-severity--unknown{background:#eef2f7;color:#526174}
    .admin-nlp-signal-popup p{margin:0;line-height:1.4}
    .admin-nlp-signal-popup small{color:#5d7186}
    `;document.head.append(style);
  }
  lifelineControl.append(lifelineLabel,lifelineStatus,lifelineLegend,signalLegend);container.append(lifelineControl);
  for(const eventName of ['click','mousedown','dblclick','touchstart'])lifelineControl.addEventListener(eventName,event=>event.stopPropagation());
  lifelineCheckbox.addEventListener('change',()=>{if(lifelineCheckbox.checked)loadLifelines(lifelineStatus);else{lifelineRequest++;lifelineLayer.clearLayers();lifelineStatus.textContent='Lifeline layer hidden';}});
  map.lifelineToggle=lifelineCheckbox;map.lifelineStatus=lifelineStatus;
  areaLayer = geoJSON(collection([]), {
    pane: 'reportAreas', interactive:false, style: { color: '#6995b8', weight: 1, fillColor: '#2478dd', fillOpacity: .07 },
    onEachFeature(feature, layer) {
      const label = document.createElement('span');
      label.textContent = feature.properties.name;
      layer.bindTooltip(label);

    },
  }).addTo(map);
  scopeLayer = geoJSON(collection([]), {pane:'reportScope',interactive:false,style:{color:'#173e77',weight:3,fill:false,dashArray:'8 5'}}).addTo(map);
  floodLayer = geoJSON(collection([]), { pane:'reportFloods',
    style: feature => ({ color:reportSeverityColor(feature.properties.severity), weight:2, fillOpacity:.35 }),
    onEachFeature(feature,layer){
      const popup=document.createElement('div'),title=document.createElement('strong'),list=document.createElement('ul');
      title.textContent='LGU flood reports — '+feature.properties.name;
      for(const report of feature.properties.reports||[]){
        const item=document.createElement('li'),time=String(report.created_at||'');
        const parsed=Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(time)?time:time.replace(' ','T')+'Z');
        const submitted=Number.isFinite(parsed)?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(parsed):'time not recorded';
        item.textContent=`#${report.id} · ${report.reporter||'Reporter not recorded'} · ${report.severity||'Unspecified'} · ${submitted}: ${report.description||''}`;
        list.append(item);
      }
      popup.append(title,list);layer.bindPopup(popup);
    },
  }).addTo(map);
  selectedLayer = geoJSON(collection([]), { pane:'reportSelection', interactive:false,
    style:{ color:'#145cbe', weight:4, fillColor:'#2382ed', fillOpacity:.2 },
  }).addTo(map);

  map.createPane('reportPins').style.zIndex=450;
  storedPointLayer = geoJSON(collection([]), {
    pointToLayer:(feature,latlng) => circleMarker(latlng,{pane:'reportPins',radius:8,color:'#ffffff',weight:2,fillColor:reportSeverityColor(feature.properties.severity),fillOpacity:1,interactive:true,bubblingMouseEvents:false}),
    onEachFeature(feature,layer){
      const popup=document.createElement('div');popup.className='report-pin-popup';
      const title=document.createElement('strong');title.textContent='Report #'+feature.properties.id+' · '+feature.properties.barangay;
      const description=document.createElement('p');description.textContent=feature.properties.severity+' · '+(feature.properties.description||'');popup.append(title,description);
      const reporter=document.createElement('p');reporter.textContent='Reported by '+(feature.properties.reporter||'Reporter not recorded');popup.append(reporter);
      if(feature.properties.created_at){const submitted=document.createElement('time'),date=String(feature.properties.created_at);submitted.dateTime=date;const parsed=Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(date)?date:date.replace(' ','T')+'Z');submitted.textContent='Submitted '+(Number.isFinite(parsed)?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(parsed):date)+' PHT';popup.append(submitted)}
      for(const [action,label,allowed] of [['hide','Hide from map',canHideReports],['delete','Delete report',canDeleteReports]]){
        if(!allowed)continue;const button=document.createElement('button');button.type='button';button.className='btn btn-outline btn-sm';button.textContent=label;
        button.addEventListener('click',event=>{event.stopPropagation();map.closePopup();window.manageReport(Number(feature.properties.id),action);});popup.append(button);
      }
      layer.bindPopup(popup);layer.on('click',()=>{});
    }
  }).addTo(map);
  const loading = document.createElement('div');
  loading.className = 'lgu-map-loading is-warning';
  loading.setAttribute('role','status');
  loading.textContent = 'Loading map details…';
  container.append(loading);
  const ready = () => { loading.hidden = true; };
  const retry = () => {
    loading.hidden = false;
    loading.replaceChildren(document.createTextNode('Map tiles are unavailable. Barangay selection still works.'));
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn-outline btn-sm'; button.textContent = 'Retry map';
    button.addEventListener('click', () => { loading.textContent = 'Loading map details…'; baseTiles.redraw(); });
    loading.append(button);
  };
  baseTiles = tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  });
  baseTiles.on('tileload',ready).on('tileerror',retry).addTo(map);
  setTimeout(() => { if (!loading.hidden) retry(); }, 5000);
  new ResizeObserver(() => map.invalidateSize({pan:false})).observe(container);
  syncLayers();
}

function geometryBounds(geometry){
  let south=90,west=180,north=-90,east=-180;
  const visit=value=>{if(Array.isArray(value)&&typeof value[0]==='number'&&typeof value[1]==='number'){west=Math.min(west,value[0]);east=Math.max(east,value[0]);south=Math.min(south,value[1]);north=Math.max(north,value[1]);}else if(Array.isArray(value))value.forEach(visit);};
  visit(geometry?.coordinates);
  return south<=north&&west<=east?{south,west,north,east}:null;
}
function lifelineCategory(tags){
  if(tags.amenity==='place_of_worship')return 'worship';
  if(['hospital','clinic','doctors','health_centre'].includes(tags.amenity)||['hospital','clinic','doctor','centre'].includes(tags.healthcare))return 'health';
  if(['school','college','university','kindergarten'].includes(tags.amenity))return 'education';
  if(tags.bridge==='yes'||tags.man_made==='bridge')return 'bridge';
  if(['bus_station','ferry_terminal','bus_stop'].includes(tags.amenity)||tags.highway==='bus_stop'||['station','halt'].includes(tags.railway)||tags.public_transport==='station'||tags.aeroway==='terminal')return 'transit';
  if(['fire_station','police'].includes(tags.amenity))return 'public_safety';
  if(tags.office==='government'||tags.amenity==='townhall')return 'government';
  if(['substation','plant','generator'].includes(tags.power)||['water_works','pumping_station'].includes(tags.man_made))return 'utility';
  return null;
}
async function loadLifelines(statusNode){
  if(!lifelineLayer)return;
  if(!scopeBoundary){statusNode.textContent='Lifeline places unavailable for this map boundary';return;}
  const own=++lifelineRequest,scope=currentLocation;
  const cached=lifelineCache.get(scope);
  if(cached){lifelineLayer.clearLayers().addData(collection(cached));statusNode.textContent=`${cached.length} nearby features · OpenStreetMap`;return;}
  try{const saved=JSON.parse(localStorage.getItem(`bahaba-lifelines-v1-${scope}`)||'null');if(saved?.expires>Date.now()&&Array.isArray(saved.features)){lifelineCache.set(scope,saved.features);lifelineLayer.clearLayers().addData(collection(saved.features));statusNode.textContent=`${saved.features.length} nearby features · OpenStreetMap`;return;}}catch{}
  const bounds=geometryBounds(scopeBoundary.geometry);
  if(!bounds){statusNode.textContent='LGU boundary unavailable for nearby places';return;}
  statusNode.textContent='Loading nearby places from OpenStreetMap…';
  const bbox=`${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query=`[out:json][timeout:20];(nwr["amenity"~"^(place_of_worship|hospital|clinic|doctors|health_centre|school|college|university|kindergarten|bus_station|ferry_terminal|bus_stop|fire_station|police|townhall)$"](${bbox});nwr["healthcare"~"^(hospital|clinic|doctor|centre)$"](${bbox});nwr["office"="government"](${bbox});nwr["bridge"="yes"](${bbox});way["man_made"="bridge"](${bbox});nwr["railway"~"^(station|halt)$"](${bbox});nwr["public_transport"="station"](${bbox});nwr["aeroway"="terminal"](${bbox});nwr["power"~"^(substation|plant|generator)$"](${bbox});nwr["man_made"~"^(water_works|pumping_station)$"](${bbox}););out center tags;`;
  try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    let response;
    try{response=await fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query),{signal:controller.signal,headers:{Accept:'application/json'}});}finally{clearTimeout(timeout);}
    if(!response.ok)throw Error('OpenStreetMap query failed');
    const data=await response.json();if(own!==lifelineRequest||scope!==currentLocation)return;
    const features=[];const seen=new Set();
    for(const element of data.elements||[]){
      const tags=element.tags||{},category=lifelineCategory(tags);if(!category)continue;
      const lat=element.lat??element.center?.lat,lon=element.lon??element.center?.lon;if(!Number.isFinite(lat)||!Number.isFinite(lon)||!containsPoint(scopeBoundary.geometry,lon,lat))continue;
      const key=`${element.type}/${element.id}`;if(seen.has(key))continue;seen.add(key);
      const name=tags.name||tags.operator||({worship:'Place of worship',health:'Health facility',education:'School',bridge:'Bridge',transit:'Transit stop',public_safety:'Public safety service',government:'Government service',utility:'Utility facility'}[category]);
      features.push({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{name,label:category.replace('_',' '),category}});
    }
    lifelineCache.set(scope,features);try{localStorage.setItem(`bahaba-lifelines-v1-${scope}`,JSON.stringify({expires:Date.now()+86400000,features}));}catch{}lifelineLayer.clearLayers().addData(collection(features));statusNode.textContent=`${features.length} nearby features · OpenStreetMap`;
  }catch{if(own===lifelineRequest)statusNode.textContent='Nearby-place data unavailable · OpenStreetMap';}
}

createMap();

window.addEventListener('bahaba-reports-map', async (event) => {
  const request = ++requestNumber;
  const { locationId, canReport, reports } = event.detail;
  canHideReports=Boolean(event.detail.canHide); canDeleteReports=Boolean(event.detail.canDelete);
  form.hidden = !canReport;
  if (!locationId) {
    select.replaceChildren(new Option('Choose a location first',''));
    window.refreshAdminSearchSelects?.();
    message.textContent = 'Choose a supported location to load its barangays.';
    return;
  }
  try {
    mapIndexRegistry ||= Promise.all([
      fetch('./map-data/locations.json?v=20261013-mapfix2').then(response => { if (!response.ok) throw Error('Map locations unavailable.'); return response.json(); }),
      fetch('./map-data/barangay-options.json?v=20261013-mapfix').then(response => { if (!response.ok) throw Error('Barangay directory unavailable.'); return response.json(); }),
      fetch('./psgc-registry.json?v=20261013-mapfix3').then(response => { if (!response.ok) throw Error('Supported location registry unavailable.'); return response.json(); }),
    ]);
    const [config, barangayDirectory, psgcRegistry] = await mapIndexRegistry;
    if (request !== requestNumber) return;
    const mapLocation = config.locations.find(item => item.id === locationId);
    const location = mapLocation || event.detail.locationInfo || psgcRegistry.locations.find(item => item.id === locationId);
    if (!location) throw Error('Location details are unavailable. Refresh the location selector and try again.');
    let geometry = { features: [] }, borders = { features: [] };
    if (mapLocation) {
      detailRegistry ||= Promise.all([
        fetch('./map-data/barangays.json?v=20261013-mapfix2').then(response => { if (!response.ok) throw Error('Barangay boundaries unavailable.'); return response.json(); }),
        fetch('./map-data/lgu-boundaries.json?v=20261013-mapfix2').then(response => { if (!response.ok) throw Error('LGU boundaries unavailable.'); return response.json(); }),
      ]);
      [geometry, borders] = await detailRegistry;
      if (request !== requestNumber) return;
    }
    scopeBoundary = borders.features.find(feature => feature.id === locationId);
    const changed = currentLocation !== locationId;
    currentLocation = locationId;
    signalLayer?.clearLayers();
    currentReports = reports || [];
    currentFeatures = geometry.features.filter(feature => feature.properties.city === (location.map_city || location.city) &&
      (!location.map_municipality || feature.properties.municipality === location.map_municipality));
    refreshFloodSignals();
    currentBarangays = currentFeatures.length ? currentFeatures : (barangayDirectory.locations?.[locationId] || []).map((name) => ({ id: name, properties: { name }, geometry: null }));
    document.getElementById('lgu-report-map-scope').textContent = location.name;
    if (changed) {
      selected = null;
      clearReportPoint();
      select.replaceChildren(new Option('Select a barangay or click the map',''));
      [...currentBarangays].sort((a,b) => a.properties.name.localeCompare(b.properties.name)).forEach(feature =>
        select.add(new Option([feature.properties.name,feature.properties.municipality].filter(Boolean).join(' · '),feature.id)));
    }
    if (changed) {
      areaLayer.clearLayers().addData(collection(currentFeatures));
      scopeLayer.clearLayers().addData(collection(scopeBoundary ? [scopeBoundary] : []));
    }
    pointDetail.textContent = scopeBoundary
      ? 'Click a specific street on the map to add an exact report pin.'
      : 'Map pins are not available for this location yet. Select a barangay and add the street or landmark by name.';
    message.textContent = currentBarangays.length ? '' : 'The map is available, but barangay data could not be found for this location.';
    if(map.lifelineToggle?.checked){lifelineLayer.clearLayers();loadLifelines(map.lifelineStatus);}
    syncLayers();
    requestAnimationFrame(() => {
      map.invalidateSize({pan:false});
      if (changed) {
        if (scopeBoundary) fitFeatures([scopeBoundary]);
        else if (currentFeatures.length) fitFeatures(currentFeatures, 12);
      }
    });
  } catch (error) { mapIndexRegistry = null; detailRegistry = null; message.textContent = error.message; }
});

select.addEventListener('change', () => chooseBarangay(select.value));

let pendingReports = [];
let sendingReports = false;
const submitReports = form.querySelector('[type="submit"]');
submitReports.textContent = 'Submit queued reports';
submitReports.disabled = true;
const addReport = document.createElement('button');
addReport.type = 'button'; addReport.className = 'btn btn-outline'; addReport.textContent = 'Add report to queue';
submitReports.before(addReport);
const queue = document.createElement('div');
queue.className = 'report-draft-queue';
queue.setAttribute('aria-live', 'polite');
form.after(queue);
function renderQueue(){
  queue.replaceChildren();
  queue.hidden = !pendingReports.length;
  const title = document.createElement('p'); title.textContent = pendingReports.length + ' report' + (pendingReports.length === 1 ? '' : 's') + ' ready to submit'; queue.append(title);
  pendingReports.forEach((report,index) => {
    const row = document.createElement('div'); row.className = 'report-draft-queue-row'; row.style.setProperty('--severity-color',colors[report.severity] || colors.medium);
    const copy = document.createElement('span'); copy.textContent = report.barangay + ' · ' + report.severity + ': ' + report.description;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn btn-outline btn-sm'; remove.textContent = 'Remove'; remove.disabled = sendingReports;
    remove.addEventListener('click', () => { pendingReports.splice(index,1); renderQueue(); });
    row.append(copy,remove); queue.append(row);
  });
  submitReports.disabled = sendingReports || !pendingReports.length;
  addReport.disabled = sendingReports;
}
addReport.addEventListener('click', () => {
  if(sendingReports || !form.reportValidity()) return;
  if(!selected) { message.textContent = 'Select the affected barangay first.'; return; }
  if(streetInput.value.trim() && !reportPoint && scopeBoundary) { message.textContent = 'Click the street on the map to place its report pin first.'; return; }
  const description = document.getElementById('lgu-map-description').value.trim();
  if(!description) { message.textContent = 'Describe the flooding first.'; return; }
  pendingReports.push({location_id:currentLocation, barangay_feature_id:selected.geometry ? selected.id : null, barangay:selected.properties.name,
    latitude:reportPoint?.latitude ?? null, longitude:reportPoint?.longitude ?? null, street_name:streetInput.value.trim(),
    severity:document.getElementById('lgu-map-severity').value, description});
  document.getElementById('lgu-map-description').value = ''; streetInput.value = ''; clearReportPoint();
  message.textContent = 'Report added. Prepare another report or submit the queue.';
  renderQueue();
});
form.noValidate = true;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if(sendingReports || !pendingReports.length) return;
  if(document.getElementById('lgu-map-description').value.trim()) { message.textContent = 'Add your current draft to the queue before submitting.'; return; }
  sendingReports = true; renderQueue();
  let saved = 0;
  try {
    while(pendingReports.length){
      message.textContent = 'Submitting reports: ' + saved + ' saved, ' + pendingReports.length + ' remaining...';
      await window.submitLguMapReport(pendingReports[0]);
      pendingReports.shift(); saved += 1;
    }
    message.textContent = saved + ' reports submitted and saved as pending.';
  } catch(error) { message.textContent = saved + ' reports saved. ' + pendingReports.length + ' remain queued. ' + error.message; }
  finally { sendingReports = false; renderQueue(); }
});
window.addEventListener('bahaba-reports-map', (event) => {
  if(!sendingReports && (!event.detail.canReport || pendingReports.some(report => report.location_id !== event.detail.locationId))) {
    pendingReports = []; renderQueue();
  }
});
window.addEventListener('bahaba-admin-social-reports', event => {
  const {locationId,events}=event.detail||{};
  socialReportLocation=String(locationId||'');
  socialReportEvents=Array.isArray(events)?events:[];
  if(currentLocation===socialReportLocation)refreshFloodSignals();
});
renderQueue();
window.dispatchEvent(new Event('bahaba-reports-map-ready'));
