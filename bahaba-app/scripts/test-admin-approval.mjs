import assert from 'node:assert/strict';
function client(){let cookie='',csrf='';return async(action,body,expected=200)=>{if(body&&!csrf)await call('session');return call(action,body,expected);async function call(action,body,expected=200){const r=await fetch('http://localhost:8080/local-api.php?action='+action,{method:body?'POST':'GET',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const text=await r.text();assert.equal(r.status,expected,text);const data=JSON.parse(text);csrf=data.csrf||csrf;return data;}}}
const api=client();
for(const scope of ['navotas','bulacan','marikina','pampanga','malolos']){const {user}=await api('login',{email:`bahaba.lgu.${scope}@example.com`,password:'FloodTest!26'});assert.equal(user.role,'lgu');assert.equal(user.assigned_location,scope);assert.equal(user.acls.approval_board_hr,'no_access');if(['bulacan','pampanga'].includes(scope))assert.equal(user.assigned_psgc_id,null);console.log('PASS seeded '+scope+' LGU login and preserved scope');}
await api('requests',undefined,403);await api('review',{id:1,status:'active'},403);
const stamp=Date.now();const email=`approval-check-${stamp}@example.com`;const applicant=client();
await applicant('register',{email,password:'FloodTest!26',name:'Approval integration test',role:'lgu',psgc_id:'1380900000',barangay:'San Jose'},201);
await applicant('login',{email,password:'FloodTest!26'},403);
const team=client();await team('login',{email:'miguel.torres@bahaba.ph',password:'Bahaba@2026'});
const {requests}=await team('requests');const request=requests.find(r=>r.email===email);assert(request);await team('review',{id:request.id,status:'active'});await team('review',{id:request.id,status:'active'},409);
const approved=await applicant('login',{email,password:'FloodTest!26'});assert.equal(approved.user.assigned_psgc_id,'1380900000');assert.equal(approved.user.role,'lgu');await applicant('requests',undefined,403);await applicant('logout',{});assert.equal((await applicant('session')).user,null);
const teamEmail=`team-check-${stamp}@example.com`;await applicant('register',{email:teamEmail,password:'FloodTest!26',name:'Team request test',role:'team'},201);await applicant('login',{email:teamEmail,password:'FloodTest!26'},403);
const pending=(await team('requests')).requests.find(r=>r.email===teamEmail);await team('review',{id:pending.id,status:'rejected'});await applicant('login',{email:teamEmail,password:'FloodTest!26'},403);
console.log('PASS persistent pending registrations, team-only review, approval, rejection, no team self-activation, repeat review rejection, logout');
