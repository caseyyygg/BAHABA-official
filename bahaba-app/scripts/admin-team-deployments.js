(function(){
 const host=document.getElementById('view-evacuees');if(!host)return;
 const styles=document.createElement('style');
 styles.textContent=`
 #team-deployments { margin-top:24px; overflow:hidden; font-family:Inter,system-ui,sans-serif; }
 #team-deployments .panel-head { padding:20px 24px; }
 #team-deployments .panel-head h3 { font-family:inherit; font-size:15px; font-weight:650; line-height:1.5; }
 #team-deployments .view-sub { margin-top:4px; font-size:13px; line-height:1.6; color:var(--ink-soft); }
 #team-deployments .panel-body { padding:24px; }
 #team-form > div:first-child { grid-template-columns:repeat(6,minmax(0,1fr)) !important; gap:18px 20px !important; }
 #team-form .field { min-width:0; margin:0; grid-column:span 2; }
 #team-form .field:nth-child(-n+2) { grid-column:span 3; }
 #team-form .field label { font-size:12px; font-weight:600; text-transform:none; letter-spacing:0; margin-bottom:8px; }
 #team-form .field input, #team-form .field select { width:100%; min-width:0; height:44px; padding:0 12px; border:1px solid var(--line); border-radius:10px; background:var(--mist-50); font-family:inherit; font-size:13px; line-height:1.5; transition:border-color .15s,box-shadow .15s; }
 #team-form .field input::placeholder { color:var(--ink-faint); }
 #team-form > button { margin-top:22px; min-height:40px; padding:0 16px; border-radius:10px; font-size:13px; font-weight:600; }
 #team-deployments [hidden] { display:none !important; }
 #team-message { margin-top:20px; padding:14px 16px; background:var(--mist-50); border:1px solid var(--line); border-radius:10px; color:var(--ink-soft); font-size:13px; line-height:1.6; }
 #team-message:empty, #team-list:empty { display:none; }
 #team-list:not(:empty) { margin-top:18px; border:1px solid var(--line); border-radius:12px; }
 #team-list table { border-collapse:collapse; font-size:13px; line-height:1.5; }
 #team-list th { padding:12px 16px; text-align:left; background:var(--mist-50); color:var(--ink-soft); font-size:12px; font-weight:600; }
 #team-list td { padding:14px 16px; border-top:1px solid var(--line); }
 #team-list td:last-child { white-space:nowrap; }
 #team-list td .btn + .btn { margin-left:8px; }
 @media(max-width:640px) {
   #team-deployments .panel-head, #team-deployments .panel-body { padding:18px; }
   #team-form > div:first-child { grid-template-columns:minmax(0,1fr) !important; gap:16px !important; }
   #team-form .field, #team-form .field:nth-child(-n+2) { grid-column:auto; }
 }
 `;
 document.head.append(styles);
 const panel=document.createElement('section');panel.className='panel';panel.id='team-deployments';
 panel.innerHTML=`<div class="panel-head"><div><h3>Team deployments</h3><p class="view-sub">Assign response teams to a barangay and keep their deployment status current.</p></div></div><div class="panel-body"><form id="team-form"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px"><div class="field"><label for="team-barangay">Barangay</label><select id="team-barangay" required></select></div><div class="field"><label for="team-name">Team name</label><input id="team-name" maxlength="150" placeholder="e.g. Municipal rescue team" required></div><div class="field"><label for="team-personnel">Personnel</label><input id="team-personnel" type="number" min="1" max="100000" step="1" value="1" required></div><div class="field"><label for="team-contact">Contact (optional)</label><input id="team-contact" maxlength="150"></div><div class="field"><label for="team-status">Status</label><select id="team-status"><option value="deployed">Deployed</option><option value="standby">Standby</option><option value="withdrawn">Withdrawn</option></select></div></div><button class="btn btn-primary btn-sm" type="submit">Deploy team</button> <button class="btn btn-outline btn-sm" type="button" id="team-cancel" hidden>Cancel edit</button></form><p id="team-message" role="status"></p><div id="team-list" style="overflow-x:auto"></div></div>`;host.append(panel);
 const get=id=>document.getElementById(id);let csrf='',editing=null,sequence=0;
 const display=name=>window.formatBarangayStatusName?window.formatBarangayStatusName(name):String(name).replace(/ \? /g,', ');
 function reset(){editing=null;get('team-form').reset();get('team-cancel').hidden=true;get('team-form').querySelector('[type=submit]').textContent='Deploy team'}
 async function refresh(){
  if(!session)return;const request=++sequence,location=currentAdminLocationId(),selected=get('evac-barangay-select')?.value||session.activeBarangay||'';
  if(!location)return;const previous=get('team-barangay').value;get('team-barangay').replaceChildren();for(const name of scopedBarangays())get('team-barangay').add(new Option(display(name),name));if([...get('team-barangay').options].some(o=>o.value===selected))get('team-barangay').value=selected;else if([...get('team-barangay').options].some(o=>o.value===previous))get('team-barangay').value=previous;
  get('team-message').textContent='Loading teams…';
  try{const response=await fetch(ADMIN_API_URL+'?'+new URLSearchParams({action:'team-deployments',location,barangay:selected}),{credentials:'include',cache:'no-store'}),data=await response.json();if(request!==sequence)return;if(!response.ok)throw Error(data.error);csrf=data.csrf;get('team-form').hidden=!data.can_edit;const list=get('team-list');list.replaceChildren();
   if(!data.teams.length){get('team-message').textContent='No team deployments recorded for this barangay.';return}
   get('team-message').textContent=data.teams.filter(t=>t.status==='deployed').length+' teams currently deployed.';
   const table=document.createElement('table');table.className='compact-data-table';table.style.width='100%';const header=document.createElement('tr');for(const label of ['Team','Barangay','Personnel','Contact','Status','Actions']){const th=document.createElement('th');th.textContent=label;header.append(th)}const head=document.createElement('thead');head.append(header);table.append(head);const body=document.createElement('tbody');
   for(const team of data.teams){const row=document.createElement('tr');row.dataset.teamId=team.id;for(const value of [team.name,display(team.barangay),team.personnel,team.contact||'—',team.status]){const td=document.createElement('td');td.textContent=value;row.append(td)}const actions=document.createElement('td');if(data.can_edit){for(const text of ['Edit','Delete']){const button=document.createElement('button');button.type='button';button.className='btn btn-outline btn-sm';button.textContent=text;button.onclick=()=>{if(text==='Edit'){editing=Number(team.id);get('team-name').value=team.name;get('team-personnel').value=team.personnel;get('team-contact').value=team.contact;get('team-status').value=team.status;get('team-barangay').value=team.barangay;get('team-cancel').hidden=false;get('team-form').querySelector('[type=submit]').textContent='Save deployment';get('team-name').focus()}else if(confirm('Delete deployment for '+team.name+'?'))save({action:'team-deployment-delete',id:Number(team.id)})};actions.append(button)}}else actions.textContent='View only';row.append(actions);body.append(row)}table.append(body);list.append(table);
  }catch(error){if(request===sequence){get('team-message').textContent=error.message;get('team-list').replaceChildren()}}
 }
 async function save(body){const button=get('team-form').querySelector('[type=submit]');button.disabled=true;try{const response=await fetch(ADMIN_API_URL,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...body,location_id:currentAdminLocationId()})}),data=await response.json();if(!response.ok)throw Error(data.error);reset();await refresh()}catch(error){get('team-message').textContent=error.message}finally{button.disabled=false}}
 get('team-form').onsubmit=event=>{event.preventDefault();save({action:'team-deployment-save',...(editing?{id:editing}:{}),barangay:get('team-barangay').value,name:get('team-name').value.trim(),personnel:Number(get('team-personnel').value),contact:get('team-contact').value.trim(),status:get('team-status').value})};get('team-cancel').onclick=reset;
 const original=window.renderEvacuees;window.renderEvacuees=function(...args){reset();original.apply(this,args);refresh()};
 let metricsSequence=0;
 const originalCommand=window.renderCommand;window.renderCommand=function(...args){originalCommand.apply(this,args);const request=++metricsSequence,location=currentAdminLocationId();if(!location)return;fetch(ADMIN_API_URL+'?'+new URLSearchParams({action:'team-deployments',location}),{credentials:'include',cache:'no-store'}).then(async response=>{if(!response.ok)return;const data=await response.json();if(request!==metricsSequence||location!==currentAdminLocationId())return;const deployed=data.teams.filter(team=>team.status==='deployed');const count=document.querySelector('#command-metrics .metric-card:last-child .metric-num');if(count)count.textContent=String(deployed.length);for(const row of document.querySelectorAll('#command-ledger .ledger-row')){const name=row.querySelector('.ledger-name')?.textContent.replace(/^Barangay /,'');const total=deployed.filter(team=>display(team.barangay)===name).length;const teams=row.querySelector('.ledger-stat:last-child .n');if(teams)teams.textContent=String(total)}}).catch(()=>{});};
 // Keep imported label punctuation readable without changing option values.
 const formatLabels=()=>{for(const option of document.querySelectorAll('select option'))if(option.textContent.includes(' ? '))option.textContent=option.textContent.replace(/ \? /g,', ');const banner=get('evac-scope-banner');if(banner){const walk=document.createTreeWalker(banner,NodeFilter.SHOW_TEXT);let node;while((node=walk.nextNode()))if(node.nodeValue.includes(' ? '))node.nodeValue=node.nodeValue.replace(/ \? /g,', ')}};
 new MutationObserver(formatLabels).observe(host,{childList:true,subtree:true});formatLabels();
})();
