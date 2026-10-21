(function () {
  const view = document.getElementById('view-nlp-api');
  if (!view) return;
  const grid = view.querySelector('.collector-status-grid');
  const description = document.getElementById('nlp-login-setup');
  const note = grid.nextElementSibling;
  description.textContent = 'Connect an account using the hosted browser. Complete platform verification, then save the account for this LGU.';
  note.textContent = 'Saved accounts require a running collector for monitoring. Browser sessions on test hosting may be lost after a restart.';
  const style = document.createElement('style');
  style.textContent = `.social-login-dialog{width:min(1060px,95vw);max-height:95vh;padding:20px;border:1px solid #dee7f1;border-radius:18px;color:#0f1f33;font:13px/1.6 Inter,system-ui,sans-serif}.social-login-dialog::backdrop{background:#071b30aa}.social-login-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px}.social-login-dialog h3{font:600 16px Inter,system-ui,sans-serif}.social-login-dialog img{display:block;width:100%;margin:16px 0;border:1px solid #dee7f1;border-radius:12px;cursor:pointer}.social-credential-controls{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;gap:8px;align-items:end}.social-credential-controls label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600}.social-login-dialog input{box-sizing:border-box;min-width:0;min-height:40px;padding:8px 12px;border:1px solid #dee7f1;border-radius:10px;font:inherit}.social-login-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.social-login-controls input{flex:1}.social-login-dialog .btn{min-height:38px;border-radius:10px;font-size:12px}.social-login-feedback{margin:12px 0;color:#57697f}.social-account-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}.social-account-actions .btn{flex:1}@media(max-width:680px){.social-credential-controls{grid-template-columns:minmax(0,1fr) auto}.social-credential-controls label:nth-of-type(2){grid-column:1}}`;
  document.head.append(style);
  let csrf = '', generation = 0, active = null, busy = false;
  const dialog = document.createElement('dialog');
  dialog.className = 'social-login-dialog';
  dialog.innerHTML = `<header><h3>Private social sign-in</h3><button class="btn btn-outline" type="button" data-op="close">Close</button></header><p>Use Fill email to select the username field, then Next/Enter if required, followed by Fill password. Threads may ask you to continue with Instagram. Auto sign in is available for Facebook. Complete any CAPTCHA or verification yourself. Credentials are cleared after sending.</p><img alt="Private platform login browser" tabindex="0" hidden><div class="social-credential-controls"><label>Email, phone, or username<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Email, phone, or username" placeholder="Email, phone, or username"></label><button type="button" class="btn btn-outline" data-op="email">Fill email</button><label>Password<input type="password" autocomplete="new-password" aria-label="Social account password" placeholder="Password"></label><button type="button" class="btn btn-outline" data-op="password">Fill password</button><button type="button" class="btn btn-primary" data-op="autologin" hidden>Auto sign in</button></div><div class="social-login-controls"><input type="password" autocomplete="off" aria-label="Verification code or other text" placeholder="Verification code or other text"><button type="button" class="btn btn-outline" data-op="type">Send text</button><button type="button" class="btn btn-outline" data-op="enter">Enter</button><button type="button" class="btn btn-outline" data-op="tab">Next field</button><button type="button" class="btn btn-outline" data-op="clear">Clear field</button><button type="button" class="btn btn-outline" data-op="up">Scroll up</button><button type="button" class="btn btn-outline" data-op="down">Scroll down</button><button type="button" class="btn btn-outline" data-op="frame">Refresh view</button><button type="button" class="btn btn-primary" data-op="save">Save account</button></div><p class="social-login-feedback" role="status"></p>`;
  document.body.append(dialog);
  const image = dialog.querySelector('img'), inputs = dialog.querySelectorAll('input'), input = inputs[2], emailInput = inputs[0], passwordInput = inputs[1], feedback = dialog.querySelector('[role=status]');
  async function request(action, payload = {}, location = currentAdminLocationId()) {
    const write = action === 'social-browser';
    const url = ADMIN_API_URL + (write ? '' : '?' + new URLSearchParams({ action, location }));
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...(write ? {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ ...payload, action, location_id: location }),
    } : {}) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) throw Error('Your BANTALA admin session expired. Sign in again, then reopen Social accounts.');
    if (!response.ok) throw Error(data.error || 'Social browser request failed.');
    return data;
  }
  function platformLoginUrl(platform) {
    return { Facebook: 'https://www.facebook.com/login/', X: 'https://x.com/i/flow/login', Threads: 'https://www.threads.com/login' }[platform];
  }
  function openPlatformLogin(platform, help) {
    const tab = window.open(platformLoginUrl(platform), '_blank');
    if (tab) tab.opener = null;
    help.textContent = tab ? `Opened ${platform} in a new tab. Sign in there; this does not connect the collector.` : 'Your browser blocked the new tab. Allow pop-ups for this site, then try again.';
  }
  async function refreshAccounts() {
    const own = ++generation, location = currentAdminLocationId();
    if (!session || !location) return;
    grid.replaceChildren();
    try {
      const data = await request('social-accounts', {}, location);
      if (own !== generation || location !== currentAdminLocationId()) return;
      csrf = data.csrf;
      for (const platform of ['Facebook', 'X', 'Threads']) {
        const connected = data.accounts.find(a => a.platform === platform)?.connected;
        const card = document.createElement('div'); card.className = 'collector-status-card';
        const title = document.createElement('strong'); title.textContent = platform;
        const status = document.createElement('span'); status.textContent = connected ? 'Session saved for this LGU' : 'Not connected';
        const help = document.createElement('small');
        help.textContent = connected ? 'A browser session is saved for this LGU. Monitoring requires the collectors to be online.' : data.available ? 'Sign in using the hosted browser, complete verification, then save this account.' : 'The hosted browser is not configured. Opening a platform tab does not connect the collector.';
        const actions = document.createElement('div'); actions.className = 'social-account-actions';
        const login = document.createElement('button'); login.className = 'btn btn-outline'; login.type = 'button';
        login.textContent = data.available ? `Connect ${platform}` : `Open ${platform} sign in`;
        login.disabled = data.available && !data.can_edit;
        login.onclick = () => data.available ? start(platform, location) : openPlatformLogin(platform, help);
        actions.append(login);
        if (connected) {
          const logout = document.createElement('button'); logout.className = 'btn btn-outline'; logout.type = 'button'; logout.textContent = 'Disconnect'; logout.disabled = !data.can_edit;
          logout.onclick = async () => {
            if (!confirm(`Disconnect ${platform} for this LGU?`)) return;
            logout.disabled = true;
            try { await request('social-browser', { platform, operation: 'disconnect' }, location); await refreshAccounts(); }
            catch (error) { help.textContent = error.message; logout.disabled = false; }
          }; actions.append(logout);
        }
        card.append(title, status, help, actions); grid.append(card);
      }
    } catch (error) {
      for (const platform of ['Facebook', 'X', 'Threads']) {
        const card = document.createElement('div'); card.className = 'collector-status-card';
        const title = document.createElement('strong'); title.textContent = platform;
        const status = document.createElement('span'); status.textContent = 'Collector status unavailable';
        const help = document.createElement('small'); help.textContent = `${error.message} You can still open the platform sign-in page; it will not connect the collector.`;
        const actions = document.createElement('div'); actions.className = 'social-account-actions';
        const login = document.createElement('button'); login.className = 'btn btn-outline'; login.type = 'button'; login.textContent = `Open ${platform} sign in`;
        login.onclick = () => openPlatformLogin(platform, help);
        actions.append(login); card.append(title, status, help, actions); grid.append(card);
      }
    }
  }
  async function operate(operation, extra = {}) {
    if (!active || busy) return;
    busy = true;
    dialog.querySelectorAll('button,input').forEach(el => { el.disabled = true; });
    feedback.textContent = 'Updating private browser…';
    try {
      const data = await request('social-browser', { platform: active.platform, operation, ...extra }, active.location);
      if (data.image) { image.src = 'data:image/jpeg;base64,' + data.image; image.hidden = false; }
      feedback.textContent = data.login_hint || 'Complete sign-in in the platform view, then choose Save account.';
      if (data.navigation_status >= 400) feedback.textContent = 'The platform refused this hosted browser. Try Refresh view; saving is available only after successful sign-in.';
      if (data.connected) inputs.forEach(field => { field.value = ''; });
      if (data.connected) { active = null; image.removeAttribute('src'); input.value = ''; dialog.close(); await refreshAccounts(); }
    } catch (error) { feedback.textContent = error.message; }
    finally { busy = false; dialog.querySelectorAll('button,input').forEach(el => { el.disabled = false; }); }
  }
  async function start(platform, location) {
    active = { platform, location }; image.hidden = true; inputs.forEach(field => { field.value = ''; });
    dialog.querySelector('[data-op="autologin"]').hidden = platform !== 'Facebook';
    dialog.querySelector('h3').textContent = `Sign in to ${platform}`;
    dialog.showModal(); await operate('start');
  }
  async function close() {
    if (busy) return;
    const previous = active; active = null;
    image.removeAttribute('src'); inputs.forEach(field => { field.value = ''; }); dialog.close();
    if (previous) try { await request('social-browser', { platform: previous.platform, operation: 'cancel' }, previous.location); } catch { /* Server expires abandoned browsers automatically. */ }
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  image.onclick = event => { const rect = image.getBoundingClientRect(); operate('click', { x: (event.clientX - rect.left) * 1000 / rect.width, y: (event.clientY - rect.top) * 720 / rect.height }); };
  image.onkeydown = event => { if (['Enter', 'Tab', 'Backspace', 'Escape'].includes(event.key)) { event.preventDefault(); operate('key', { key: event.key }); } };
  dialog.querySelectorAll('[data-op]').forEach(button => { button.onclick = async () => {
    const op = button.dataset.op;
    if (op === 'close') return close();
    if (op === 'email' || op === 'password') {
      const field = op === 'email' ? emailInput : passwordInput;
      const text = field.value; field.value = '';
      if (!text) { feedback.textContent = `Enter the ${op === 'email' ? 'email or username' : 'password'} first.`; return; }
      return operate(op === 'email' ? 'fill-identifier' : 'fill-password', { text });
    }
    if (op === 'autologin') {
      const email = emailInput.value.trim(), password = passwordInput.value;
      emailInput.value = ''; passwordInput.value = '';
      if (!email || !password) { feedback.textContent = 'Enter both your email and password first.'; return; }
      return operate('credentials', { text: JSON.stringify({ email, password }) });
    }
    if (op === 'type') { const text = input.value; input.value = ''; return operate('type', { text }); }
    if (op === 'clear') { await operate('key', { key: 'ControlOrMeta+A' }); return operate('key', { key: 'Backspace' }); }
    if (op === 'enter' || op === 'tab') return operate('key', { key: op === 'enter' ? 'Enter' : 'Tab' });
    if (op === 'up' || op === 'down') return operate('scroll', { delta: op === 'up' ? -500 : 500 });
    return operate(op);
  }; });
  const original = window.renderNlpConnections;
  window.renderNlpConnections = async function (...args) {
    await Promise.allSettled([original.apply(this, args), refreshAccounts()]);
    if (!session) return;
    const location = currentAdminLocationId(), monitor = document.getElementById('nlp-connections-status');
    const health = nlpServiceHealth?.lgu_social_collectors || {};
    document.getElementById('nlp-connections-message').textContent = 'Monitoring for the selected LGU’s saved accounts. Collection starts after the hosted browser service and LGU collectors are configured.';
    monitor.replaceChildren();
    for (const platform of ['Facebook', 'X', 'Threads']) {
      const state = health[location + ':' + platform];
      const card = document.createElement('div'); card.className = 'collector-status-card';
      const title = document.createElement('strong'); title.textContent = platform;
      const status = document.createElement('span'); status.textContent = !state ? 'Awaiting LGU collector setup' : state.last_error ? 'Needs attention' : !state.connected ? 'Waiting for account sign-in' : state.running ? 'Collecting posts' : 'Waiting for next poll';
      const detail = document.createElement('small'); detail.textContent = state?.last_error || (state ? `${state.posts_processed || 0} posts analyzed by this LGU collector this session.` : 'Shared collector activity does not indicate that this LGU has connected an account.');
      card.append(title, status, detail); monitor.append(card);
    }
  };
})();

