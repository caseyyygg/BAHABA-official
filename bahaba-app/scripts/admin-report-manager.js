/* Paginated report management independent of map, barangay and verification filters. */
(function(){
 let page=1,sequence=0,loaded=false,timer,refreshing=false;
 const view=document.getElementById('view-reports');if(!view)return;
 const panel=document.createElement('section');panel.id='report-manager';panel.className='panel report-manager-panel';
 panel.innerHTML=`<div class="panel-head"><div><h3>All reports and flood signals</h3><p class="view-sub" id="managed-scope">Saved reports and individual automated NLP flood detections appear here.</p><p class="view-sub" id="managed-signal-status" role="status" aria-live="polite"></p></div><button type="button" class="btn btn-outline btn-sm" id="managed-refresh">Refresh</button></div>
 <div class="managed-toolbar"><label>Search reports<input id="managed-search" type="search" placeholder="Report ID, city, barangay, reporter or description"></label><label>Saved-report map visibility<select id="managed-visibility"><option value="all">All pins</option><option value="hidden">Hidden pins</option><option value="visible">Not hidden</option></select></label></div>
 <div class="managed-table-scroll"><table class="compact-data-table"><thead><tr><th>ID</th><th>Location</th><th>Report</th><th>Source</th><th>Severity</th><th>Reported by</th><th>Submitted (PHT)</th><th>Map</th><th>Actions</th></tr></thead><tbody id="managed-rows"></tbody></table></div><div class="managed-footer"><span id="managed-count" role="status"></span><div><button type="button" class="btn btn-outline btn-sm" id="managed-prev">Previous</button><button type="button" class="btn btn-outline btn-sm" id="managed-next">Next</button></div></div>`;
 view.querySelector('.lgu-report-map-panel').after(panel);
 const style=document.createElement('style');style.textContent=`
 #report-manager .managed-section-row td{background:#edf4fb;color:#23486c;font-weight:800}
 #report-manager .managed-preliminary-report td{background:#fbfdff}
 #report-manager .managed-preliminary-report td:first-child{border-left:4px solid #718096}
 #report-manager .managed-preliminary-report.severity-high td:first-child{border-left-color:#dc2626}
 #report-manager .managed-preliminary-report.severity-medium td:first-child{border-left-color:#d97706}
 #report-manager .managed-preliminary-report.severity-low td:first-child{border-left-color:#eab308}
 #report-manager .managed-severity{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 9px;font-size:11px;font-weight:800;text-transform:capitalize}
 #report-manager .managed-severity:before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}
 #report-manager .managed-severity--high{background:#fee2e2;color:#b91c1c}
 #report-manager .managed-severity--medium{background:#ffedd5;color:#c2410c}
 #report-manager .managed-severity--low{background:#fff2d5;color:#925b08}
 #report-manager .managed-severity--unknown{background:#eef2f7;color:#526174}
 #report-manager .managed-source-label{display:inline-flex;border:1px solid #cfe2d7;border-radius:999px;padding:4px 8px;background:#eaf6ee;color:#17653c;font-size:10px;font-weight:800}
 #report-manager .managed-live-note{color:#47627b;font-size:11px}
 #report-manager .managed-live-dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#17834b;box-shadow:0 0 0 3px #dff4e8}
 `;document.head.append(style);
 const get=id=>document.getElementById(id);
 async function refresh(){
  if(!session)return;const request=++sequence;refreshing=true;if(!get('managed-rows').childElementCount)get('managed-count').textContent='Loading reports...';
  const params=new URLSearchParams({action:'managed-reports',page,visibility:get('managed-visibility').value,search:get('managed-search').value});
  try{
   const response=await fetch(ADMIN_API_URL+'?'+params,{credentials:'include',cache:'no-store'});const data=await response.json();if(request!==sequence)return;if(!response.ok)throw Error(data.error||'Could not load reports.');
   page=data.page;
   const selectedLocation=document.getElementById('reports-location-select')?.value||'';
   let floodEvents=[],signalError='';
   try{
    const feedParams=new URLSearchParams({action:'nlp-events',location:selectedLocation,limit:'100'});
    const feedResponse=await fetch(ADMIN_API_URL+'?'+feedParams,{credentials:'include',cache:'no-store'});
    const feed=await feedResponse.json();if(request!==sequence)return;if(!feedResponse.ok)throw Error(feed.error||'Could not load classified flood posts.');
    if(!Array.isArray(feed.events))throw Error('Classified-post response is invalid.');
    floodEvents=feed.events.filter(event=>String(event.classification||'').toLowerCase()==='flood');
    window.dispatchEvent(new CustomEvent('bahaba-admin-social-reports',{detail:{locationId:selectedLocation,events:floodEvents}}));
    get('managed-signal-status').textContent=`${floodEvents.length} automated NLP flood detection${floodEvents.length===1?'':'s'} in the latest ${feed.events.length} classified posts. Individual severities are shown as assigned by NLP.`;
   }catch(error){signalError=error.message;get('managed-signal-status').textContent='Automated NLP detections are unavailable: '+signalError+'. Saved reports are still shown.'}
   get('managed-scope').textContent=data.platform?'Saved reports and automated NLP detections for the selected LGU.':'Saved reports and automated NLP detections in your assigned LGU.';

   const tbody=get('managed-rows');tbody.replaceChildren();
   const reports=Array.isArray(data.reports)?data.reports:[];
   const query=get('managed-search').value.trim().toLowerCase();
   floodEvents=floodEvents.filter(event=>!query||[event.source_post_id,event.city,event.barangay,event.location,event.post_text].some(value=>String(value||'').toLowerCase().includes(query)));
   for(const report of reports){
    const tr=document.createElement('tr');tr.dataset.reportId=report.id;
    const location=locationForId(report.location_id);const hidden=Boolean(Number(report.map_hidden));
    const values=['#'+report.id,[report.barangay,location?.name||report.city].filter(Boolean).join(', '),report.description||'',report.severity];
    values.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;if(index===2){td.className='managed-description';td.title=value;if(value.length>140){td.textContent='';const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent=value.slice(0,140)+'...';text.textContent=value;details.append(summary,text);td.append(details)}}if(index===3){td.textContent='';const badge=document.createElement('span');const severity=String(value||'').toLowerCase();badge.className='managed-severity managed-severity--'+(['high','medium','low'].includes(severity)?severity:'unknown');badge.textContent=severity?severity[0].toUpperCase()+severity.slice(1):'Unknown';td.append(badge)}if(index===4)td.className=hidden?'map-state-hidden':'map-state-visible';tr.append(td)});
    const reporterCell=document.createElement('td');reporterCell.textContent=report.reporter||'Not recorded';tr.append(reporterCell);
    const submittedCell=document.createElement('td');
    const submittedAt=String(report.created_at||'');
    if(submittedAt){const time=document.createElement('time');time.dateTime=submittedAt;const parsed=Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(submittedAt)?submittedAt:submittedAt.replace(' ','T')+'Z');time.textContent=Number.isFinite(parsed)?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(parsed):submittedAt;submittedCell.append(time)}else submittedCell.textContent='Not recorded';
    tr.append(submittedCell);
    const mapCell=document.createElement('td');mapCell.textContent=hidden?'Hidden':'Not hidden';mapCell.className=hidden?'map-state-hidden':'map-state-visible';tr.append(mapCell);
    const sourceCell=document.createElement('td');sourceCell.className='managed-source';
    const source=String(report.source||'').toLowerCase();const social=['nlp','facebook','twitter','x','threads','social','socmed'].includes(source);
    const label=document.createElement('span');label.className='managed-source-label';label.textContent=social?'Social media'+(report.platform?' · '+report.platform:''):source==='lgu'?'Manual · LGU':source==='citizen'?'Manual · Resident':'Source not recorded';sourceCell.append(label);
    let sources=[];try{sources=typeof report.source_posts==='string'?JSON.parse(report.source_posts):report.source_posts||[]}catch{}
    if(!Array.isArray(sources))sources=[];sources=[...sources,{url:report.original_post_url,source:report.platform}];
    const links=new Map();for(const entry of sources){try{const url=new URL(entry.url);if(['http:','https:'].includes(url.protocol))links.set(url.href,entry.source||'Original post')}catch{}}
    let host=sourceCell;if(links.size>1){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=links.size+' source posts';details.append(summary);sourceCell.append(details);host=details}
    for(const [url,platform] of links){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=links.size===1?'Open original post':platform+' · Open post';host.append(link)}
    if(social&&!links.size){const missing=document.createElement('small');missing.textContent='No source link provided';sourceCell.append(missing)}
    tr.insertBefore(sourceCell,tr.children[3]);
    const actions=document.createElement('td');actions.className='managed-actions';
    for(const [action,label,allowed] of [[hidden?'show':'hide',hidden?'Show on map':'Hide from map',data.can_hide],['delete','Delete',data.can_delete]]){if(!allowed && action!=='delete')continue;const button=document.createElement('button');button.type='button';button.className='btn btn-outline btn-sm'+(action==='delete'?' report-delete-button':'');button.textContent=label;button.disabled=!allowed;if(!allowed){button.title='Full Reports permission is required to delete';button.setAttribute('aria-label','Delete report '+report.id+' (full Reports permission required)')}button.onclick=async()=>{button.disabled=true;try{await window.manageReport(Number(report.id),action)}finally{button.disabled=false}};actions.append(button)}
    if(!actions.childNodes.length)actions.textContent='View only';tr.append(actions);tbody.append(tr);
   }
   if(floodEvents.length){const tr=document.createElement('tr');tr.className='managed-section-row';const td=document.createElement('td');td.colSpan=9;td.textContent='Automated NLP flood detections';tr.append(td);tbody.append(tr)}
   for(const event of floodEvents){
    const tr=document.createElement('tr');const severity=String(event.severity||'').toLowerCase();tr.className='managed-preliminary-report severity-'+(['high','medium','low'].includes(severity)?severity:'unknown');
    const source=String(event.source||'Social media');
    const location=[event.barangay,event.city||event.location].filter(Boolean).join(', ')||'Location not identified';
    const values=[`NLP · ${event.source_post_id||event.id||'post'}`,location,event.post_text||'Flood classified by NLP',event.severity||'Unspecified'];
    values.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;if(index===2){td.className='managed-description';td.title=value}if(index===3){td.textContent='';const badge=document.createElement('span');const severity=String(value).toLowerCase();badge.className='managed-severity managed-severity--'+(['high','medium','low'].includes(severity)?severity:'unknown');badge.textContent=String(value);td.append(badge)}tr.append(td)});
    const sourceCell=document.createElement('td');sourceCell.className='managed-source';const label=document.createElement('span');label.className='managed-source-label';label.textContent='Automated NLP · '+source;sourceCell.append(label);
    if(event.post_url){try{const url=new URL(event.post_url);if(['http:','https:'].includes(url.protocol)){const link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open original post';sourceCell.append(link)}}catch{}}
    tr.insertBefore(sourceCell,tr.children[3]);
    const reportedBy=document.createElement('td');reportedBy.textContent='NLP classifier · '+source;tr.append(reportedBy);
    const publishedAt=String(event.published_at||event.detected_at||'');const publishedCell=document.createElement('td');
    if(publishedAt){const time=document.createElement('time');time.dateTime=publishedAt;const parsed=Date.parse(/[zZ]$|[+-]\d{2}:\d{2}$/.test(publishedAt)?publishedAt:publishedAt.replace(' ','T')+'Z');time.textContent=Number.isFinite(parsed)?new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(parsed):publishedAt;publishedCell.append(time)}else publishedCell.textContent='Not recorded';
    tr.append(publishedCell);const mapCell=document.createElement('td');mapCell.textContent=event.barangay?'Barangay shade':'Map checks post text';mapCell.className='map-state-visible';tr.append(mapCell);
    const actions=document.createElement('td');actions.className='managed-actions';actions.textContent='Shown on map when location matches';tr.append(actions);tbody.append(tr);
   }
   if(!reports.length&&!floodEvents.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.textContent=signalError?'No saved reports; classified flood posts could not be loaded.':'No saved reports or recent classified flood posts match these filters.';tr.append(td);tbody.append(tr)}
   get('managed-count').textContent=`${data.total} saved reports · ${floodEvents.length} automated NLP detection${floodEvents.length===1?'':'s'} · Saved reports page ${page} of ${data.pages}`;
   const liveNote=document.createElement('span'),liveDot=document.createElement('span');liveNote.className='managed-live-note';liveDot.className='managed-live-dot';liveNote.append(liveDot,document.createTextNode('Updated '+new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',second:'2-digit'}).format(new Date())+' PHT · checks every 15 seconds while this view is open.'));
   get('managed-signal-status').append(' ',liveNote);
   get('managed-prev').disabled=page<=1;get('managed-next').disabled=page>=data.pages;
  }catch(error){if(request===sequence){get('managed-count').textContent=error.message;get('managed-signal-status').textContent='Could not refresh reports: '+error.message;get('managed-rows').replaceChildren()}}
  finally{if(request===sequence)refreshing=false}
 }
 get('managed-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;refresh()},250)});
 for(const id of ['managed-visibility'])get(id).onchange=()=>{page=1;refresh()};
 get('managed-prev').onclick=()=>{page--;refresh()};get('managed-next').onclick=()=>{page++;refresh()};get('managed-refresh').onclick=refresh;
 window.refreshManagedReports=refresh;window.renderReportManager=()=>{const key=JSON.stringify([session?.id,session?.email,session?.assigned_location,session?.acls,get('reports-location-select')?.value]);if(loaded!==key){loaded=key;page=1;get('managed-rows').replaceChildren();refresh()}};
 setInterval(()=>{if(!refreshing&&document.visibilityState==='visible'&&!view.hidden&&view.offsetParent!==null)refresh()},15000);
})();
