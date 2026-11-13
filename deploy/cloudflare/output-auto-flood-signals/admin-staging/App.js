/* ============================================================
   Data model — Metro Manila Multi-City Registry
   ============================================================ */
let activeCity = "Malabon City";

const METRO_MANILA_DATA = {
  "Malabon City": {
    "Concepcion": { risk: "high", affected: 121408, teams: 3, centers: [
      { id: "c1", name: "Concepcion Elementary School", capacity: 1200, evacuees: 860 },
      { id: "c2", name: "Sto. Niño Multi-Purpose Hall", capacity: 500, evacuees: 310 }
    ]},
    "Baritan": { risk: "high", affected: 64220, teams: 2, centers: [
      { id: "b1", name: "Baritan Barangay Hall", capacity: 400, evacuees: 250 },
      { id: "b2", name: "Amang Rodriguez Elementary School", capacity: 900, evacuees: 410 }
    ]},
    "Acacia": { risk: "medium", affected: 18340, teams: 1, centers: [
      { id: "a1", name: "Acacia Covered Court", capacity: 300, evacuees: 95 }
    ]},
    "Panghulo": { risk: "medium", affected: 22110, teams: 1, centers: [
      { id: "p1", name: "Panghulo Elementary School", capacity: 700, evacuees: 180 }
    ]},
    "Longos": { risk: "low", affected: 4200, teams: 0, centers: [
      { id: "l1", name: "Longos Elementary School", capacity: 600, evacuees: 0 }
    ]}
  },
  "Quezon City": {
    "Batasan Hills": { risk: "high", affected: 165000, teams: 5, centers: [
      { id: "qc1", name: "Batasan Hills National High School", capacity: 2000, evacuees: 1100 }
    ]},
    "Commonwealth": { risk: "medium", affected: 98000, teams: 2, centers: [
      { id: "qc2", name: "Commonwealth Elementary School", capacity: 1500, evacuees: 450 }
    ]},
    "Bagong Silangan": { risk: "high", affected: 82000, teams: 3, centers: [
      { id: "qc3", name: "Bagong Silangan Elementary School", capacity: 1200, evacuees: 780 }
    ]}
  },
  "Manila City": {
    "Barangay 1": { risk: "high", affected: 45000, teams: 2, centers: [
      { id: "mnl1", name: "Tondo Sports Complex", capacity: 800, evacuees: 520 }
    ]},
    "Barangay 2": { risk: "medium", affected: 31000, teams: 1, centers: [
      { id: "mnl2", name: "Gagalangin Covered Court", capacity: 500, evacuees: 210 }
    ]}
  },
  "Caloocan City": {
    "Barangay 1": { risk: "medium", affected: 32000, teams: 1, centers: [
      { id: "cal1", name: "Caloocan High School", capacity: 1000, evacuees: 210 }
    ]},
    "Barangay 2": { risk: "low", affected: 14000, teams: 0, centers: [
      { id: "cal2", name: "Maypajo Elementary School", capacity: 600, evacuees: 0 }
    ]}
  },
  "Navotas City": {
    "San Jose": { risk: "high", affected: 54000, teams: 3, centers: [
      { id: "nav1", name: "Navotas Sports Complex", capacity: 1200, evacuees: 930 }
    ]},
    "Daanghari": { risk: "medium", affected: 28000, teams: 1, centers: [
      { id: "nav2", name: "Daanghari Elementary School", capacity: 600, evacuees: 190 }
    ]}
  }
};

let REPORTS = [
  {id:1, city:"Malabon City", barangay:"Concepcion", severity:"high", reporter:"NLP System", source:"nlp", platform:"Facebook", time:"11 min ago", desc:"Detected a public post describing knee-level water along Rizal St., rising fast.", status:"pending", photo:true},
  {id:2, city:"Malabon City", barangay:"Concepcion", severity:"medium", reporter:"NLP System", source:"nlp", platform:"X (Twitter)", time:"38 min ago", desc:"Detected a public post mentioning ankle-deep water near the covered market entrance.", status:"pending", photo:false},
  {id:3, city:"Malabon City", barangay:"Concepcion", severity:"high", reporter:"A. Dizon", source:"citizen", time:"1 hr ago", desc:"Street flooding blocking the main road to the barangay hall.", status:"verified", photo:false},
  {id:4, city:"Malabon City", barangay:"Concepcion", severity:"low", reporter:"R. Santos", source:"citizen", time:"2 hr ago", desc:"Minor pooling near the basketball court, receding.", status:"rejected", photo:false},
  {id:5, city:"Malabon City", barangay:"Concepcion", severity:"medium", reporter:"NLP System", source:"nlp", platform:"Facebook", time:"3 hr ago", desc:"Detected a public post about water rising near the creek behind Purok 3.", status:"pending", photo:true},
  {id:6, city:"Malabon City", barangay:"Baritan", severity:"high", reporter:"NLP System", source:"nlp", platform:"Facebook", time:"46 min ago", desc:"Detected multiple public posts reporting street flooding near the barangay hall.", status:"pending", photo:true},
  {id:7, city:"Malabon City", barangay:"Baritan", severity:"medium", reporter:"M. Cruz", source:"citizen", time:"2 hr ago", desc:"Water rising near the covered court, ankle-deep.", status:"verified", photo:false},
  {id:8, city:"Quezon City", barangay:"Batasan Hills", severity:"high", reporter:"NLP System", source:"nlp", platform:"Facebook", time:"15 min ago", desc:"Water level rising rapidly near the river bank.", status:"pending", photo:true}
];

let ANNOUNCEMENTS = [
  {id:1, city:"Malabon City", barangay:"Concepcion", title:"Evacuate low-lying areas near Rizal St.", body:"Water levels are rising quickly. Residents in low-lying sections should move to Concepcion Elementary School now.", status:"published", date:"Today, 2:14 PM"},
  {id:2, city:"Malabon City", barangay:"Concepcion", title:"Rescue teams on standby", body:"A rescue team is active in Concepcion. Call the barangay hotline if you need pickup assistance.", status:"published", date:"Today, 1:02 PM"},
  {id:3, city:"Malabon City", barangay:"Concepcion", title:"Advisory — heavy rainfall expected", body:"PAGASA forecasts heavy rain through tonight. Prepare go-bags and monitor local updates.", status:"draft", date:"Today, 9:40 AM"},
  {id:4, city:"Malabon City", barangay:"Baritan", title:"Road closure near barangay hall", body:"The main road to the barangay hall is impassable. Use the Tinajeros Ave. detour.", status:"published", date:"Today, 12:30 PM"},
  {id:5, city:"Quezon City", barangay:"Batasan Hills", title:"Emergency evacuation alert", body:"Residents in flood-prone zones proceed to Batasan Hills National High School.", status:"published", date:"Today, 3:00 PM"}
];