(function () {
  const view = document.getElementById('view-nlp-api');
  if (!view) return;
  const panels = [...view.querySelectorAll(':scope > .panel')];
  const tabs = document.createElement('div'); tabs.id = 'nlp-account-tabs'; tabs.style.cssText = 'display:flex;gap:8px;margin:16px 0';
  const monitor = document.createElement('button'), posts = document.createElement('button');
  for (const button of [monitor, posts]) { button.type = 'button'; button.className = 'btn btn-outline'; }
  monitor.textContent = 'Monitor & accounts'; posts.textContent = 'Posts'; tabs.append(monitor, posts);
  view.querySelector('.view-head')?.after(tabs);
  const panel = document.createElement('section'); panel.className = 'panel'; panel.hidden = true;
  panel.innerHTML = '<div class="panel-head"><h3>All collected posts</h3></div><div class="panel-body"><p>Flood and non-flood posts appear here. Only distinct, located flood posts count toward an event.</p><p role="status"></p><div style="overflow:auto"><table class="data-table"><thead><tr><th>Platform</th><th>Post</th><th>Classification</th><th>Location</th></tr></thead><tbody></tbody></table></div><div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="btn btn-outline" data-page="previous">Previous</button><button type="button" class="btn btn-outline" data-page="next">Next</button></div></div>';
  view.append(panel);
  let offset = 0, generation = 0;
  async function refresh() {
    const own = ++generation, scope = currentAdminLocationId();
    const status = panel.querySelector('[role=status]'); status.textContent = 'Loading posts…';
    try {
      const query = new URLSearchParams({ action: 'nlp-posts', location: scope, limit: '50', offset: String(offset) });
      const response = await fetch(ADMIN_API_URL + '?' + query, { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.events) || !data.pagination) throw Error(data.error || 'Posts requires the updated PHP API.');
      if (own !== generation || scope !== currentAdminLocationId()) return;
      const body = panel.querySelector('tbody'); body.replaceChildren();
      for (const event of data.events) {
        const row = document.createElement('tr');
        for (const text of [event.source, event.post_text, event.classification, [event.city, event.barangay].filter(Boolean).join(', ') || 'Location unresolved']) {
          const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
        }
        try {
          const url = new URL(event.post_url);
          if (url.protocol === 'https:') { const link = document.createElement('a'); link.href = url.href; link.textContent = ' Open original'; link.target = '_blank'; link.rel = 'noopener noreferrer'; row.children[1].append(link); }
        } catch { /* A post without a usable URL remains visible. */ }
        body.append(row);
      }
      status.textContent = `${data.pagination.total} collected posts · Page ${Math.floor(offset / 50) + 1}`;
      panel.querySelector('[data-page=previous]').disabled = offset === 0;
      panel.querySelector('[data-page=next]').disabled = offset + 50 >= data.pagination.total;
    } catch (error) { status.textContent = error.message; }
  }
  monitor.onclick = () => { panel.hidden = true; for (const item of panels) item.hidden = false; };
  posts.onclick = () => { for (const item of panels) item.hidden = true; panel.hidden = false; offset = 0; refresh(); };
  panel.querySelector('[data-page=previous]').onclick = () => { offset = Math.max(0, offset - 50); refresh(); };
  panel.querySelector('[data-page=next]').onclick = () => { offset += 50; refresh(); };
})();

