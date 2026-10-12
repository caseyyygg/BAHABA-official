(function () {
  const view = document.getElementById('view-users');
  if (!view) return;
  const pages = { admin: 1, app: 1 };
  const pageSizes = { admin: 10, app: 10 };
  const originalRender = window.renderUserManager;
  function locationName(user) {
    const location = locationForId(user.assigned_location);
    return user.role === 'platform-admin' ? 'All supported locations' : [location?.name, location?.city, user.location, user.city].filter(Boolean).join(' ');
  }
  for (const kind of ['admin', 'app']) {
    const search = document.getElementById(`${kind}-user-search`);
    search.setAttribute('aria-label', `Search ${kind} users by name or email`);
    const panel = search.closest('.panel'); panel.classList.add('user-directory-panel');
    const controls = search.parentElement; controls.classList.add('user-directory-filters');
    const role = document.createElement('select'); role.id = `${kind}-user-role-filter`;
    role.setAttribute('aria-label', `Filter ${kind} users by role`);
    role.add(new Option('All roles', ''));
    for (const [name, value] of kind === 'admin' ? [['Platform admin', 'platform-admin'], ['LGU / Barangay admin', 'lgu-admin']] : [['App user', 'app-user']]) role.add(new Option(name, value));
    const city = document.createElement('input'); city.type = 'search'; city.id = `${kind}-user-city-filter`; city.placeholder = 'Search city or location'; city.setAttribute('aria-label', `Search ${kind} users by city or location`);
    controls.append(role, city);
    const status = document.getElementById(`${kind}-user-status-filter`); status.setAttribute('aria-label', `Filter ${kind} users by status`);
    for (const input of [search, role, city, status]) {
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', () => { pages[kind] = 1; }, true);
    }
    role.addEventListener('change', render); city.addEventListener('input', render);
    const footer = document.createElement('div'); footer.className = 'user-directory-footer';
    const count = document.createElement('span'); count.id = `${kind}-user-page-count`; count.setAttribute('role', 'status');
    const actions = document.createElement('div'); actions.className = 'user-directory-pagination';
    const size = document.createElement('select'); size.setAttribute('aria-label', `${kind} users per page`);
    for (const value of [10, 20, 50]) size.add(new Option(`${value} per page`, value));
    size.onchange = () => { pageSizes[kind] = Number(size.value); pages[kind] = 1; render(); };
    const previous = document.createElement('button'); previous.id = `${kind}-user-prev`; previous.className = 'btn btn-outline btn-sm'; previous.type = 'button'; previous.textContent = 'Previous'; previous.onclick = () => { pages[kind]--; render(); };
    const page = document.createElement('span'); page.id = `${kind}-user-page`;
    const next = document.createElement('button'); next.id = `${kind}-user-next`; next.className = 'btn btn-outline btn-sm'; next.type = 'button'; next.textContent = 'Next'; next.onclick = () => { pages[kind]++; render(); };
    actions.append(size, previous, page, next); footer.append(count, actions); panel.append(footer);
  }
  window.userManagerPage = function (users, kind) {
    const role = document.getElementById(`${kind}-user-role-filter`).value;
    const city = document.getElementById(`${kind}-user-city-filter`).value.trim().toLowerCase();
    const filtered = users.filter(user => {
      const userRole = kind === 'app' ? 'app-user' : user.role || (user.acls?.admin_overview === 'full' ? 'platform-admin' : 'lgu-admin');
      return (!role || role === userRole) && (!city || locationName(user).toLowerCase().includes(city));
    });
    const size = pageSizes[kind], totalPages = Math.max(1, Math.ceil(filtered.length / size));
    pages[kind] = Math.min(totalPages, Math.max(1, pages[kind]));
    const start = (pages[kind] - 1) * size;
    document.getElementById(`${kind}-user-page-count`).textContent = filtered.length ? `${start + 1}–${Math.min(start + size, filtered.length)} of ${filtered.length} users` : 'No users match these filters';
    document.getElementById(`${kind}-user-page`).textContent = `Page ${pages[kind]} of ${totalPages}`;
    document.getElementById(`${kind}-user-prev`).disabled = pages[kind] === 1;
    document.getElementById(`${kind}-user-next`).disabled = pages[kind] === totalPages;
    queueMicrotask(() => {
      const body = document.getElementById(`user-manager-${kind}-table-body`);
      if (!body.children.length) { const row = body.insertRow(); const cell = row.insertCell(); cell.colSpan = 6; cell.className = 'user-directory-empty'; cell.textContent = 'No users found. Try another name, role, city, or status.'; }
    });
    return filtered.slice(start, start + size);
  };
  function render() { originalRender(); }
  window.renderUserManager = render;

  const location = document.getElementById('new-user-location');
  const role = document.getElementById('new-user-role');
  const search = document.createElement('input'); search.type = 'search'; search.id = 'new-user-location-search'; search.placeholder = 'Search city, municipality, or province'; search.setAttribute('aria-label', 'Search assigned locations');
  const picker = document.createElement('details'); picker.className = 'assigned-location-picker';
  const summary = document.createElement('summary'); summary.id = 'new-user-location-picker'; summary.setAttribute('aria-labelledby', 'new-user-location-label');
  const selectedName = document.createElement('span'); selectedName.className = 'assigned-location-value';
  const chevron = document.createElement('span'); chevron.className = 'assigned-location-chevron'; chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄';
  summary.append(selectedName, chevron);
  const menu = document.createElement('div'); menu.className = 'assigned-location-menu';
  const optionsList = document.createElement('div'); optionsList.className = 'assigned-location-options'; optionsList.setAttribute('role', 'listbox'); optionsList.setAttribute('aria-label', 'Supported locations');
  menu.append(search, optionsList);
  picker.append(summary, location, menu);
  location.hidden = true; location.tabIndex = -1; location.setAttribute('aria-hidden', 'true');
  location.before(picker);
  const hint = document.createElement('small'); hint.className = 'user-location-hint'; picker.after(hint);
  const password = document.getElementById('new-user-password'); password.type = 'password'; password.autocomplete = 'new-password'; password.minLength = 8;
  for (const id of ['name', 'email', 'role', 'location', 'password']) {
    const input = document.getElementById('new-user-' + id); input.closest('.field').querySelector('label').htmlFor = input.id;
  }
  const locationLabel = location.closest('.field').querySelector('label');
  locationLabel.id = 'new-user-location-label'; locationLabel.removeAttribute('for');
  summary.addEventListener('click', event => { if (role.value === 'platform-admin') event.preventDefault(); });
  function syncLocation() {
    const isPlatform = role.value === 'platform-admin';
    const previous = location.value;
    location.disabled = isPlatform; location.required = !isPlatform; search.disabled = isPlatform;
    picker.classList.toggle('disabled', isPlatform);
    picker.setAttribute('aria-disabled', String(isPlatform));
    const query = search.value.trim().toLowerCase();
    const options = [new Option(isPlatform ? 'All supported locations' : 'Choose an assigned location', isPlatform ? 'all' : '')];
    if (!isPlatform) {
      const all = new Option('All supported locations — Platform Admin only', 'all'); all.disabled = true; options.push(all);
      const matches = SUPPORTED_LOCATIONS.filter(item => item.id === previous || [item.name, item.city, item.province, item.region, ...(item.aliases || [])].filter(Boolean).join(' ').toLowerCase().includes(query));
      for (const item of matches) options.push(new Option(item.name, item.id));
      optionsList.replaceChildren();
      for (const item of matches) {
        const option = document.createElement('button'); option.type = 'button'; option.className = 'assigned-location-option'; option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(item.id === previous)); option.textContent = item.name;
        option.addEventListener('click', () => { location.value = item.id; location.dispatchEvent(new Event('change', { bubbles: true })); search.value = ''; picker.open = false; syncLocation(); });
        optionsList.append(option);
      }
      if (!matches.length) { const empty = document.createElement('p'); empty.className = 'assigned-location-empty'; empty.textContent = 'No matching locations. Try another search.'; optionsList.append(empty); }
      hint.textContent = `${matches.length} matching locations. Search or scroll to choose one.`;
    } else hint.textContent = 'Platform admins can manage all supported locations.';
    const signature = options.map(option => `${option.value}:${option.textContent}:${option.disabled}`).join('|');
    const existing = [...location.options].map(option => `${option.value}:${option.textContent}:${option.disabled}`).join('|');
    if (signature !== existing) location.replaceChildren(...options);
    location.value = isPlatform ? 'all' : SUPPORTED_LOCATIONS.some(item => item.id === previous) ? previous : '';
    selectedName.textContent = isPlatform ? 'All supported locations' : SUPPORTED_LOCATIONS.find(item => item.id === location.value)?.name || 'Choose an assigned location';
  }
  new MutationObserver(syncLocation).observe(location, { childList: true });
  role.addEventListener('change', () => { search.value = ''; syncLocation(); }); search.addEventListener('input', syncLocation);
  document.getElementById('new-user-form').addEventListener('reset', () => setTimeout(() => { search.value = ''; syncLocation(); }, 0));
  syncLocation();
})();
