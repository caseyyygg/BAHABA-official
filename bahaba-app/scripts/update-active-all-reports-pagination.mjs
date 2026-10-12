import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const admin = resolve(process.argv[2]);
if (!process.argv[2] || !admin.toLowerCase().endsWith('\\bahaba-admin')) {
  throw new Error('Pass the active BAHABA-ADMIN directory as the target.');
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${label} anchor, found ${count}.`);
  return source.replace(before, after);
}

const appPath = resolve(admin, 'App.js');
let app = readFileSync(appPath, 'utf8');
app = replaceOnce(app, 'let ALL_PLATFORM_REPORTS = [];', `let ALL_PLATFORM_REPORTS = [];
let allReportsPage = 1;
let allReportsPageSize = 5;
let allReportsFilterSignature = '';`, 'pagination state');
app = replaceOnce(app, "  const statusFilter = document.getElementById('all-reports-status')?.value || 'all';\n  const rows = ALL_PLATFORM_REPORTS.filter(report => {", `  const statusFilter = document.getElementById('all-reports-status')?.value || 'all';
  const filterSignature = JSON.stringify([query, sourceFilter, statusFilter]);
  if(filterSignature !== allReportsFilterSignature){ allReportsFilterSignature = filterSignature; allReportsPage = 1; }
  const rows = ALL_PLATFORM_REPORTS.filter(report => {`, 'filter reset');
app = replaceOnce(app, "    return matchesSource && matchesStatus && (!query || haystack.includes(query));\n  });\n\n  const total = ALL_PLATFORM_REPORTS.length;", `    return matchesSource && matchesStatus && (!query || haystack.includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(rows.length / allReportsPageSize));
  allReportsPage = Math.min(pageCount, Math.max(1, allReportsPage));
  const pageRows = rows.slice((allReportsPage - 1) * allReportsPageSize, allReportsPage * allReportsPageSize);
  const pagination = document.getElementById('all-reports-pagination');
  if(pagination){
    pagination.hidden = rows.length === 0;
    document.getElementById('all-reports-page-count').textContent = 'Page ' + allReportsPage + ' of ' + pageCount + ' · ' + rows.length.toLocaleString() + ' reports';
    document.getElementById('all-reports-page-size').value = String(allReportsPageSize);
    document.getElementById('all-reports-prev').disabled = allReportsPage <= 1;
    document.getElementById('all-reports-next').disabled = allReportsPage >= pageCount;
  }

  const total = ALL_PLATFORM_REPORTS.length;`, 'pagination calculations');
app = replaceOnce(app, '  holder.innerHTML = rows.map(report => {', '  holder.innerHTML = pageRows.map(report => {', 'paged report rendering');
app = replaceOnce(app, `  }).join('');
}

function renderReportsFilterChips(){`, `  }).join('');
}

function changeAllReportsPage(delta){
  allReportsPage += delta;
  renderAllReports();
  document.getElementById('all-reports-pagination')?.scrollIntoView({block:'nearest',behavior:'smooth'});
}

function setAllReportsPageSize(value){
  const size = Number(value);
  if(![5,10,20].includes(size)) return;
  allReportsPageSize = size;
  allReportsPage = 1;
  renderAllReports();
}

function renderReportsFilterChips(){`, 'pagination handlers');
writeFileSync(appPath, app);

const htmlPath = resolve(admin, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
html = replaceOnce(html, '      <div class="all-reports-sync" id="all-reports-sync">', `      <div class="all-reports-pagination" id="all-reports-pagination" hidden>
        <span id="all-reports-page-count" role="status" aria-live="polite"></span>
        <div class="all-reports-page-actions">
          <label for="all-reports-page-size">Show</label>
          <select id="all-reports-page-size" onchange="setAllReportsPageSize(this.value)" aria-label="Reports per page">
            <option value="5">5</option><option value="10">10</option><option value="20">20</option>
          </select>
          <span>per page</span>
          <button class="btn btn-outline btn-sm" id="all-reports-prev" type="button" onclick="changeAllReportsPage(-1)">Previous</button>
          <button class="btn btn-outline btn-sm" id="all-reports-next" type="button" onclick="changeAllReportsPage(1)">Next</button>
        </div>
      </div>
      <div class="all-reports-sync" id="all-reports-sync">`, 'pagination markup');
html = html.replace('admin-polish.css?v=20261013-confirm-dialog', 'admin-polish.css?v=20261013-reports-pagination');
html = html.replace('App.js?v=20261013-confirm-dialog', 'App.js?v=20261013-reports-pagination');
writeFileSync(htmlPath, html);

copyFileSync(resolve(import.meta.dirname, 'admin-polish.css'), resolve(admin, 'admin-polish.css'));
console.log('Installed five-report pages with 5, 10, and 20 row options.');