/* ============================================================
   ACL Engine — Helper Functions & Matrix Rules
   ============================================================ */
function getModulePermission(auth, moduleKey) {
  if (!auth || !auth.acls) return 'no_access';
  return (auth.acls[moduleKey] || 'no_access').toLowerCase();
}

function canViewModule(auth, moduleKey) {
  const lvl = getModulePermission(auth, moduleKey);
  return lvl === 'full' || lvl === 'edit' || lvl === 'view';
}

function canCreateModule(auth, moduleKey) {
  const lvl = getModulePermission(auth, moduleKey);
  return lvl === 'full' || lvl === 'edit';
}

function canEditModule(auth, moduleKey) {
  return getModulePermission(auth, moduleKey) === 'full';
}

function canApproveModule(auth, moduleKey) {
  const lvl = getModulePermission(auth, moduleKey);
  return lvl === 'full' || lvl === 'edit';
}

function canRejectModule(auth, moduleKey) {
  const lvl = getModulePermission(auth, moduleKey);
  return lvl === 'full' || lvl === 'edit';
}

function canDeleteModule(auth, moduleKey) {
  return getModulePermission(auth, moduleKey) === 'full';
}

function canAdminModule(auth, moduleKey) {
  return getModulePermission(auth, moduleKey) === 'full';
}

const VIEW_MODULE_MAP = {
  command: 'admin_overview',
  evacuees: 'products',
  reports: 'approval_board',
  announcements: 'announcements',
  logs: 'approval_board_hr'
};

/* Registered accounts for local testing / offline fallback */
let ACCOUNTS = [
  {
    email: "miguel.torres@bahaba.ph",
    password: "Bahaba@2026",
    name: "Miguel Torres",
    initials: "MT",
    org: "BAHABA Platform Admin",
    city: "Metro Manila (All Cities)",
    ip: "IP: 10.0.4.2",
    status: "active",
    acls: {
      admin_overview: 'full',
      announcements: 'full',
      products: 'full',
      approval_board: 'full',
      approval_board_hr: 'full'
    }
  },
  {
    email: "elena.villareal@malabon.gov.ph",
    password: "Concepcion@2026",
    name: "Elena Villareal",
    initials: "EV",
    org: "Brgy. Concepcion",
    city: "Malabon City",
    barangay: "Concepcion",
    ip: "IP: 121.54.12.8",
    status: "active",
    acls: {
      admin_overview: 'view',
      announcements: 'edit',
      products: 'edit',
      approval_board: 'edit',
      approval_board_hr: 'no_access'
    }
  },
  {
    email: "qc.admin@quezoncity.gov.ph",
    password: "Batasan@2026",
    name: "Marco Rivera",
    initials: "MR",
    org: "Brgy. Batasan Hills",
    city: "Quezon City",
    barangay: "Batasan Hills",
    ip: "IP: 121.54.18.12",
    status: "active",
    acls: {
      admin_overview: 'view',
      announcements: 'edit',
      products: 'edit',
      approval_board: 'edit',
      approval_board_hr: 'no_access'
    }
  }
];

let session = null;
let currentModuleId = null;
let reportsFilter = "pending";
let annFilter = "all";

/* ============================================================
   Metro Manila barangays Dictionary
   ============================================================ */
function numberedBarangays(count){
  const list = [];
  for(let i=1;i<=count;i++) list.push("Barangay "+i);
  return list;
}

const METRO_MANILA_BARANGAYS = {
  "Caloocan City": numberedBarangays(188),
  "Las Piñas City": ["Almanza Uno","Almanza Dos","B.F. International Village","Daniel Fajardo","Elias Aldana","Ilaya","Manuyo Uno","Manuyo Dos","Pamplona Uno","Pamplona Dos","Pamplona Tres","Pilar","Pulang Lupa Uno","Pulang Lupa Dos","Talon Uno","Talon Dos","Talon Tres","Talon Kuatro","Talon Singko","Zapote"],
  "Makati City": ["Bangkal","Bel-Air","Carmona","Cembo","Comembo","Dasmariñas","East Rembo","Forbes Park","Guadalupe Nuevo","Guadalupe Viejo","Kasilawan","La Paz","Magallanes","Olympia","Palanan","Pembo","Pinagkaisahan","Pio del Pilar","Pitogo","Poblacion","Post Proper Northside","Post Proper Southside","Rizal","San Antonio","San Isidro","San Lorenzo","Santa Cruz","Singkamas","South Cembo","Tejeros","Urdaneta","Valenzuela","West Rembo"],
  "Malabon City": ["Acacia","Baritan","Bayan-bayanan","Catmon","Concepcion","Dampalit","Flores","Hulong Duhat","Ibaba","Longos","Maysilo","Muzon","Niugan","Panghulo","Potrero","San Agustin","Santolan","Tañong","Tinajeros","Tonsuya","Tugatog"],
  "Mandaluyong City": ["Addition Hills","Bagong Silang","Barangka Drive","Barangka Ibaba","Barangka Ilaya","Barangka Itaas","Buayang Bato","Burol","Daang Bakal","Hagdang Bato Itaas","Hagdang Bato Libis","Harapin ang Bukas","Highway Hills","Hulo","Mabini-J. Rizal","Malamig","Mauway","Namayan","New Zañiga","Old Zañiga","Pag-asa","Plainview","Pleasant Hills","Poblacion","San Jose","Vergara","Wack-Wack Greenhills"],
  "Manila City": numberedBarangays(897),
  "Marikina City": ["Barangka","Calumpang","Concepcion Uno","Concepcion Dos","Fortune","Industrial Valley","Jesus de la Peña","Malanday","Marikina Heights","Nangka","Parang","San Roque","Santa Elena","Santo Niño","Tañong","Tumana"],
  "Muntinlupa City": ["Alabang","Ayala Alabang","Bayanan","Buli","Cupang","Poblacion","Putatan","Sucat","Tunasan"],
  "Navotas City": ["Bagumbayan North","Bagumbayan South","Bangculasi","Daanghari","Navotas East","Navotas West","North Bay Boulevard North","North Bay Boulevard South","San Jose","San Rafael Village","Sipac-Almacen","Tangos North","Tangos South","Tanza"],
  "Parañaque City": ["Baclaran","BF Homes","Don Bosco","Don Galo","La Huerta","Marcelo Green","Merville","Moonwalk","San Antonio","San Dionisio","San Isidro","San Martin de Porres","Santo Niño","Sun Valley","Tambo","Vitalez"],
  "Pasay City": numberedBarangays(201),
  "Pasig City": ["Bagong Ilog","Bagong Katipunan","Bambang","Buting","Caniogan","Dela Paz","Kalawaan","Kapasigan","Kapitolyo","Malinao","Manggahan","Maybunga","Oranbo","Palatiw","Pinagbubuhay","Pineda","Rosario","Sagad","San Antonio","San Joaquin","San Jose","San Miguel","San Nicolas","Santa Cruz","Santa Lucia","Santa Rosa","Santo Tomas","Santolan","Sumilang","Ugong"],
  "Pateros": ["Aguho","Magtanggol","Martires del 96","Poblacion","San Pedro","San Roque","Santa Ana","Santo Rosario-Kanluran","Santo Rosario-Silangan","Tabacalera"],
  "Quezon City": ["Alicia","Bagong Pag-asa","Bahay Toro","Balingasa","Bungad","Damar","Damayan","Del Monte","Katipunan","Lourdes","Maharlika","Manresa","Maribolo","Masambong","Matalahib","N.S. Amoranto","Nayong Kanluran","North Triangle","Paang Bundok","Pag-ibig sa Nayon","Paltok","Paraiso","Phil-Am","Project 6","Ramon Magsaysay","Saint Peter","Salvacion","San Antonio","San Isidro Labrador","San Jose","Santa Cruz","Santa Teresita","Santo Cristo","Sienna","Talayan","Vasra","Veterans Village","West Triangle","Batasan Hills","Commonwealth","Bagong Silangan"],
  "San Juan City": ["Addition Hills","Balong-Bato","Batis","Corazon de Jesus","Ermitaño","Greenhills","Halo-Halo","Isabelita","Kabayanan","Little Baguio","Maytunas","Onse","Pasadeña","Pedro Cruz","Progreso","Rivera","Salapan","San Perfecto","Santa Lucia","Tibagan","West Crame"],
  "Taguig City": ["Bagumbayan","Bambang","Calzada","Central Bicutan","Central Signal Village","Fort Bonifacio","Hagonoy","Ibayo-Tipas","Ligid-Tipas","Lower Bicutan","Maharlika Village","Napindan","New Lower Bicutan","North Daang Hari","North Signal Village","Palingon","Pinagsama","San Miguel","Santa Ana","Signal Village","South Daang Hari","South Signal Village","Tanyag","Tuktukan","Upper Bicutan","Ususan","Wawa","Western Bicutan"],
  "Valenzuela City": ["Arkong Bato","Bagbaguin","Balangkas","Bignay","Bisig","Canumay East","Canumay West","Coloong","Dalandanan","Gen. T. de Leon","Isla","Karuhatan","Lawang Bato","Lingunan","Mabolo","Malanday","Malinta","Mapulang Lupa","Marulas","Maysan","Palasan","Parada","Pariancillo Villa","Paso de Blas","Pasolo","Poblacion","Pulo","Punturin","Rincon","Tagalag","Ugong","Viente Reales","Wawang Pulo"]
};

