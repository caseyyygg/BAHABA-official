const adminBase=process.env.BAHABA_ADMIN_URL || 'http://localhost:8001';
import assert from 'node:assert/strict';
let cookie='';async function api(action,data,expected=200){const r=await fetch(adminBase+'/api.php'+(data?'':'?action='+action),{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},...(data?{body:JSON.stringify({action,...data})}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const text=await r.text();assert.equal(r.status,expected,text);return JSON.parse(text);}
for(const scope of ['navotas','bulacan','marikina','pampanga','malolos']){const data=await api('login',{email:`bahaba.lgu.${scope}@example.com`,password:'FloodTest!26'});assert.equal(data.user.assigned_location,scope);await api('app-users',undefined,403);console.log('PASS original '+scope+' login and platform restriction');}
await api('login',{email:'miguel.torres@bahaba.ph',password:'Bahaba@2026'});
for(const action of ['session','users','app-users','all-reports','report-trends&location=navotas','nlp-events&location=navotas','health']){await api(action);console.log('PASS original '+action+' API');}

