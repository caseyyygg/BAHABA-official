import {cpSync,mkdirSync,readFileSync,writeFileSync,existsSync,statSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const app=resolve(import.meta.dirname,'..'),root=resolve(app,'..');
const output=resolve(root,'BAHABA-Transfer-2026-10-12.local');
if(existsSync(output))throw Error('Transfer folder already exists; keep the existing backup and choose a new name.');
const resident=join(output,'resident'),admin=join(output,'admin');mkdirSync(resident,{recursive:true});mkdirSync(admin,{recursive:true});mkdirSync(join(output,'database'));
for(const name of ['src','public','api','index.html','package.json','package-lock.json','vite.config.js','location-config.json','psgc-registry.json','README.md'])cpSync(join(app,name),join(resident,name),{recursive:true,filter:path=>!['config.php','auth.json','.env','.env.local','__pycache__'].includes(path.split(/[\\/]/).at(-1))});
mkdirSync(join(resident,'scripts'));for(const name of ['archive-reports.php','export-hosting.php'])cpSync(join(app,'scripts',name),join(resident,'scripts',name));
const source='C:/Users/Jakes/Downloads/BAHABA-ADMIN';
for(const name of ['api.php','App.js','index.html','style.css','psgc-registry.json','report-manager.js','report-management.php','nlp-threshold.php','nlp-location.php','report-point.php','report-point.mjs','report-map.mjs','collected-history.php','collected-history.js','barangay-status.js','team-deployments.php','team-deployments.js','team-barangays.json','map-data','map-vendor'])cpSync(join(source,name),join(admin,name),{recursive:true});
let php=readFileSync(join(admin,'api.php'),'utf8');const start=php.indexOf("$sharedApiDirectory = __DIR__ . '/api';"),end=php.indexOf("if (!is_file($sharedApiDirectory . '/config.php')) {\n    http_response_code(500)",start);
if(start<0||end<0)throw Error('Shared API path marker changed.');php=php.slice(0,start)+"$sharedApiDirectory = __DIR__ . '/../resident/api';\n"+php.slice(end);writeFileSync(join(admin,'api.php'),php);
// Optional collector sources, without cookies, API keys, environments or model caches.
mkdirSync(join(output,'collector'));for(const name of ['app.py','social_browser.py','social_collectors.py','x_agent_reach.py','patch-x-backend.py','requirements.txt','SOCIAL-COLLECTORS.md','.env.example'])if(existsSync(join(source,'nlp-service',name)))cpSync(join(source,'nlp-service',name),join(output,'collector',name));
const collectorExample=join(output,'collector/.env.example');if(existsSync(collectorExample))writeFileSync(collectorExample,readFileSync(collectorExample,'utf8').replace(/^([A-Za-z_][A-Za-z0-9_]*=).*$/gm,'$1'));
writeFileSync(join(resident,'api/config.php'),`<?php
return [
 'db'=>['dsn'=>'mysql:host=127.0.0.1;port=3306;dbname=bahaba_transfer;charset=utf8mb4','username'=>'root','password'=>''],
 'api_url'=>'http://localhost:8000/api','app_url'=>'http://localhost:5173','frontend_origin'=>'http://localhost:5173',
 'admin_url'=>'http://localhost:8001','admin_api_url'=>'http://localhost:8001/api.php',
 'nlp_ingest_token'=>'','trusted_social_publishers'=>[],
 'mail_from'=>'no-reply@example.com','smtp'=>['host'=>'','port'=>587,'username'=>'','password'=>''],
];
`);
writeFileSync(join(output,'Start-BAHABA.ps1'),`$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$phpCommand = Get-Command php.exe -ErrorAction SilentlyContinue
if ($phpCommand) { $phpExe = $phpCommand.Source } elseif (Test-Path 'C:/xampp/php/php.exe') { $phpExe = 'C:/xampp/php/php.exe' } else { throw 'Install PHP or XAMPP first.' }
$nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
if (!(Test-Path (Join-Path $bundleRoot 'resident/node_modules/vite/bin/vite.js'))) { throw 'Open a terminal in resident and run npm ci first.' }
$logDir = Join-Path $bundleRoot 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$residentRoot = Join-Path $bundleRoot 'resident'
$adminRoot = Join-Path $bundleRoot 'admin'
Start-Process -FilePath $phpExe -ArgumentList @('-S','localhost:8000','-t',('"'+$residentRoot+'"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'resident-api.log') -RedirectStandardError (Join-Path $logDir 'resident-api-errors.log')
Start-Process -FilePath $phpExe -ArgumentList @('-S','localhost:8001','-t',('"'+$adminRoot+'"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'admin.log') -RedirectStandardError (Join-Path $logDir 'admin-errors.log')
Start-Process -FilePath $nodeExe -WorkingDirectory $residentRoot -ArgumentList @(('"'+(Join-Path $residentRoot 'node_modules/vite/bin/vite.js')+'"'),'--host','localhost','--port','5173','--strictPort') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'resident-web.log') -RedirectStandardError (Join-Path $logDir 'resident-web-errors.log')
Write-Host 'Resident: http://localhost:5173'
Write-Host 'Admin: http://localhost:8001'
Write-Host 'Check the logs folder if a port is already in use or a service fails.'
`);
writeFileSync(join(output,'README-FIRST.md'),`# BAHABA transfer — 12 October 2026

This folder contains the resident app, the admin console actually used at localhost:8001, optional collector source code, and a backup of the current database. Both apps connect to the same NEW local database.

## Install on the other Windows device

1. Install Node.js 22.12+ (https://nodejs.org/en/download) and XAMPP (https://www.apachefriends.org/download.html). XAMPP supplies PHP, MariaDB/MySQL and phpMyAdmin. PHP needs pdo_mysql and zip; enable them in php.ini if missing. Node 24 LTS is also suitable.
2. Start Apache and MySQL in XAMPP Control Panel. Open http://localhost/phpmyadmin. Create a NEW empty database named bahaba_transfer using utf8mb4_unicode_ci. Do not select an existing database containing other data.
3. Select bahaba_transfer, click Import, and select the .sql file in this folder's database directory. Import once. It contains current records and password hashes, so existing account passwords remain valid. If phpMyAdmin reports a file-size limit, raise upload_max_filesize/post_max_size in XAMPP php.ini or use the MySQL command line to import it.
4. Edit resident/api/config.php if your local MySQL port, username or password differs from XAMPP's default root/blank-password configuration. It points to 127.0.0.1 only; no original database credentials are included. Both resident and admin use this file.
5. Open a terminal in the resident folder and run: npm ci
6. From this folder run PowerShell: powershell -ExecutionPolicy Bypass -File .\\Start-BAHABA.ps1
7. Open http://localhost:5173 for residents and http://localhost:8001 for admins. Keep MySQL and the launched processes running. Logs are in the logs folder. Close conflicting services first if ports 5173, 8000 or 8001 are already in use.

## What transfers

- Accounts, stored location preferences, reports, collected social posts, announcements, evacuation centers, team deployments and existing summary/audit tables from the source database.
- The latest resident code, admin fixes, map geometry and bundled PHP mail library. No node_modules, virtual environments, browser sessions or remote database/SMTP credentials.
- A new device requires login again. It does not inherit the old browser session, GPS/browser notification permission or local display settings.

## Features needing separate configuration

- Signup activation and password recovery require your own SMTP credentials in resident/api/config.php. Existing verified accounts can log in without SMTP. No email is sent during setup.
- Social collection is optional. Install Python 3.11+, create a virtual environment in collector, install requirements.txt and Playwright Chromium, then follow SOCIAL-COLLECTORS.md. Supply your own platform credentials and local NLP ingestion token; adjust the collector receiver URL to http://localhost:8001/api.php?action=nlp-ingest. Model dependencies are large and require internet. The collector is not started by Start-BAHABA.ps1. Existing stored social posts remain available without it.
- Map tiles require internet. Notification triggers are installed by the API on a local database account with the needed privileges. No cloud resources or database privileges are modified by this package.
- This package runs separately on the recipient's computer; new data does not synchronize with the original device. The package does not configure public hosting, HTTPS, scheduled tasks or background push delivery. Monthly report retention can be run with php resident/scripts/archive-reports.php.

## Keep the backup private

The SQL file contains current account records, password hashes and operational/personal data. Send it privately to the intended recipient. Do not put it in a public website folder or public repository. This package uses PHP development servers for local use only.
`);
const ignored=['node_modules','.git','.env','.env.local','.venv','.state'];let count=0,total=0;function inspect(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(ignored.includes(entry.name))throw Error('Unexpected private/dependency folder: '+entry.name);const path=join(dir,entry.name);if(entry.isDirectory())inspect(path);else{count++;total+=statSync(path).size;}}}inspect(output);
console.log(JSON.stringify({folder:output,files:count,bytes:total}));