const METRO_MANILA_CITIES = Object.keys(METRO_MANILA_BARANGAYS);

/* Scoping Helper Functions */
function currentCity() {
  if (session && session.city && session.city !== "Metro Manila (All Cities)") {
    return session.city;
  }
  return activeCity;
}

function getCityBarangays(cityName = currentCity()) {
  if (METRO_MANILA_DATA[cityName]) {
    return METRO_MANILA_DATA[cityName];
  }
  // Fallback structure for cities without sample data yet
  const bList = METRO_MANILA_BARANGAYS[cityName] || [];
  const generated = {};
  bList.slice(0, 3).forEach((bName, idx) => {
    generated[bName] = {
      risk: idx === 0 ? "high" : idx === 1 ? "medium" : "low",
      affected: (idx + 1) * 15000,
      teams: 2,
      centers: [
        { id: `c_${cityName}_${idx}`, name: `${bName} Evacuation Center`, capacity: 800, evacuees: (idx + 1) * 200 }
      ]
    };
  });
  return generated;
}

function scopedBarangays() {
  const cityData = getCityBarangays();
  if (canAdminModule(session, 'admin_overview')) {
    return Object.keys(cityData);
  }
  return [session.barangay];
}

/* ============================================================
   Audit Log State
   ============================================================ */
let AUDIT_LOG = [
  {time:"Aug 20, 2026, 4:12 PM", user:"Elena Villareal (Brgy. Concepcion, Malabon)", module:"Evacuees", action:"Update", description:'Evacuee count for "Concepcion Elementary School" changed to 860.', ip:"IP: 121.54.12.8", status:"success"},
  {time:"Aug 20, 2026, 4:05 PM", user:"BAHABA NLP System", module:"Reports", action:"Auto-detect", description:'New report auto-filed for Barangay Concepcion from a public Facebook post.', ip:"IP: 10.0.4.9 (automated)", status:"success"},
  {time:"Aug 20, 2026, 3:47 PM", user:"Elena Villareal (Brgy. Concepcion, Malabon)", module:"Reports", action:"Verify", description:'Report #3 in Barangay Concepcion marked as verified.', ip:"IP: 121.54.12.8", status:"success"},
  {time:"Aug 20, 2026, 3:02 PM", user:"Elena Villareal (Brgy. Concepcion, Malabon)", module:"Announcements", action:"Publish", description:'Announcement "Rescue teams on standby" published.', ip:"IP: 121.54.12.8", status:"success"},
  {time:"Aug 20, 2026, 2:20 PM", user:"BAHABA NLP System", module:"Reports", action:"Auto-detect", description:'New report auto-filed for Barangay Baritan from public posts on Facebook.', ip:"IP: 10.0.4.9 (automated)", status:"success"},
  {time:"Aug 20, 2026, 1:15 PM", user:"Elena Villareal (Brgy. Concepcion, Malabon)", module:"Reports", action:"Reject", description:'Report #4 in Barangay Concepcion marked as rejected.', ip:"IP: 121.54.12.8", status:"success"},
  {time:"Aug 20, 2026, 11:30 AM", user:"Miguel Torres (BAHABA Platform Admin)", module:"Account", action:"Sign in", description:"Platform admin signed in to the console.", ip:"IP: 10.0.4.2", status:"success"}
];

/* ============================================================
   Device ID & Authentication
   ============================================================ */
let pendingAccountType = 'lgu';
const PASSWORD_MAX_LENGTH = 72;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_ALLOWED_PATTERN = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]+$/;