// Monitor the selected LGU's saved-account collectors instead of shared logins.
(function () {
  function scopedStates(health) {
    if (!health || !Object.hasOwn(health, 'lgu_social_collectors')) return null;
    const scope = currentAdminLocationId();
    return ['X', 'Facebook', 'Threads'].map(platform => ({
      platform, state: health.lgu_social_collectors?.[scope + ':' + platform],
    }));
  }
  const previousRender = window.renderCollectorStatuses;
  window.renderCollectorStatuses = function (id, health) {
    const entries = scopedStates(health);
    if (!entries) return previousRender(id, health);
    const grid = document.getElementById(id);
    if (!grid) return;
    grid.replaceChildren(...entries.map(({ platform, state }) => {
      const card = document.createElement('div'); card.className = 'collector-status-card';
      const title = document.createElement('strong'); title.textContent = platform;
      const label = document.createElement('span');
      label.textContent = !state ? 'Waiting for collector status' : state.last_error ? 'Needs attention' :
        !state.connected ? 'Account not connected' : state.paused ? 'API ready; collection paused' : state.running ? 'Collecting posts' : 'Connected; waiting for next poll';
      card.dataset.state = state?.last_error ? 'attention' : state?.connected ? 'active' : 'waiting';
      const detail = document.createElement('small');
      detail.textContent = state?.last_error || `${Number(state?.posts_processed || 0)} posts analyzed for this LGU this session`;
      card.append(title, label, detail); return card;
    }));
  };
  const previousMessage = window.socialCollectorMessage;
  window.socialCollectorMessage = function (health) {
    const entries = scopedStates(health);
    return entries ? entries.filter(({ state }) => state?.last_error)
      .map(({ platform, state }) => `${platform}: ${state.last_error}`).join(' | ') : previousMessage(health);
  };
  const previousBadge = window.socialCollectorBadge;
  window.socialCollectorBadge = function (health) {
    const entries = scopedStates(health);
    if (!entries) return previousBadge(health);
    if (entries.some(({ state }) => state?.last_error)) return 'Social collectors need attention';
    if (entries.some(({ state }) => state?.running)) return 'Collecting posts';
    if (entries.some(({ state }) => state?.connected)) return 'Accounts connected; awaiting next poll';
    return 'Waiting for social account connection';
  };
})();

