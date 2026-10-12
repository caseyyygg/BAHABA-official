(function () {
  const view = document.getElementById('view-nlp-api');
  if (!view) return;
  const grid = view.querySelector('.collector-status-grid');
  const description = document.getElementById('nlp-login-setup');
  const note = grid.nextElementSibling;
  description.textContent = 'Choose a social account for this LGU. Sign in privately, complete any platform verification, then save the session. You can disconnect and sign in with another account at any time.';
  note.textContent = 'Connections belong to the selected LGU. Disconnect removes the BANTALA saved session; it does not sign you out on your personal devices.';
  const style = document.createElement('style');
  style.textContent = `.social-login-dialog{width:min(1060px,95vw);max-height:95vh;padding:20px;border:1px solid #dee7f1;border-radius:18px;color:#0f1f33;font:13px/1.6 Inter,system-ui,sans-serif}.social-login-dialog::backdrop{background:#071b30aa}.social-login-dialog header{display:flex;align-items:center;justify-content:space-between;gap:16px}.social-login-dialog h3{font:600 16px Inter,system-ui,sans-serif}.social-login-dialog img{display:block;width:100%;margin:16px 0;border:1px solid #dee7f1;border-radius:12px;cursor:pointer}.social-credential-controls{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto;gap:8px;align-items:end}.social-credential-controls label{display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600}.social-login-dialog input{box-sizing:border-box;min-width:0;min-height:40px;padding:8px 12px;border:1px solid #dee7f1;border-radius:10px;font:inherit}.social-login-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}.social-login-controls input{flex:1}.social-login-dialog .btn{min-height:38px;border-radius:10px;font-size:12px}.social-login-feedback{margin:12px 0;color:#57697f}.social-account-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}.social-account-actions .btn{flex:1}@media(max-width:680px){.social-credential-controls{grid-template-columns:minmax(0,1fr) auto}.social-credential-controls label:nth-of-type(2){grid-column:1}}`;
  document.head.append(style);
  let csrf = '', generation = 0, active = null, busy = false;
  const dialog = document.createElement('dialog');
  dialog.className = 'social-login-dialog';
  dialog.innerHTML = `<header><h3>Private social sign-in</h3><button class="btn btn-outline" type="button" data-op="close">Close</button></header><p>Enter your details and use Auto sign in for Facebook. Complete any CAPTCHA or verification yourself. Credentials are cleared after sending.</p><img alt="Private platform login browser" tabindex="0" hidden><div class="social-credential-controls"><label>Email, phone, or username<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Email, phone, or username" placeholder="Email, phone, or username"></label><button type="button" class="btn btn-outline" data-op="email">Fill email</button><label>Password<input type="password" autocomplete="new-password" aria-label="Social account password" placeholder="Password"></label><button type="button" class="btn btn-outline" data-op="password">Fill password</button><button type="button" class="btn btn-primary" data-op="autologin" hidden>Auto sign in</button></div><div class="social-login-controls"><input type="password" autocomplete="off" aria-label="Verification code or other text" placeholder="Verification code or other text"><button type="button" class="btn btn-outline" data-op="type">Send text</button><button type="button" class="btn btn-outline" data-op="enter">Enter</button><button type="button" class="btn btn-outline" data-op="tab">Next field</button><button type="button" class="btn btn-outline" data-op="clear">Clear field</button><button type="button" class="btn btn-outline" data-op="up">Scroll up</button><button type="button" class="btn btn-outline" data-op="down">Scroll down</button><button type="button" class="btn btn-outline" data-op="frame">Refresh view</button><button type="button" class="btn btn-primary" data-op="save">Save account</button></div><p class="social-login-feedback" role="status"></p>`;
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
        help.textContent = !data.available ? 'Online sign-in is waiting for the browser service to be deployed.' : connected ? 'You can replace this session by signing in with another account.' : 'Sign in with the account this LGU wants to use.';
        const actions = document.createElement('div'); actions.className = 'social-account-actions';
        const login = document.createElement('button'); login.className = 'btn btn-outline'; login.type = 'button';
        login.textContent = connected ? 'Switch account' : 'Sign in'; login.disabled = !data.available || !data.can_edit;
        login.onclick = () => start(platform, location); actions.append(login);
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
  async function operate(operation, extra = {}) {
    if (!active || busy) return;
    busy = true;
    dialog.querySelectorAll('button,input').forEach(el => { el.disabled = true; });
    feedback.textContent = 'Updating private browser…';
    try {
      const data = await request('social-browser', { platform: active.platform, operation, ...extra }, active.location);
      if (data.image) { image.src = 'data:image/jpeg;base64,' + data.image; image.hidden = false; }
      feedback.textContent = 'Complete sign-in in the platform view, then choose Save account.';
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
      return operate('type', { text });
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