function getDeviceId() {
  let deviceId = localStorage.getItem('bahaba_device_id');
  if (!deviceId) {
    deviceId = 'device_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('bahaba_device_id', deviceId);
  }
  return deviceId;
}

function validatePassword(password){
  if(password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH){
    return `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters long.`;
  }
  if(!PASSWORD_ALLOWED_PATTERN.test(password)){
    return "Password can only contain letters, numbers, and special characters (no spaces).";
  }
  return null;
}

function switchAuth(view){
  document.querySelectorAll('.auth-view').forEach(v=>v.classList.remove('active'));
  document.getElementById('auth-'+view).classList.add('active');
  ['login-alert','register-alert','forgot-alert'].forEach(id=>{
    const el = document.getElementById(id); if(el){ el.className='form-alert'; el.textContent=''; }
  });
}

function togglePassword(inputId, btn){
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.classList.toggle('showing', !isText);
}

function toggleDemoHint(){
  document.getElementById('demo-hint-body').classList.toggle('open');
}

function selectAccountType(type){
  pendingAccountType = type;
  document.getElementById('type-option-lgu').classList.toggle('selected', type==='lgu');
  document.getElementById('type-option-creator').classList.toggle('selected', type==='creator');
  document.getElementById('lgu-fields').style.display = type==='lgu' ? 'block' : 'none';
  document.getElementById('register-note').style.display = 'block';
}

function populateRegCitySelect(){
  const sel = document.getElementById('reg-city');
  if(!sel) return;
  sel.innerHTML = METRO_MANILA_CITIES.map(c=>`<option value="${c}">${c}</option>`).join('');
  sel.value = "Malabon City";
}

function populateRegBarangaySelect(){
  const citySel = document.getElementById('reg-city');
  const sel = document.getElementById('reg-barangay');
  if(!sel || !citySel) return;
  const city = citySel.value || METRO_MANILA_CITIES[0];
  const list = METRO_MANILA_BARANGAYS[city] || [];
  sel.innerHTML = list.map(b=>`<option value="${b}">Brgy. ${b}</option>`).join('');
}

function showAlert(id, type, msg){
  const el = document.getElementById(id);
  el.className = 'form-alert ' + type + ' show';
  el.textContent = msg;
}

async function handleLogin(e){
  e.preventDefault();
  try { const data=await localAdminApi('login',{email:document.getElementById('login-email').value.trim(),password:document.getElementById('login-password').value}); enterConsole(data.user); }
  catch(error){ showAlert('login-alert','error',error.message); }
}

async function handleRegister(e){
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;
  const password2 = document.getElementById('reg-password2').value;
  const city = document.getElementById('reg-city').value;
  const assignedPsgc = document.getElementById('reg-city').selectedOptions[0]?.dataset.psgcId;
  if (pendingAccountType === 'lgu' && !assignedPsgc) { showAlert('register-alert', 'error', 'Choose a PSGC city or municipality.'); return; }
  const barangay = document.getElementById('reg-barangay').value;

  const passwordError = validatePassword(password);
  if(passwordError){
    showAlert('register-alert', 'error', passwordError);
    return;
  }
  if(password !== password2){
    showAlert('register-alert', 'error', 'Passwords do not match.');
    return;
  }
  if(ACCOUNTS.some(a=>a.email.toLowerCase()===email)){
    showAlert('register-alert', 'error', 'An account with this email already exists.');
    return;
  }

  try {
    await localAdminApi('register',{email,password,name,role:pendingAccountType==='creator'?'team':'lgu',psgc_id:assignedPsgc,barangay});
    document.getElementById('pending-barangay-name').textContent=pendingAccountType==='creator'?'BAHABA team access':('Barangay '+barangay+', '+city);
    switchAuth('pending');e.target.reset();
  } catch(error){ showAlert('register-alert','error',error.message); }
}

function handleForgotPassword(e){
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  
  fetch('/forgot-password-notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ email })
  }).catch(()=>{});

  document.getElementById('reset-sent-email').textContent = email;
  switchAuth('reset-sent');
}

async function refreshPermissions() {
  try {
    const res = await fetch('/permissions/refresh', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        enterConsole(data.user);
        return true;
      }
    }
  } catch (e) {
    console.warn('Backend refresh endpoint unreachable, using active session.');
  }
  return false;
}

function enterConsole(acct){
  session = acct;
  session.city = acct.city || "Malabon City";
  if (session.city !== "Metro Manila (All Cities)") {
    activeCity = session.city;
  }
  session.activeBarangay = acct.barangay || Object.keys(getCityBarangays(activeCity))[0];
  logAction("Account", "Sign in", `User signed in to the console.`);
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  applyPermissions();
  populateBarangaySelects();
  
  const initialView = Object.keys(VIEW_MODULE_MAP).find(v => canViewModule(session, VIEW_MODULE_MAP[v])) || 'command';
  go(initialView);
  renderRegistrationRequests();
}