(function () {
  const original = window.renderNlpMonitor;
  let loading = false, sequence = 0;
  window.renderNlpMonitor = function (...args) {
    original.apply(this, args);
    const statuses = document.getElementById('nlp-collector-statuses');
    if (!statuses || loading || !session) return;
    let holder = document.getElementById('nlp-event-progress');
    if (!holder) {
      holder = document.createElement('div'); holder.id = 'nlp-event-progress';
      holder.style.cssText = 'margin:16px 0;padding:16px;border:1px solid #dee7f1;border-radius:12px';
      statuses.after(holder);
    }
    loading = true;
    const own = ++sequence, scope = currentAdminLocationId();
    const url = ADMIN_API_URL + '?' + new URLSearchParams({ action: 'nlp-progress', location: scope });
    fetch(url, { credentials: 'include', cache: 'no-store' }).then(async response => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.cities)) throw Error('Progress requires the updated PHP API.');
      if (own !== sequence || scope !== currentAdminLocationId()) return;
      holder.replaceChildren();
      const heading = document.createElement('strong'); heading.textContent = 'Flood event progress'; holder.append(heading);
      const note = document.createElement('p');
      note.textContent = '20 distinct flood posts in a rolling 15-minute window across the same city or municipality. City-only posts count. Active events continue until 60 minutes without a new valid publication.';
      holder.append(note);
      const areas = data.cities;
      if (!areas.length) areas.push({ city_name: currentCity(), post_count: 0, phase: 'INACTIVE' });
      for (const area of areas) {
        const count = Number(area.post_count || 0);
        const label = document.createElement('p');
        label.textContent = area.phase === 'ACTIVE' ? `${area.city_name}: ACTIVE · ${area.event_post_count} posts in this event` : `${area.city_name}: ${area.phase} · ${count}/20 posts in the last 15 minutes`;
        const bar = document.createElement('progress'); bar.max = 20; bar.value = area.phase === 'ACTIVE' ? 20 : Math.min(count, 20);
        bar.style.cssText = 'width:100%;height:18px;accent-color:#176be8';
        bar.setAttribute('aria-label', label.textContent);
        holder.append(label, bar);
        if (area.phase === 'ACTIVE' && area.last_post_at) {
          const remaining = Math.max(0, Math.ceil((Date.parse(area.last_post_at.replace(' ','T')+'Z') + 3600000 - Date.parse(data.server_time)) / 60000));
          const timer = document.createElement('p'); timer.textContent = `Expires after ${remaining} more minutes without a newer valid flood post. Reported flooding; not official verification.`; holder.append(timer);
        }
      }
      for (const pin of data.pins || []) {
        const row = document.createElement('p'); row.textContent = `${pin.label} (${pin.precision_level}) · ${pin.post_count} posts · ${pin.severity} · latest ${pin.latest_post_at} UTC`; holder.append(row);
      }
      const history = (data.history || []).filter(event => event.status === 'EXPIRED');
      if (history.length) { const row=document.createElement('p');row.textContent=`${history.length} previous expired events retained in history.`;holder.append(row); }
      const detail = document.createElement('small'); detail.textContent = data.note; holder.append(detail);
    }).catch(error => { holder.textContent = error.message || 'Progress is temporarily unavailable.'; })
      .finally(() => { loading = false; });
  };
})();
