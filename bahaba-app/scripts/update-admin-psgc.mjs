// Run with an explicit BAHABA-ADMIN directory. Existing account scopes/ACLs are preserved.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const admin = resolve(process.argv[2])
const app = fileURLToPath(new URL('..', import.meta.url))
const target = resolve(admin, 'App.js')
let code = readFileSync(target, 'utf8')
if (!code.includes('BAHABA_PSGC_REGISTRATION_V1')) {
  code = code.replace("  const city = document.getElementById('reg-city').value;", "  const city = document.getElementById('reg-city').value;\n  const assignedPsgc = document.getElementById('reg-city').selectedOptions[0]?.dataset.psgcId;\n  if (pendingAccountType === 'lgu' && !assignedPsgc) { showAlert('register-alert', 'error', 'Choose a PSGC city or municipality.'); return; }")
  code = code.replace('org:`Brgy. ${barangay}, ${city}`, barangay, city,', 'org:`Brgy. ${barangay}, ${city}`, barangay, city, assigned_psgc_id: assignedPsgc,')
  code += `
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
    const query = search.value.toLowerCase().trim().split(/\\s+/);
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
`
  writeFileSync(target, code)
}
copyFileSync(resolve(app, 'psgc-registry.json'), resolve(admin, 'psgc-registry.json'))
const html = resolve(admin, 'index.html')
writeFileSync(html, readFileSync(html, 'utf8').replace('src="app.js"', 'src="App.js"'))
console.log('Updated pending LGU registration only; existing scopes and ACLs retained.')