async function signOut(){
  try { await localAdminApi('logout',{}); } catch(error) { showToast(error.message); return; }
  try {
    await fetch('/logout', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
  } catch(e){}

  session = null;
  closeAllDropdowns();
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  switchAuth('login');
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

populateRegCitySelect();
populateRegBarangaySelect();
selectAccountType('lgu');

function applyPermissions(){
  document.getElementById('account-btn-label').textContent = session.org;

  document.querySelectorAll('.sb-link').forEach(link=>{
    const v = link.dataset.view;
    const mod = VIEW_MODULE_MAP[v];
    const allowed = canViewModule(session, mod);
    link.classList.toggle('disabled', !allowed);
    const lock = link.querySelector('[data-lock-icon]');
    if(lock) lock.style.display = allowed ? 'none' : 'inline-flex';
  });

  document.getElementById('tb-bell-badge').textContent = bellCount();
}

function bellCount(){
  if(canAdminModule(session, 'admin_overview')) return Math.min(AUDIT_LOG.length, 99);
  return REPORTS.filter(r=>r.city===currentCity() && r.barangay===session.barangay && r.status==='pending').length;
}

function populateBarangaySelects(){
  const list = scopedBarangays();
  ['evac-barangay-select','reports-barangay-select','ann-barangay-select'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = list.map(b=>`<option value="${b}">Brgy. ${b}</option>`).join('');
    el.value = session.activeBarangay;
    el.disabled = list.length <= 1;
    el.style.display = list.length <= 1 ? 'none' : '';
  });
}

/* ============================================================
   Navigation & View Routing Guard
   ============================================================ */
function go(viewName){
  const modKey = VIEW_MODULE_MAP[viewName];
  if(!canViewModule(session, modKey)) {
    showToast('Permission denied: No access to this module');
    return;
  }
  closeAllDropdowns();
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.sb-link').forEach(l=>l.classList.remove('active'));
  document.querySelector(`.view[data-view="${viewName}"]`).classList.add('active');
  const link = document.querySelector(`.sb-link[data-view="${viewName}"]`);
  if(link) link.classList.add('active');

  const titles = {command:'Command Center', evacuees:'Evacuees', reports:'Reports', announcements:'Announcements', logs:'System Logs & Security'};
  document.getElementById('tb-title').textContent = titles[viewName];
  document.getElementById('tb-scope').textContent = canAdminModule(session, 'admin_overview') ? `All Metro Manila Cities (${activeCity})` : `${session.city} — Brgy. ${session.barangay}`;
  document.getElementById('tb-bell-badge').textContent = bellCount();

  if(viewName==='command') renderCommand();
  if(viewName==='evacuees') renderEvacuees();
  if(viewName==='reports') renderReports();
  if(viewName==='announcements') { fetchAnnouncements(); renderAnnouncements(); }
  if(viewName==='logs') { fetchLogs(); renderLogs(); }
  document.querySelector('.main').scrollTop = 0;
}

function riskMeta(risk){
  return {
    high:{label:'High', cls:'risk-high', fill:'85%'},
    medium:{label:'Medium', cls:'risk-medium', fill:'50%'},
    low:{label:'Low', cls:'risk-low', fill:'22%'},
    none:{label:'None', cls:'risk-none', fill:'6%'}
  }[risk] || {label:'Normal', cls:'risk-none', fill:'6%'};
}

/* ============================================================
   Topbar Dropdowns
   ============================================================ */
function toggleDropdown(which){
  if(which==='module') renderModulePanel();
  if(which==='account') renderAccountPanel();
  if(which==='bell'){ closeAllDropdowns(); return; }
  const panel = document.getElementById(which==='module' ? 'module-panel' : 'account-panel');
  const isOpen = panel.classList.contains('open');
  closeAllDropdowns();
  if(!isOpen) panel.classList.add('open');
}
function closeAllDropdowns(){
  document.getElementById('module-panel').classList.remove('open');
  document.getElementById('account-panel').classList.remove('open');
}
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.tb-dropdown-wrap')) closeAllDropdowns();
});

function renderModulePanel(){
  if(!session) return;
  const panel = document.getElementById('module-panel');
  const available = [
    {id:'command', label:'Operations Module', mod:'admin_overview'},
    {id:'logs', label:'Platform Admin Module', mod:'approval_board_hr'}
  ].filter(m => canViewModule(session, m.mod));

  panel.innerHTML = available.map(m=>
    `<div class="tb-dropdown-item" onclick="go('${m.id}')">${m.label}</div>`
  ).join('');
}

function renderAccountPanel(){
  if(!session) return;
  const panel = document.getElementById('account-panel');
  panel.innerHTML = `
    <div style="display:flex; gap:10px; align-items:center; padding:8px 10px 12px; border-bottom:1px solid var(--line); margin-bottom:6px;">
      <div class="tb-avatar">${session.initials}</div>
      <div><div style="font-weight:700; font-size:13px;">${session.name}</div><div style="font-size:11.5px; color:var(--ink-soft);">${session.org}</div></div>
    </div>
    <div class="tb-dropdown-item" onclick="signOut()" style="color:var(--coral-600);">Switch account</div>
  `;
}

/* ============================================================
   Command Center
   ============================================================ */
function renderCommand(){
  const isFullAdmin = canAdminModule(session, 'admin_overview');
  const cCity = currentCity();
  
  document.getElementById('command-banner').innerHTML = isFullAdmin ? `
    <div class="locked-banner">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="flex-shrink:0;"><path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-4Z"/><path d="M9 12.5l2 2 4-4.5"/></svg>
      <div><b>Full platform access.</b> You are viewing Metro Manila flood management operations. Currently displaying: <b>${cCity}</b>.</div>
    </div>` : '';

  const scope = scopedBarangays();
  const cityData = getCityBarangays(cCity);

  document.getElementById('command-sub').textContent = isFullAdmin
    ? `Live flood status across active barangays in ${cCity}.`
    : `Live flood status for Barangay ${session.barangay}, ${session.city}.`;
  document.getElementById('command-panel-title').textContent = `Barangay Status — ${cCity}`;

  const totals = scope.reduce((acc,b)=>{
    const d = cityData[b] || { affected: 0, centers: [], teams: 0 };
    const centerEvac = (d.centers || []).reduce((s,c)=>s+c.evacuees,0);
    acc.affected += d.affected || 0; 
    acc.evacuees += centerEvac; 
    acc.centers += (d.centers || []).length; 
    acc.teams += d.teams || 0;
    return acc;
  }, {affected:0, evacuees:0, centers:0, teams:0});

  document.getElementById('command-metrics').innerHTML = `
    <div class="metric-card"><div class="metric-num danger">${totals.affected.toLocaleString()}</div><div class="metric-label">Affected Residents</div></div>
    <div class="metric-card"><div class="metric-num">${totals.evacuees.toLocaleString()}</div><div class="metric-label">Current Evacuees</div></div>
    <div class="metric-card"><div class="metric-num">${totals.centers}</div><div class="metric-label">Evacuation Centers</div></div>
    <div class="metric-card"><div class="metric-num">${totals.teams}</div><div class="metric-label">Teams Deployed</div></div>
  `;

  document.getElementById('command-ledger').innerHTML = scope.map(b=>{
    const d = cityData[b] || { risk: "none", affected: 0, centers: [], teams: 0 };
    const rm = riskMeta(d.risk);
    const centerEvac = (d.centers || []).reduce((s,c)=>s+c.evacuees,0);
    const clickable = isFullAdmin;
    return `<div class="ledger-row ${d.risk}" ${clickable ? `style="cursor:pointer;" onclick="jumpToBarangay('${b}')"` : ''}>
      <div>
        <div class="ledger-name">Barangay ${b}</div>
        <div class="ledger-sub">${cCity}</div>
      </div>
      <span class="tide-badge ${rm.cls}" style="margin-left:14px;"><span class="tide-vial"><span class="tide-fill" style="height:${rm.fill};"></span></span>${rm.label}</span>
      <div class="ledger-stats">
        <div class="ledger-stat"><div class="n">${d.affected.toLocaleString()}</div><div class="l">Affected</div></div>
        <div class="ledger-stat"><div class="n">${centerEvac.toLocaleString()}</div><div class="l">Evacuees</div></div>
        <div class="ledger-stat"><div class="n">${d.teams}</div><div class="l">Teams</div></div>
      </div>
    </div>`;
  }).join('');
}

