/* Paginated report management independent of map, barangay and verification filters. */
(function(){
 let page=1,sequence=0,loaded=false,timer;
 const view=document.getElementById('view-reports');if(!view)return;
 const panel=document.createElement('section');panel.id='report-manager';panel.className='panel report-manager-panel';
 panel.innerHTML=`<div class="panel-head"><div><h3>Manage all report pins</h3><p class="view-sub" id="managed-scope">Reports remain here when hidden from the map.</p></div><button type="button" class="btn btn-outline btn-sm" id="managed-refresh">Refresh</button></div>
 <div class="managed-toolbar"><label>Search reports<input id="managed-search" type="search" placeholder="Report ID, city, barangay or description"></label><label>Map visibility<select id="managed-visibility"><option value="all">All pins</option><option value="hidden">Hidden pins</option><option value="visible">Not hidden</option></select></label></div>
 <div class="managed-table-scroll"><table class="compact-data-table"><thead><tr><th>ID</th><th>Location</th><th>Report</th><th>Source</th><th>Severity</th><th>Map</th><th>Actions</th></tr></thead><tbody id="managed-rows"></tbody></table></div><div class="managed-footer"><span id="managed-count" role="status"></span><div><button type="button" class="btn btn-outline btn-sm" id="managed-prev">Previous</button><button type="button" class="btn btn-outline btn-sm" id="managed-next">Next</button></div></div>`;
 view.querySelector('.lgu-report-map-panel').after(panel);
 const get=id=>document.getElementById(id);
 async function refresh(){
  if(!session)return;const request=++sequence;get('managed-count').textContent='Loading reports...';
  const params=new URLSearchParams({action:'managed-reports',page,visibility:get('managed-visibility').value,search:get('managed-search').value});
  try{
   const response=await fetch(ADMIN_API_URL+'?'+params,{credentials:'include',cache:'no-store'});const data=await response.json();if(request!==sequence)return;if(!response.ok)throw Error(data.error||'Could not load reports.');
   page=data.page;get('managed-scope').textContent=data.platform?'All available LGU locations and barangays. Hidden reports stay here until restored or deleted.':'All reports in your assigned location. Hidden reports stay here until restored or deleted.';

   const tbody=get('managed-rows');tbody.replaceChildren();
   for(const report of data.reports){
    const tr=document.createElement('tr');tr.dataset.reportId=report.id;
    const location=locationForId(report.location_id);const hidden=Boolean(Number(report.map_hidden));
    const values=['#'+report.id,[report.barangay,location?.name||report.city].filter(Boolean).join(', '),report.description||'',report.severity,hidden?'Hidden':'Not hidden'];
    values.forEach((value,index)=>{const td=document.createElement('td');td.textContent=value;if(index===2){td.className='managed-description';td.title=value;if(value.length>140){td.textContent='';const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p');summary.textContent=value.slice(0,140)+'...';text.textContent=value;details.append(summary,text);td.append(details)}}if(index===3){td.textContent='';const badge=document.createElement('span');const severity=String(value||'').toLowerCase();badge.className='managed-severity managed-severity--'+(['high','medium','low'].includes(severity)?severity:'unknown');badge.textContent=severity?severity[0].toUpperCase()+severity.slice(1):'Unknown';td.append(badge)}if(index===4)td.className=hidden?'map-state-hidden':'map-state-visible';tr.append(td)});
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
   if(!data.reports.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.textContent='No reports match these filters.';tr.append(td);tbody.append(tr)}
   get('managed-count').textContent=`${data.total} reports · Page ${page} of ${data.pages}`;get('managed-prev').disabled=page<=1;get('managed-next').disabled=page>=data.pages;
  }catch(error){if(request===sequence){get('managed-count').textContent=error.message;get('managed-rows').replaceChildren()}}
 }
 get('managed-search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{page=1;refresh()},250)});
 for(const id of ['managed-visibility'])get(id).onchange=()=>{page=1;refresh()};
 get('managed-prev').onclick=()=>{page--;refresh()};get('managed-next').onclick=()=>{page++;refresh()};get('managed-refresh').onclick=refresh;
 window.refreshManagedReports=refresh;window.renderReportManager=()=>{const key=JSON.stringify([session?.id,session?.email,session?.assigned_location,session?.acls]);if(loaded!==key){loaded=key;page=1;get('managed-rows').replaceChildren();refresh()}};
})();
