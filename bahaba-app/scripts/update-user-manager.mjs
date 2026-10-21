import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
const apiPath = resolve(admin, 'api.php');
if (existsSync(apiPath)) {
  let api = readFileSync(apiPath, 'utf8');
  const updateStart = api.indexOf("if ($mode === 'update')");
  const updateEnd = api.indexOf("if ($mode === 'delete')", updateStart);
  if (updateStart !== -1 && updateEnd !== -1) {
    let updateBlock = api.slice(updateStart, updateEnd);
    if (!updateBlock.includes('$locationChangeRequested =')) {
      updateBlock = updateBlock.replace(/(\$update = \[\];\s*\$params = \['email' => \$email\];)/, "$1\n            $locationChangeRequested = isset($input['role']) || isset($input['assigned_location']) || isset($input['city']);");
    }
    if (!updateBlock.includes("$update[] = 'acls = :acls';")) {
      updateBlock = updateBlock.replace(/(\$update\[\] = 'role = :role';\s*\$params\['role'\] = \$role;)/, "$1\n                $update[] = 'acls = :acls';\n                $params['acls'] = json_encode([\n                    'admin_overview' => $role === 'platform-admin' ? 'full' : 'view',\n                    'announcements' => $role === 'platform-admin' ? 'full' : 'edit',\n                    'products' => $role === 'platform-admin' ? 'full' : 'edit',\n                    'approval_board' => $role === 'platform-admin' ? 'full' : 'edit',\n                    'approval_board_hr' => $role === 'platform-admin' ? 'full' : 'no_access',\n                ], JSON_THROW_ON_ERROR);");
    }
    api = api.slice(0, updateStart) + updateBlock + api.slice(updateEnd);
    writeFileSync(apiPath, api);
  }
}
const htmlPath = resolve(admin, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
if (!html.includes('src="user-manager.js')) html = html.replace('</body>', '<script src="user-manager.js?v=20261019-admin-edit-ui"></script>\n</body>');
else html = html.replace(/src="user-manager\.js(?:\?[^"\s]*)?"/g, 'src="user-manager.js?v=20261019-admin-edit-ui"');
html = html.replace(/admin-polish\.css\?[^"\s]+/g, 'admin-polish.css?v=20261019-admin-edit-ui');
html = html.replace(/src="App\.js(?:\?[^"\s]*)?"/g, 'src="App.js?v=20261019-admin-edit-ui"');
writeFileSync(htmlPath, html);
console.log('Installed searchable user filters, admin account editing, and updated profile modal styling.');