function jumpToBarangay(b){
  session.activeBarangay = b;
  populateBarangaySelects();
  go('evacuees');
}

/* ============================================================
   Evacuees
   ============================================================ */
function renderEvacuees(){
  const sel = document.getElementById('evac-barangay-select');
  const b = sel.value || session.activeBarangay;
  session.activeBarangay = b;
  const cCity = currentCity();

  const canEditCount = canCreateModule(session, 'products');
  document.getElementById('evac-scope-banner').innerHTML = canAdminModule(session, 'products') ? `
    <div class="locked-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>
      <div>Platform admin — updating evacuation centers in <b>${cCity}</b>.</div>
    </div>` : `
    <div class="locked-banner">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-6.5 7-11.5a7 7 0 0 0-14 0C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>
      <div>Managing centers for <b>Barangay ${b}, ${cCity}</b>.</div>
    </div>`;

  const cityData = getCityBarangays(cCity);
  const data = cityData[b] || { centers: [] };
  
  document.getElementById('evac-grid').innerHTML = data.centers.map(c=>{
    const pct = Math.min(100, Math.round((c.evacuees/c.capacity)*100));
    const fillCls = pct>=90 ? 'full' : pct>=65 ? 'warn' : '';
    return `<div class="evac-card">
      <div class="evac-card-head">
        <div><div class="evac-title">${c.name}</div><div class="evac-loc">Brgy. ${b}, ${cCity}</div></div>
      </div>
      <div class="cap-bar-track"><div class="cap-bar-fill ${fillCls}" style="width:${pct}%;"></div></div>
      <div class="evac-nums"><span>${c.evacuees.toLocaleString()} evacuees</span><span>${c.capacity.toLocaleString()} capacity</span></div>
      ${canEditCount ? `
      <div class="evac-edit-row">
        <input type="number" min="0" max="${c.capacity}" value="${c.evacuees}" id="evac-input-${c.id}">
        <button class="btn btn-outline btn-sm" onclick="updateEvacCount('${b}','${c.id}')">Update count</button>
      </div>` : ''}
    </div>`;
  }).join('');
}

function updateEvacCount(b, centerId){
  if (!canCreateModule(session, 'products')) {
    showToast('Permission denied: Cannot modify counts');
    return;
  }
  const cCity = currentCity();
  const input = document.getElementById(`evac-input-${centerId}`);
  const val = Math.max(0, parseInt(input.value || '0', 10));
  const cityData = getCityBarangays(cCity);
  const center = cityData[b].centers.find(c=>c.id===centerId);
  center.evacuees = Math.min(val, center.capacity);
  renderEvacuees();
  logAction("Evacuees", "Update", `Evacuee count for "${center.name}" (Brgy. ${b}, ${cCity}) changed to ${center.evacuees.toLocaleString()}.`);
  showToast(`${center.name} updated — ${center.evacuees.toLocaleString()} evacuees`);
}

/* ============================================================
   Reports
   ============================================================ */
function renderReportsFilterChips(){
  const chips = [
    {id:'pending', label:'Pending'},
    {id:'verified', label:'Verified'},
    {id:'rejected', label:'Rejected'},
    {id:'all', label:'All'}
  ];
  document.getElementById('reports-filter').innerHTML = chips.map(c=>
    `<div class="cfilter ${reportsFilter===c.id?'active':''}" onclick="setReportsFilter('${c.id}')">${c.label}</div>`
  ).join('');
}
function setReportsFilter(id){ reportsFilter = id; renderReports(); }

