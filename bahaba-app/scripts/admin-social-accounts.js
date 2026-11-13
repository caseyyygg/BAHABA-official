(function () {
  const view = document.getElementById('view-nlp-api');
  if (!view) return;
  const grid = view.querySelector('.collector-status-grid');
  const description = document.getElementById('nlp-login-setup');
  const note = grid.nextElementSibling;
  description.textContent = 'Submit signed-in account cookies for the selected LGU. Replace cookies here when a saved session expires.';
  note.textContent = 'Connections belong to the selected LGU. Disconnect removes the BANTALA’s saved session; it does not sign you out on your personal devices.';
  const style = document.createElement('style');
  style.textContent = `.social-login-dialog{width:min(1060px,95vw);max-height:95vh;padding:20px;border:1px solid #dee7f1;border-radius:18px;color:#0f1f33;font:13px/1.6 Inter,system-ui,sans-serif}.social-login-dialog::backdrop{background:#071b30aa}.social-login-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px}.social-login-dialog h3{font:600 16px Inter,system-ui,sans-serif}.social-login-dialog img{display:block;width:100%;margin:16px 0;border:1px solid #dee7f1;border-radius:12px;cursor:pointer}.social-login-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.social-login-controls input{min-height:40px;flex:1;padding:8px 12px;border:1px solid #dee7f1;border-radius:10px;font:inherit}.social-login-dialog .btn{min-height:38px;border-radius:10px;font-size:12px}.social-login-feedback{margin:12px 0;color:#57697f}.social-account-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}.social-account-actions .btn{flex:1}`;
  style.textContent += '.platform-cookie-form{display:grid;gap:10px;width:100%;min-width:0}.platform-cookie-form label{display:grid;gap:6px;font-weight:600}.platform-cookie-form input{box-sizing:border-box;width:100%;min-width:0;padding:12px;border:1px solid #cfdae7;border-radius:8px;font:13px monospace}.platform-cookie-form p{margin:0;overflow-wrap:anywhere}';
  document.head.append(style);
  let csrf = '', generation = 0;
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
  async function refreshAccounts() {
    const own = ++generation, location = currentAdminLocationId();
    if (!session || !location) return;
    grid.replaceChildren();
    try {
      const data = await request('social-accounts', {}, location);
      if (own !== generation || location !== currentAdminLocationId()) return;
      csrf = data.csrf;
      if (!(data.can_import ?? (session?.role === 'platform-admin' && data.can_edit))) { const hint = document.createElement('p'); hint.textContent = 'Submit cookies is available only to the super admin. Use the platform admin account to submit cookies.'; grid.append(hint); }
      for (const platform of ['Facebook', 'X', 'Threads']) {
        const connected = data.accounts.find(a => a.platform === platform)?.connected;
        const card = document.createElement('div'); card.className = 'collector-status-card';
        const title = document.createElement('strong'); title.textContent = platform;
        const status = document.createElement('span'); status.textContent = connected ? 'Session saved for this LGU' : 'Not connected';
        const help = document.createElement('small');
        help.textContent = connected ? 'Replace the saved session by submitting updated cookies.' : 'Submit cookies from the account this LGU wants to use.';
        const actions = document.createElement('div'); actions.className = 'social-account-actions';
        if (data.can_import ?? (session?.role === 'platform-admin' && data.can_edit)) {
          const form = document.createElement('form'); form.className = 'platform-cookie-form';
          const label = document.createElement('label'); label.textContent = `${platform} cookies`;
          const field = document.createElement('input'); field.name = 'cookies'; field.type = 'password'; field.required = true; field.maxLength = 60000; field.autocomplete = 'off'; field.spellcheck = false;
          field.placeholder = platform === 'X' ? 'auth_token=...; ct0=...' : platform === 'Facebook' ? 'c_user=...; xs=...' : 'sessionid=... or exported cookie JSON';
          label.append(field);
          const reveal = document.createElement('button'); reveal.type = 'button'; reveal.className = 'btn btn-outline'; reveal.textContent = 'Show cookies'; reveal.setAttribute('aria-pressed', 'false');
          reveal.onclick = () => { const show = field.type === 'password'; field.type = show ? 'text' : 'password'; reveal.textContent = show ? 'Hide cookies' : 'Show cookies'; reveal.setAttribute('aria-pressed', String(show)); };
          const submit = document.createElement('button'); submit.type = 'submit'; submit.className = 'btn btn-primary';
          submit.textContent = connected ? 'Replace cookies' : 'Submit cookies';
          const result = document.createElement('p'); result.setAttribute('role', 'status');
          const instructions = document.createElement('small'); instructions.textContent = platform === 'Threads' ? 'Paste cookies from your other browser. Exported JSON preserves Threads or Instagram domains.' : 'Log in in your other browser, then paste the cookie header or exported JSON here.';
          form.append(label, instructions, reveal, submit, result);
          form.onsubmit = async event => {
            event.preventDefault();
            const raw = field.value.trim(); if (!raw) return;
            let text; try { text = JSON.stringify(JSON.parse(raw)); } catch { text = JSON.stringify(raw); }
            field.value = ''; field.type = 'password'; reveal.textContent = 'Show cookies'; reveal.setAttribute('aria-pressed', 'false');
            submit.disabled = true; result.textContent = 'Saving cookies...';
            try { await request('social-browser', { platform, operation: 'import-session', text }, location); await refreshAccounts(); }
            catch (error) { result.textContent = error.message; submit.disabled = false; }
          };
          actions.append(form);
        }
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
    } catch (error) { const message = document.createElement('p'); message.textContent = error.message; grid.append(message); }
  }
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
      const status = document.createElement('span'); status.textContent = !state ? 'Awaiting LGU collector setup' : state.last_error ? 'Needs attention' : !state.connected ? 'Waiting for account cookies' : state.running ? 'Collecting posts' : 'Waiting for next poll';
      const detail = document.createElement('small'); detail.textContent = state?.last_error || (state ? `${state.posts_processed || 0} posts analyzed by this LGU collector this session.` : 'Shared collector activity does not indicate that this LGU has connected an account.');
      card.append(title, status, detail); monitor.append(card);
    }
  };
})();

