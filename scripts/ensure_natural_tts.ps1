param(
  [string]$Root,
  [string]$RuntimeRoot,
  [int]$Port = 8765
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
if (-not $RuntimeRoot) {
  if ($env:SHINO_RUNTIME_ROOT) { $RuntimeRoot = $env:SHINO_RUNTIME_ROOT }
  elseif ($env:LOCALAPPDATA) { $RuntimeRoot = Join-Path $env:LOCALAPPDATA "SHINO-OS\runtime" }
  else { $RuntimeRoot = Join-Path $env:USERPROFILE ".shino-os\runtime" }
}

$WorkerRuntime = Join-Path $RuntimeRoot "workers\chatterbox"
$Python = Join-Path $WorkerRuntime ".venv\Scripts\python.exe"
$Logs = Join-Path $WorkerRuntime "logs"
$Url = "http://127.0.0.1:$Port"

function Test-ChatterboxHealth {
  try {
    return Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 1
  } catch {
    return $null
  }
}

function Start-Warmup {
  Start-Process -WindowStyle Hidden powershell.exe -ArgumentList @(
    '-NoProfile',
    '-Command',
    "try { Invoke-RestMethod -Method Post -Uri '$Url/warmup' -TimeoutSec 900 | Out-Null } catch { }"
  ) | Out-Null
}

$health = Test-ChatterboxHealth
if ($health) {
  $env:SHINO_TTS_URL = $Url
  if (-not $health.loaded) { Start-Warmup }
  Write-Output $Url
  exit 0
}

if (-not (Test-Path $Python)) {
  Write-Output ""
  exit 0
}

New-Item -ItemType Directory -Force -Path $Logs | Out-Null
$outLog = Join-Path $Logs "worker.out.log"
$errLog = Join-Path $Logs "worker.err.log"

$args = @(
  '-m', 'uvicorn',
  'workers.chatterbox_tts.server:app',
  '--host', '127.0.0.1',
  '--port', "$Port",
  '--log-level', 'warning'
)

$startParams = @{
  FilePath = $Python
  ArgumentList = $args
  WorkingDirectory = $Root
  WindowStyle = 'Hidden'
  RedirectStandardOutput = $outLog
  RedirectStandardError = $errLog
}
Start-Process @startParams | Out-Null

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 400
  $health = Test-ChatterboxHealth
  if ($health) {
    $env:SHINO_TTS_URL = $Url
    if (-not $health.loaded) { Start-Warmup }
    Write-Output $Url
    exit 0
  }
}

Write-Output ""