function renderReports(){
  renderReportsFilterChips();
  const sel = document.getElementById('reports-barangay-select');
  const scopeB = sel.value || session.activeBarangay;
  session.activeBarangay = scopeB;
  const cCity = currentCity();
  
  let list = REPORTS.filter(r => (r.city === cCity || !r.city) && r.barangay === scopeB);
  if(reportsFilter !== 'all') list = list.filter(r=>r.status===reportsFilter);

  const canApprove = canApproveModule(session, 'approval_board');
  const canReject = canRejectModule(session, 'approval_board');

  const holder = document.getElementById('reports-list');
  if(!list.length){
    holder.innerHTML = `<div class="empty-state">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 6L9 17l-5-5"/></svg>
      <div class="t">No reports match this filter yet.</div>
    </div>`;
    return;
  }
  const statusLabel = {pending:'Pending', verified:'Verified', rejected:'Rejected'};
  holder.innerHTML = list.map(r=>{
    const rm = riskMeta(r.severity);
    const sourceTag = r.source === 'nlp'
      ? `<span class="source-tag source-nlp"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="12" rx="2.5"/><path d="M9 3v4M15 3v4M9 13h.01M15 13h.01"/></svg>NLP · ${r.platform}</span>`
      : `<span class="source-tag source-citizen"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg>Resident report</span>`;
    return `<div class="report-row">
      <div class="report-thumb">${r.photo ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="6" width="18" height="14" rx="2.4"/><circle cx="9" cy="12" r="2.4"/><path d="M14 10l3.5 6H7l2.5-4.2z"/></svg>` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`}</div>
      <div class="report-body">
        <div class="report-top">
          <span class="report-loc">Brgy. ${r.barangay} (${cCity})</span>
          <span class="tide-badge ${rm.cls}"><span class="tide-vial"><span class="tide-fill" style="height:${rm.fill};"></span></span>${rm.label}</span>
          <span class="status-pill status-${r.status}">${statusLabel[r.status]}</span>
          ${sourceTag}
        </div>
        <div class="report-meta">${r.source==='nlp' ? 'Detected by NLP System' : `Reported by ${r.reporter}`} · ${r.time}</div>
        <div class="report-desc">${r.desc}</div>
      </div>
      <div class="report-actions">
        ${r.status==='pending' ? `
          ${canReject ? `<button class="btn btn-outline btn-sm" onclick="setReportStatus(${r.id},'rejected')">Reject</button>` : ''}
          ${canApprove ? `<button class="btn btn-primary btn-sm" onclick="setReportStatus(${r.id},'verified')">Verify</button>` : ''}
        ` : (canApprove || canReject) ? `<button class="btn btn-outline btn-sm" onclick="setReportStatus(${r.id},'pending')">Reopen</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function setReportStatus(id, status){
  if (status === 'verified' && !canApproveModule(session, 'approval_board')) {
    showToast('Permission denied: Cannot verify reports');
    return;
  }
  if (status === 'rejected' && !canRejectModule(session, 'approval_board')) {
    showToast('Permission denied: Cannot reject reports');
    return;
  }
  const r = REPORTS.find(x=>x.id===id);
  r.status = status;
  renderReports();
  const actionLabel = status==='verified' ? 'Verify' : status==='rejected' ? 'Reject' : 'Reopen';
  logAction("Reports", actionLabel, `Report #${id} in Barangay ${r.barangay} (${currentCity()}) marked as ${status}.`);
  showToast(status==='verified' ? 'Report verified' : status==='rejected' ? 'Report rejected' : 'Report reopened');
}

/* ============================================================
   Announcements (API Integration & Fallback)
   ============================================================ */
function renderAnnFilterChips(){
  const chips = [
    {id:'all', label:'All'},
    {id:'published', label:'Published'},
    {id:'draft', label:'Drafts'}
  ];
  document.getElementById('ann-filter').innerHTML = chips.map(c=>
    `<div class="cfilter ${annFilter===c.id?'active':''}" onclick="setAnnFilter('${c.id}')">${c.label}</div>`
  ).join('');
}
function setAnnFilter(id){ annFilter = id; renderAnnouncements(); }

async function fetchAnnouncements() {
  try {
    const res = await fetch('/admin/announcements', {
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.announcements)) {
        ANNOUNCEMENTS = data.announcements.map(a => ({
          id: a.id,
          city: a.city || currentCity(),
          barangay: a.barangay || session.activeBarangay,
          title: a.title,
          body: a.content || a.body,
          status: 'published',
          date: new Date(a.created_at).toLocaleString()
        }));
        renderAnnouncements();
      }
    }
  } catch (err) {}
}

function renderAnnouncements(){
  renderAnnFilterChips();
  const sel = document.getElementById('ann-barangay-select');
  const b = sel.value || session.activeBarangay;
  session.activeBarangay = b;
  const cCity = currentCity();
  document.getElementById('ann-sub').textContent = `Publish updates for residents in Barangay ${b}, ${cCity}.`;

  let list = ANNOUNCEMENTS.filter(a => (a.city === cCity || !a.city) && a.barangay === b);
  if(annFilter !== 'all') list = list.filter(a=>a.status===annFilter);
  list = [...list].sort((a,b2)=>b2.id-a.id);

  const canPublish = canApproveModule(session, 'announcements');
  const holder = document.getElementById('ann-list');

  if(!list.length){
    holder.innerHTML = `<div class="empty-state">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
      <div class="t">No announcements yet.</div>
    </div>`;
    return;
  }
  holder.innerHTML = list.map(a=>`
    <div class="ann-row">
      <div class="ann-head">
        <span class="ann-title">${a.title}</span>
        <span class="scope-tag">Brgy. ${a.barangay} (${cCity})</span>
        ${a.status==='draft' ? '<span class="scope-tag draft-tag">Draft</span>' : ''}
      </div>
      <div class="ann-body">${a.body}</div>
      <div class="ann-meta">
        <span>${a.date}</span>
        ${(a.status==='draft' && canPublish) ? `<a style="color:var(--blue-600); font-weight:700; cursor:pointer;" onclick="publishAnnouncement(${a.id})">Publish now</a>` : ''}
      </div>
    </div>`).join('');
}

function openAnnComposer(){
  if (!canCreateModule(session, 'announcements')) {
    showToast('Permission denied: Cannot compose announcements');
    return;
  }
  document.getElementById('ann-composer').style.display = 'block';
}

function closeAnnComposer(){
  document.getElementById('ann-composer').style.display = 'none';
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-body').value = '';
}

async function saveAnnouncement(status){
  if (status === 'published' && !canApproveModule(session, 'announcements')) {
    showToast('Permission denied: Cannot publish');
    return;
  }
  const title = document.getElementById('ann-title').value.trim();
  const body = document.getElementById('ann-body').value.trim();
  const b = session.activeBarangay;
  const cCity = currentCity();
  if(!title || !body){ showToast('Add a title and message first'); return; }

  try {
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', body);
    formData.append('author', session.name);
    formData.append('city', cCity);
    formData.append('priority_level_id', 1);
    formData.append('branch_ids[]', 1);

    await fetch('/admin/announcements', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      credentials: 'include',
      body: formData
    });
  } catch (e) {}

  ANNOUNCEMENTS.unshift({ id: Date.now(), city: cCity, barangay:b, title, body, status, date:'Just now' });
  closeAnnComposer();
  renderAnnouncements();
  logAction("Announcements", status==='published' ? 'Publish' : 'Save draft', `Announcement "${title}" ${status==='published' ? 'published' : 'saved as draft'} for Barangay ${b}, ${cCity}.`);
  showToast(status==='published' ? 'Announcement published' : 'Draft saved');
}

function publishAnnouncement(id){
  if (!canApproveModule(session, 'announcements')) {
    showToast('Permission denied: Cannot publish');
    return;
  }
  const a = ANNOUNCEMENTS.find(x=>x.id===id);
  a.status = 'published';
  renderAnnouncements();
  logAction("Announcements", "Publish", `Announcement "${a.title}" published for Barangay ${a.barangay}, ${currentCity()}.`);
  showToast('Announcement published');
}

/* ============================================================
   System Logs & Security (API Integration & Filtering)
   ============================================================ */
function logAction(module, action, description){
  if(!session) return;
  AUDIT_LOG.unshift({
    time:"Just now",
    user:`${session.name} (${session.org})`,
    module, action, description,
    ip: session.ip,
    status:"success"
  });
}

function applyLogFilters(){ 
  fetchLogs();
  renderLogs(); 
}

function clearLogFilters(){
  document.getElementById('logs-search').value = '';
  document.getElementById('logs-module-filter').value = 'all';
  document.getElementById('logs-status-filter').value = 'all';
  document.getElementById('logs-start-date').value = '';
  document.getElementById('logs-end-date').value = '';
  fetchLogs();
  renderLogs();
}

async function fetchLogs() {
  const q = document.getElementById('logs-search')?.value.trim() || '';
  const moduleF = document.getElementById('logs-module-filter')?.value || 'all';
  const statusF = document.getElementById('logs-status-filter')?.value || 'all';
  const startDate = document.getElementById('logs-start-date')?.value || '';
  const endDate = document.getElementById('logs-end-date')?.value || '';

  const params = new URLSearchParams();
  if (q) params.append('search', q);
  if (moduleF !== 'all') params.append('module', moduleF);
  if (statusF !== 'all') params.append('status', statusF);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  try {
    const res = await fetch(`/admin/logs?${params.toString()}`, {
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.logs?.data) {
        AUDIT_LOG = data.logs.data.map(l => ({
          time: new Date(l.created_at).toLocaleString(),
          user: l.user ? l.user.name : 'System',
          module: l.module,
          action: l.action,
          description: l.description,
          ip: l.ip_address || 'N/A',
          status: l.status || 'success'
        }));
        renderLogs();
      }
    }
  } catch (err) {}
}

function renderLogs(){
  const q = document.getElementById('logs-search').value.trim().toLowerCase();
  const moduleF = document.getElementById('logs-module-filter').value;
  const statusF = document.getElementById('logs-status-filter').value;

  let list = AUDIT_LOG.filter(l=>{
    if(moduleF !== 'all' && l.module !== moduleF) return false;
    if(statusF !== 'all' && l.status !== statusF) return false;
    if(q && !(l.user.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))) return false;
    return true;
  });

  const tbody = document.getElementById('logs-tbody');
  const empty = document.getElementById('logs-empty');
  if(!list.length){
    tbody.innerHTML = '';
    empty.innerHTML = `<div class="empty-state">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 6L9 17l-5-5"/></svg>
      <div class="t">No log entries match this filter.</div>
    </div>`;
    return;
  }
  empty.innerHTML = '';
  tbody.innerHTML = list.map(l=>`
    <tr>
      <td class="mono" style="white-space:nowrap; color:var(--ink-soft);">${l.time}</td>
      <td style="white-space:nowrap; font-weight:600;">${l.user}</td>
      <td>${l.module}<br><span class="log-desc-link">${l.action}</span></td>
      <td style="max-width:340px;">${l.description}</td>
      <td><span class="log-ip">${l.ip}</span></td>
      <td><span class="log-status">${l.status.toUpperCase()}</span></td>
    </tr>`).join('');
}

