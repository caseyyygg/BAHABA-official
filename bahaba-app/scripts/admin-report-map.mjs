import { containsPoint } from './report-point.mjs';
import { map as leafletMap, geoJSON, tileLayer, circleMarker } from './map-vendor/leaflet.mjs';

let map, baseTiles, mapIndexRegistry, detailRegistry, selected, currentLocation, areaLayer, selectedLayer, floodLayer;
let reportPoint = null, pointMarker = null, storedPointLayer = null;
let requestNumber = 0;
let currentFeatures = [];
let currentBarangays = [];
let currentReports = [];
let scopeBoundary = null, scopeLayer = null;
let canHideReports=false, canDeleteReports=false;
const form = document.getElementById('lgu-map-report-form');
const select = document.getElementById('lgu-map-barangay');
const message = document.getElementById('lgu-map-report-message');
const collection = (features) => ({ type: 'FeatureCollection', features });
const severityRank = { low: 1, medium: 2, high: 3 };
const colors = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626' };
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
    return [{ ...feature, properties: { ...feature.properties, severity } }];
  });
  floodLayer.clearLayers().addData(collection(affected));
  storedPointLayer?.clearLayers().addData(collection(currentReports.filter(report => report.latitude != null && report.longitude != null && !report.map_hidden && !['rejected','resolved','cancelled'].includes(report.status)).map(report => ({type:'Feature',geometry:{type:'Point',coordinates:[Number(report.longitude),Number(report.latitude)]},properties:{id:report.id,barangay:report.barangay,severity:report.severity,description:report.desc || report.description}}))));
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
  areaLayer = geoJSON(collection([]), {
    pane: 'reportAreas', interactive:false, style: { color: '#6995b8', weight: 1, fillColor: '#2478dd', fillOpacity: .07 },
    onEachFeature(feature, layer) {
      const label = document.createElement('span');
      label.textContent = feature.properties.name;
      layer.bindTooltip(label);

    },
  }).addTo(map);
  scopeLayer = geoJSON(collection([]), {pane:'reportScope',interactive:false,style:{color:'#173e77',weight:3,fill:false,dashArray:'8 5'}}).addTo(map);
  floodLayer = geoJSON(collection([]), { pane:'reportFloods', interactive:false,
    style: feature => ({ color:colors[feature.properties.severity] || colors.low, weight:2, fillOpacity:.35 }),
  }).addTo(map);
  selectedLayer = geoJSON(collection([]), { pane:'reportSelection', interactive:false,
    style:{ color:'#145cbe', weight:4, fillColor:'#2382ed', fillOpacity:.2 },
  }).addTo(map);

  map.createPane('reportPins').style.zIndex=450;
  storedPointLayer = geoJSON(collection([]), {
    pointToLayer:(feature,latlng) => circleMarker(latlng,{pane:'reportPins',radius:8,color:'#ffffff',weight:2,fillColor:colors[feature.properties.severity] || colors.low,fillOpacity:1,interactive:true,bubblingMouseEvents:false}),
    onEachFeature(feature,layer){
      const popup=document.createElement('div');popup.className='report-pin-popup';
      const title=document.createElement('strong');title.textContent='Report #'+feature.properties.id+' · '+feature.properties.barangay;
      const description=document.createElement('p');description.textContent=feature.properties.severity+' · '+(feature.properties.description||'');popup.append(title,description);
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
    currentReports = reports || [];
    currentFeatures = geometry.features.filter(feature => feature.properties.city === (location.map_city || location.city) &&
      (!location.map_municipality || feature.properties.municipality === location.map_municipality));
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
renderQueue();
window.dispatchEvent(new Event('bahaba-reports-map-ready'));
