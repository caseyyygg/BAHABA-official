(function(){
 const ledger=document.getElementById('command-ledger');if(!ledger)return;
 let page=1,scopeKey='';
 const toolbar=document.createElement('div');toolbar.className='panel-body';toolbar.style.padding='12px 20px';
 const label=document.createElement('label');label.htmlFor='barangay-status-search';label.textContent='Search barangay or municipality';label.style.display='block';
 const search=document.createElement('input');search.id='barangay-status-search';search.type='search';search.placeholder='e.g. Abangan or Marilao';search.style.cssText='width:100%;max-width:420px;margin-top:6px;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px';toolbar.append(label,search);ledger.before(toolbar);
 const footer=document.createElement('div');footer.className='managed-footer';footer.style.cssText='display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px';
 const count=document.createElement('span');count.id='barangay-status-count';count.setAttribute('role','status');
 const controls=document.createElement('div');controls.style.cssText='display:flex;gap:8px';
 const previous=document.createElement('button'),next=document.createElement('button');
 for(const [button,text,id] of [[previous,'Previous','barangay-status-prev'],[next,'Next','barangay-status-next']]){button.type='button';button.className='btn btn-outline btn-sm';button.textContent=text;button.id=id;controls.append(button)}footer.append(count,controls);ledger.after(footer);
 // A broken separator exists in imported province labels. Keep stored identifiers
 // intact for existing assignments; format their visible names consistently.
 window.formatBarangayStatusName=value=>String(value).replace(/\s+(?:\?|\u2014|\u2013)\s+/g,', ');
 window.commandBarangayPage=function(scope){
  const key=JSON.stringify([session?.id,currentAdminLocationId(),session?.barangay]);
  if(scopeKey!==key){scopeKey=key;page=1;search.value=''}
  const query=search.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const matching=scope.filter(name=>window.formatBarangayStatusName(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(matching.length/10));page=Math.min(page,pages);
  count.textContent=matching.length?`${matching.length} barangays · Page ${page} of ${pages}`:'No barangays match your search.';
  previous.disabled=page<=1;next.disabled=page>=pages;
  return matching.slice((page-1)*10,page*10);
 };
 search.addEventListener('input',()=>{page=1;renderCommand()});
 previous.onclick=()=>{if(page>1){page--;renderCommand()}};next.onclick=()=>{page++;renderCommand()};
})();