// Cookie collector monitoring: the platform feed aggregates every LGU.
(function () {
  function entriesFor(health, all = false) {
    const states = health?.lgu_social_collectors;
    const scope = currentAdminLocationId();
    return ['X', 'Facebook', 'Threads'].map(platform => {
      const matching = states ? Object.entries(states).filter(([key]) => key.endsWith(':' + platform) && (all || key === scope + ':' + platform)).map(([, value]) => value) : [];
      return { platform, known: matching.length > 0, connected: matching.some(s => s.connected),
        running: matching.some(s => s.running), paused: matching.some(s => s.paused),
        error: matching.map(s => s.last_error).filter(Boolean).join(' '),
        count: matching.reduce((total, s) => total + Number(s.posts_processed || 0), 0),
        pending: matching.reduce((total, s) => total + Number(s.pending_posts || 0), 0) };
    });
  }
  function message(entries) {
    if (entries.some(s => s.error)) return entries.filter(s => s.error).map(s => s.platform + ': ' + s.error).join(' | ');
    if (entries.some(s => s.pending)) return `${entries.reduce((total, s) => total + s.pending, 0)} collected posts are queued for delivery retry.`;
    if (!entries.some(s => s.known)) return 'Collector status is unavailable. Saved cookies are managed in NLP API; the NLP service may be starting or offline.';
    if (entries.some(s => s.running)) return 'Collecting posts using saved account cookies.';
    if (entries.some(s => s.connected)) return 'Saved accounts are connected. Waiting for the next collection cycle or matching flood posts.';
    return 'No connected account has been reported by the collectors yet. Submit cookies in NLP API and allow the next collection cycle to run.';
  }
  function badge(entries) {
    return entries.some(s => s.error) ? 'Collectors need attention' : !entries.some(s => s.known) ? 'Collector status unavailable' : entries.some(s => s.running) ? 'Collecting posts' : entries.some(s => s.connected) ? 'Accounts connected' : 'Waiting for saved accounts';
  }
  window.renderCollectorStatuses = function (id, health) {
    const grid = document.getElementById(id); if (!grid) return;
    const all = id === 'all-nlp-collector-statuses';
    grid.replaceChildren(...entriesFor(health, all).map(state => {
      const card = document.createElement('div'); card.className = 'collector-status-card';
      const title = document.createElement('strong'); title.textContent = state.platform;
      const label = document.createElement('span');
      label.textContent = state.error ? 'Needs attention' : !state.known ? 'Collector status unavailable' : !state.connected ? 'No saved account reported' : state.paused ? 'Collection paused' : state.running ? 'Collecting posts' : 'Connected; waiting for next poll';
      card.dataset.state = state.error ? 'attention' : state.connected ? 'active' : 'waiting';
      const detail = document.createElement('small'); detail.textContent = (state.error ? state.error + ' ' : '') + `${state.count} posts analyzed ${all ? 'across all locations' : 'for this LGU'} this session` + (state.pending ? `; ${state.pending} collected posts queued for retry` : '');
      card.append(title, label, detail); return card;
    }));
  };
  window.socialCollectorMessage = health => message(entriesFor(health));
  window.socialCollectorBadge = health => badge(entriesFor(health));
  function updateMonitor(all) {
    const health = all ? allNlpServiceHealth : nlpServiceHealth;
    const entries = entriesFor(health, all);
    const prefix = all ? 'all-nlp' : 'nlp';
    window.renderCollectorStatuses(prefix + '-collector-statuses', health);
    if (all ? allReportsFeedError || !allNlpIngestionConfigured : nlpFeedStatus === 'offline') return;
    const label = document.getElementById(prefix + '-live-label'); if (label) label.textContent = badge(entries);
    const status = document.getElementById(prefix + '-live-badge'); if (status) status.className = 'nlp-live-badge ' + (entries.some(s => s.error) ? 'attention' : entries.some(s => s.connected) ? 'live' : 'ready');
    const alert = document.getElementById(prefix + '-feed-alert'); if (alert) { alert.style.display = 'block'; alert.textContent = message(entries); }
    const holder = document.getElementById(prefix + '-events-list');
    if (holder && !(all ? ALL_NLP_EVENTS : NLP_EVENTS).length) {
      const td = document.createElement('td'); td.colSpan = all ? 7 : 6; td.className = 'nlp-empty'; td.textContent = message(entries);
      const row = document.createElement('tr'); row.append(td); holder.replaceChildren(row);
    }
  }
  const allRender = window.renderAllNlpMonitor;
  if (allRender) window.renderAllNlpMonitor = function (...args) { const result = allRender.apply(this, args); updateMonitor(true); return result; };
  const localRender = window.renderNlpMonitor;
  if (localRender) window.renderNlpMonitor = function (...args) { const result = localRender.apply(this, args); updateMonitor(false); return result; };
})();