function exportLogs(){
  if (!canAdminModule(session, 'approval_board_hr')) {
    showToast('Permission denied: Cannot export logs');
    return;
  }

  const q = document.getElementById('logs-search')?.value.trim() || '';
  const moduleF = document.getElementById('logs-module-filter')?.value || 'all';
  const statusF = document.getElementById('logs-status-filter')?.value || 'all';
  const startDate = document.getElementById('logs-start-date')?.value || '';
  const endDate = document.getElementById('logs-end-date')?.value || '';

  const params = new URLSearchParams();
  if (q) params.append('search', q);
  if (moduleF !== 'all') params.append('module', moduleF);
  if (statusF !== 'all') params.append('status', statusF);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);

  window.open(`/admin/logs/export?${params.toString()}`, '_blank');
  showToast('Logs export started');
}

/* ============================================================
   Notifications & Toasts
   ============================================================ */
let toastTimer;
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 2400);
}
// BAHABA_PSGC_REGISTRATION_V1: registration requests only; never expands active ACLs.
fetch('./psgc-registry.json').then(r => { if (!r.ok) throw new Error('Registry unavailable'); return r.json() }).then(registry => {
  const select = document.getElementById('reg-city');
  if (!select) return;
  const search = document.createElement('input');
  search.type = 'search'; search.placeholder = 'Search region, province, city or municipality';
  search.setAttribute('aria-label', 'Search PSGC location assignment');
  select.before(search);
  const notice = document.createElement('small');
  notice.textContent = 'Assigned scope requests require approval. Registry: ' + registry.status;
  select.after(notice);
  const render = () => {
    const query = search.value.toLowerCase().trim().split(/\s+/);
    const matches = registry.locations.filter(l => query.every(q => (l.name+' '+l.region).toLowerCase().includes(q))).slice(0,100);
    select.replaceChildren(new Option('Select city or municipality', ''));
    for (const l of matches) { const option = new Option(l.name, l.name); option.dataset.psgcId = l.id; select.add(option); }
    populateRegBarangaySelect();
  };
  search.addEventListener('input', render);
  // Barangay data outside the prototype's verified dictionary is entered explicitly.
  populateRegBarangaySelect = function () {
    const field = document.getElementById('reg-barangay');
    if (field.tagName !== 'INPUT') {
      const input = document.createElement('input'); input.id = field.id;
      input.placeholder = 'Barangay name (verified during approval)'; input.required = true;
      field.replaceWith(input);
    } else field.value = '';
  };
  render();
}).catch(() => {
  const select = document.getElementById('reg-city');
  if (select) select.replaceChildren(new Option('PSGC registry unavailable; retry later', ''));
});

// Persisted local preview authentication and BAHABA team registration review.
let localAdminCsrf='';
async function localAdminApi(action,body){
  if(body && !localAdminCsrf) { const session=await localAdminApi('session');localAdminCsrf=session.csrf; }
  const response=await fetch('./local-api.php?action='+action,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-CSRF-Token':localAdminCsrf}:{},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();if(data.csrf)localAdminCsrf=data.csrf;if(!response.ok)throw new Error(data.error||'Request failed.');return data;
}
async function renderRegistrationRequests(){
  let panel=document.getElementById('registration-requests');
  if(!panel){panel=document.createElement('div');panel.id='registration-requests';panel.className='panel';panel.style.cssText='padding:20px;margin-bottom:20px';document.getElementById('view-logs').prepend(panel);}
  panel.replaceChildren();panel.hidden=session?.role!=='team';if(panel.hidden)return;
  const title=document.createElement('h3');title.textContent='Registration requests';panel.append(title);
  const refresh=document.createElement('button');refresh.type='button';refresh.className='btn btn-outline btn-sm';refresh.textContent='Refresh requests';refresh.onclick=renderRegistrationRequests;panel.append(refresh);
  try {
    const {requests}=await localAdminApi('requests');
    if(!requests.length){const empty=document.createElement('p');empty.textContent='No pending registration requests.';panel.append(empty);}
    for(const request of requests){
      const row=document.createElement('div');row.style.cssText='padding:16px 0;border-bottom:1px solid #dbe4ee';
      const name=document.createElement('strong');name.textContent=request.name+' — '+request.email;
      const details=document.createElement('p');details.textContent=(request.role==='team'?'BAHABA team access':request.city+', '+request.barangay)+' · '+(request.assigned_psgc_id||'Team scope');
      row.append(name,details);
      for(const [status,label] of [['active','Approve'],['rejected','Reject']]){const button=document.createElement('button');button.type='button';button.className='btn btn-outline btn-sm';button.textContent=label;button.style.marginRight='8px';button.onclick=async()=>{button.disabled=true;try{await localAdminApi('review',{id:request.id,status});await renderRegistrationRequests();}catch(error){showToast(error.message);button.disabled=false;}};row.append(button);}
      panel.append(row);
    }
  }catch(error){const message=document.createElement('p');message.textContent=error.message;panel.append(message);}
}
localAdminApi('session').then(data=>{if(data.user)enterConsole(data.user);}).catch(error=>console.warn(error.message));
