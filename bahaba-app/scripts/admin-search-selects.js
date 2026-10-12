(() => {
  const ids = [
    'command-location-select', 'reports-location-select', 'reports-barangay-select',
    'ann-location-select', 'ann-barangay-select', 'evac-location-select',
    'evac-barangay-select', 'evac-center-barangay', 'lgu-map-barangay', 'lgu-map-severity',
  ];
  const entries = [];

  function install(select) {
    if (!select || select.dataset.searchPickerReady === '1') return;
    select.dataset.searchPickerReady = '1';
    const wrapper = document.createElement('div'); wrapper.className = 'admin-search-select-wrap';
    if (select.closest('.field') || select.closest('#lgu-map-report-form')) wrapper.classList.add('full');
    const picker = document.createElement('details'); picker.className = 'admin-search-select';
    if (select.id === 'lgu-map-severity') picker.classList.add('severity-select');
    const summary = document.createElement('summary'); summary.setAttribute('aria-label', select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim() || 'Choose an option');
    const value = document.createElement('span'); value.className = 'admin-search-select-value';
    const chevron = document.createElement('i'); chevron.setAttribute('aria-hidden', 'true');
    summary.append(value, chevron);
    const menu = document.createElement('div'); menu.className = 'admin-search-select-menu';
    const search = document.createElement('input'); search.type = 'search'; search.autocomplete = 'off'; search.placeholder = 'Search...';
    search.setAttribute('aria-label', `Search ${summary.getAttribute('aria-label').toLowerCase()}`);
    const results = document.createElement('div'); results.className = 'admin-search-select-results'; results.setAttribute('role', 'listbox');
    menu.append(search, results); picker.append(summary, menu);
    select.before(wrapper); wrapper.append(select, picker);
    select.classList.add('admin-search-select-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');

    function positionMenu() {
      if (!picker.open || !menu.classList.contains('is-floating')) return;
      const rect = picker.getBoundingClientRect();
      const below = Math.max(0, window.innerHeight - rect.bottom - 8);
      const above = Math.max(0, rect.top - 8);
      const flip = below < 190 && above > below;
      const available = Math.max(120, Math.min(310, flip ? above : below));
      const style = getComputedStyle(summary);
      menu.style.position = 'fixed'; menu.style.zIndex = '10000'; menu.style.boxSizing = 'border-box';
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
      menu.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
      menu.style.maxHeight = `${available}px`;
      menu.style.top = flip ? 'auto' : `${rect.bottom - 1}px`;
      menu.style.bottom = flip ? `${window.innerHeight - rect.top - 1}px` : 'auto';
      menu.style.backgroundColor = style.backgroundColor;
      menu.style.color = style.color;
      menu.style.borderColor = style.borderColor;
      menu.style.borderRadius = flip ? '12px 12px 0 0' : '0 0 12px 12px';
    }

    function showMenu() {
      if (select.disabled) { picker.open = false; return; }
      if (menu.parentElement !== document.body) document.body.append(menu);
      menu.classList.add('is-floating');
      render(); positionMenu();
    }

    function hideMenu() {
      menu.classList.remove('is-floating');
      menu.removeAttribute('style');
      if (menu.parentElement !== picker) picker.append(menu);
    }

    function render() {
      const options = [...select.options];
      const selected = options.find(option => option.value === select.value);
      value.textContent = selected?.textContent?.trim() || 'Choose an option';
      summary.setAttribute('aria-disabled', String(select.disabled));
      picker.classList.toggle('disabled', select.disabled);
      if (select.disabled && picker.open) picker.open = false;
      wrapper.hidden = select.hidden || select.style.display === 'none';
      const severityColor = select.style.getPropertyValue('--severity-color');
      if (severityColor) picker.style.setProperty('--severity-color', severityColor);
      results.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase();
      const matches = options.filter(option => !query || option.textContent.toLocaleLowerCase().includes(query) || option.value.toLocaleLowerCase().includes(query));
      for (const option of matches) {
        const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(option.value === select.value));
        button.disabled = option.disabled || select.disabled; button.textContent = option.textContent.trim();
        button.addEventListener('click', () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          search.value = ''; picker.open = false; render();
        });
        results.append(button);
      }
      if (!matches.length) { const empty = document.createElement('p'); empty.className = 'admin-search-select-empty'; empty.textContent = 'No matching options. Try another search.'; results.append(empty); }
    }

    search.addEventListener('input', render);
    select.addEventListener('change', render);
    summary.addEventListener('click', event => { if (select.disabled) event.preventDefault() });
    picker.addEventListener('toggle', () => { if (picker.open) { search.value = ''; showMenu(); } else hideMenu(); });
    const closeOutside = event => { if (picker.open && !wrapper.contains(event.target) && !menu.contains(event.target)) picker.open = false; };
    const closeEscape = event => { if (event.key === 'Escape' && picker.open) { picker.open = false; summary.focus(); } };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    const observer = new MutationObserver(render);
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style'] });
    entries.push({ select, render });
    render();
  }

  window.refreshAdminSearchSelects = () => entries.forEach(entry => entry.render());
  ids.forEach(id => install(document.getElementById(id)));
  new MutationObserver(() => ids.forEach(id => install(document.getElementById(id))))
    .observe(document.documentElement, { childList: true, subtree: true });
})();
