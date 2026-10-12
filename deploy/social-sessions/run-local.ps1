$ErrorActionPreference = 'Stop'

$privatePath = Join-Path $PSScriptRoot '.local'
$secretPath = Join-Path $privatePath 'social-browser-token.txt'
$sessionPath = Join-Path $privatePath 'social-sessions'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'

if (-not (Test-Path -LiteralPath $secretPath)) {
  throw "Local gateway secret is missing: $secretPath"
}
if (-not (Test-Path -LiteralPath $python)) {
  throw 'Gateway Python environment is missing. Reinstall requirements first.'
}

$env:SOCIAL_BROWSER_TOKEN = (Get-Content -LiteralPath $secretPath -Raw).Trim()
$env:SESSION_DIRECTORY = $sessionPath
New-Item -ItemType Directory -Force -Path $sessionPath | Out-Null
Set-Location -LiteralPath $PSScriptRoot
& $python -m uvicorn app:app --host 127.0.0.1 --port 8003 --workers 1 --no-access-log
