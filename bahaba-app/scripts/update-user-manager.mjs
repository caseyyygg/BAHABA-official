import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const admin = resolve(process.argv[2]);
copyFileSync(resolve(import.meta.dirname, 'admin-user-manager.js'), resolve(admin, 'user-manager.js'));
copyFileSync(resolve(import.meta.dirname, 'admin-polish.css'), resolve(admin, 'admin-polish.css'));
const appPath = resolve(admin, 'App.js');
let app = readFileSync(appPath, 'utf8');
for (const [name, kind] of [['filteredAdmin', 'admin'], ['filteredApp', 'app']]) {
  app = app.replace(`${name}.map(`, `(window.userManagerPage ? window.userManagerPage(${name}, '${kind}') : ${name}).map(`);
}
// Keep the newly created account's role available to the UI; never retain its password.
app = app.replace(/ACCOUNTS\.push\(\{\s*email,\s*password,/, 'ACCOUNTS.push({\n    email,\n    role,');
writeFileSync(appPath, app);
const htmlPath = resolve(admin, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
if (!html.includes('src="user-manager.js')) html = html.replace('</body>', '<script src="user-manager.js?v=20261012"></script>\n</body>');
html = html.replace(/admin-polish\.css\?[^"\s]+/g, 'admin-polish.css?v=20261012-user-filters');
html = html.replace(/src="App\.js(?:\?[^"\s]*)?"/g, 'src="App.js?v=20261012-user-filters"');
writeFileSync(htmlPath, html);
console.log('Installed searchable assigned locations and paginated user filters.');
