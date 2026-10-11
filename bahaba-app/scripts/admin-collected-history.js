(function(){
 const host=document.getElementById('view-summary');if(!host)return;
 const panel=document.createElement('section');panel.className='panel';panel.id='collection-history';
 panel.innerHTML=`<div class="panel-head"><div><h3>Collected posts by month and year</h3><p class="view-sub">Posts leave the live feed after 24 hours and remain available here. Months follow collection time in the Philippines.</p></div></div><div class="panel-body"><label>Collection period <select id="collection-year"><option value="">Latest 12 months</option></select></label> <button type="button" class="btn btn-outline btn-sm" id="collection-export">Download Excel (.xlsx)</button><p id="collection-status" role="status"></p><p class="view-sub">Flood classifications are signals, not verified flood incidents. Multiple posts may describe the same flood. Missing records do not mean no flooding.</p><div id="collection-tables" style="overflow-x:auto"></div></div>`;
 document.getElementById('summary-status').after(panel);let sequence=0;
 const get=id=>document.getElementById(id);
 async function refresh(){
  const location=get('summary-location')?.value;if(!session||!location)return;
  const request=++sequence,year=get('collection-year').value;get('collection-status').textContent='Loading collection history…';get('collection-export').disabled=true;
  try{
   const params=new URLSearchParams({action:'collected-summary',location,year});
   const response=await fetch(ADMIN_API_URL+'?'+params,{credentials:'include',cache:'no-store'}),data=await response.json();if(request!==sequence)return;if(!response.ok)throw Error(data.error);
   get('collection-year').replaceChildren(new Option('Latest 12 months',''));for(const value of data.years)get('collection-year').add(new Option(value,value));get('collection-year').value=year;
   const tables=get('collection-tables');tables.replaceChildren();
   for(const [title,rows] of [['Monthly · by barangay',data.monthly],['Yearly · by barangay',data.yearly]]){
    const heading=document.createElement('h4');heading.textContent=title;tables.append(heading);
    const table=document.createElement('table');table.className='compact-data-table';table.style.width='100%';const head=document.createElement('thead'),tr=document.createElement('tr');
    for(const label of ['Period','Barangay','Collected','Flood','Non-flood','High','Medium','Low']){const th=document.createElement('th');th.textContent=label;tr.append(th)}head.append(tr);table.append(head);
    const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const key of ['period','barangay','total','flood','non_flood','high','medium','low']){const td=document.createElement('td');td.textContent=row[key];tr.append(td)}body.append(tr)}table.append(body);tables.append(table);
   }
   get('collection-status').textContent=data.rows.length?'Older collected posts preserved. Current 24-hour posts are shown in the live feed.':'No archived posts for this location and period yet.';get('collection-export').disabled=false;
  }catch(error){if(request===sequence){get('collection-status').textContent=error.message;get('collection-tables').replaceChildren()}}
 }
 get('collection-year').onchange=refresh;
 get('collection-export').onclick=async()=>{
  const button=get('collection-export');button.disabled=true;
  try{const params=new URLSearchParams({action:'collected-summary-export',location:get('summary-location').value,year:get('collection-year').value});const response=await fetch(ADMIN_API_URL+'?'+params,{credentials:'include'});if(!response.ok){const data=await response.json();throw Error(data.error)}const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download='bahaba-collection-'+(get('collection-year').value||'12-months')+'.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){get('collection-status').textContent=error.message}finally{button.disabled=false}
 };
 // The existing dashboard owns location selection and authentication.
 const original=window.renderSummaryDashboard;window.renderSummaryDashboard=async function(...args){await original.apply(this,args);await refresh()};
})();
