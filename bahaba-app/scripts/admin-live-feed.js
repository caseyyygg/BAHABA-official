/* BAHABA live feed: ten rows per page; source publication and collection are distinct. */
const NLP_FEED_PAGE_SIZE = 10;
const nlpFeedPages = Object.create(null);

function parseNlpUtc(value){
  if(!value) return null;
  let text = String(value).trim().replace(' ', 'T');
  if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += 'Z';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNlpTime(value){
  const date = parseNlpUtc(value);
  return date ? date.toLocaleString('en-PH', {
    timeZone:'Asia/Manila', year:'numeric', month:'short', day:'numeric',
    hour:'numeric', minute:'2-digit', second:'2-digit', hour12:true,
  }) : 'Time unavailable';
}

function renderNlpTimes(event){
  const collected = parseNlpUtc(event.received_at);
  const published = parseNlpUtc(event.published_at);
  const time = (date, label) => date
    ? `<time datetime="${date.toISOString()}" title="${label} in Philippine time">${formatNlpTime(date.toISOString())}</time>`
    : `${label} time unavailable`;
  return `<span style="display:block">${time(collected, 'Collection')}</span><small style="display:block;margin-top:5px">${published ? 'Published: ' + time(published, 'Publication') : 'Publication time unavailable'}</small>`;
}

function paginateNlpEvents(events, prefix, filterKey = ''){
  const state = nlpFeedPages[prefix] ||= {page:1, filterKey};
  if(state.filterKey !== filterKey){state.page = 1; state.filterKey = filterKey;}
  const rows = [...events].sort((left,right) =>
    (parseNlpUtc(right.received_at)?.getTime() || 0) - (parseNlpUtc(left.received_at)?.getTime() || 0)
    || Number(right.id || 0) - Number(left.id || 0));
  const pageCount = Math.max(1, Math.ceil(rows.length / NLP_FEED_PAGE_SIZE));
  state.page = Math.max(1, Math.min(state.page, pageCount));
  const offset = (state.page - 1) * NLP_FEED_PAGE_SIZE;
  const holder = document.getElementById(prefix + '-events-list');
  let pager = document.getElementById(prefix + '-pagination');
  if(holder && !pager){
    pager = document.createElement('nav');
    pager.id = prefix + '-pagination';
    pager.setAttribute('aria-label', prefix === 'nlp' ? 'Collected posts pages' : 'All collected posts pages');
    pager.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px;padding:12px 0';
    holder.closest('.nlp-events-wrap').after(pager);
  }
  if(pager){
    pager.hidden = rows.length <= NLP_FEED_PAGE_SIZE;
    // The hidden attribute must take precedence over the inline display style.
    pager.style.display = pager.hidden ? 'none' : 'flex';
    pager.replaceChildren();
    const label = document.createElement('span');
    label.setAttribute('aria-live','polite');
    label.textContent = `${offset + 1}\u2013${Math.min(offset + NLP_FEED_PAGE_SIZE, rows.length)} of ${rows.length} posts \u00b7 Page ${state.page} of ${pageCount}`;
    const button = (text, delta, disabled) => {
      const element = document.createElement('button');
      element.type = 'button'; element.className = 'btn btn-outline btn-sm';
      element.textContent = text; element.disabled = disabled;
      element.addEventListener('click', () => {
        state.page += delta;
        if(prefix === 'nlp') window.renderNlpMonitor(); else window.renderAllNlpMonitor();
      });
      return element;
    };
    pager.append(label, button('Previous', -1, state.page === 1), button('Next', 1, state.page === pageCount));
  }
  return rows.slice(offset, offset + NLP_FEED_PAGE_SIZE);
}
