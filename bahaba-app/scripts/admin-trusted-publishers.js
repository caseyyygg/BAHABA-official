(function () {
  const view=document.getElementById('view-nlp-api'),tabs=document.getElementById('nlp-account-tabs');
  if(!view||!tabs)return;
  const button=document.createElement('button');button.type='button';button.className='btn btn-outline';button.textContent='Trusted sources';button.hidden=true;tabs.append(button);
  const panel=document.createElement('section');panel.className='panel';panel.hidden=true;
  panel.innerHTML='<div class="panel-head"><h3>Verified publisher registry</h3></div><div class="panel-body"><p>Approve exact accounts for Philippine government agencies, LGUs, mayors and news organizations. Account names and badges alone do not establish trust. A trusted source still needs a valid flood post, publication time and city.</p><form style="display:grid;gap:12px"><label>Platform <select name="platform"><option value="x">X</option><option value="facebook">Facebook</option><option value="threads">Threads</option></select></label><label>Numeric publisher ID <input name="publisher_id" pattern="[0-9]+" required></label><label>Category <select name="publisher_type"><option value="government">Government / LGU / mayor</option><option value="news">News organization</option></select></label><label>Official platform profile URL <input name="profile_url" type="url" required></label><label>Independent verification link (for example, the agency website linking this account) <input name="evidence_url" type="url" required></label><label><input name="review_confirmed" type="checkbox" required> I verified this account identity and its official affiliation.</label><label><input name="active" type="checkbox" checked> Enable the single-post exception for this account</label><button type="submit" class="btn btn-primary">Save reviewed source</button></form><p role="status"></p><div data-list></div></div>';
  view.append(panel);let csrf='';
  const form=panel.querySelector('form'),status=panel.querySelector('[role=status]');
  async function load(){
    status.textContent='Loading approved publishers…';
    try{
      const response=await fetch(ADMIN_API_URL+'?action=trusted-publishers',{credentials:'include',cache:'no-store'}),data=await response.json();
      if(!response.ok)throw Error(data.error);csrf=data.csrf;const list=panel.querySelector('[data-list]');list.replaceChildren();
      for(const source of data.publishers){const row=document.createElement('p');row.textContent=`${source.platform} · ${source.publisher_id} · ${source.publisher_type} · ${Number(source.active)?'enabled':'disabled'}`;list.append(row);}
      status.textContent=`${data.publishers.length} reviewed sources. Unlisted accounts use the normal 15-post threshold.`;
    }catch(error){status.textContent=error.message||'Trusted-source registry unavailable.';}
  }
  button.onclick=()=>{for(const item of view.querySelectorAll(':scope > .panel'))item.hidden=true;panel.hidden=false;load();};
  tabs.addEventListener('click',event=>{if(event.target!==button)panel.hidden=true;});
  form.onsubmit=async event=>{
    event.preventDefault();if(!csrf){status.textContent='Reload trusted sources before saving.';return;}
    const values=Object.fromEntries(new FormData(form));values.action='trusted-publisher-save';values.review_confirmed=form.elements.review_confirmed.checked;values.active=form.elements.active.checked;
    try{const response=await fetch(ADMIN_API_URL,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(values)}),data=await response.json();if(!response.ok)throw Error(data.error);await load();}catch(error){status.textContent=error.message||'Could not save reviewed source.';}
  };
  const original=window.renderNlpConnections;
  window.renderNlpConnections=async function(...args){button.hidden=session?.role!=='platform-admin';return original.apply(this,args);};
})();
