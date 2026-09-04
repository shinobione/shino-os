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
    return Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 2
  } catch {
    return $null
  }
}

function Invoke-ChatterboxWarmup {
  try {
    Write-Host "[SHINO-OS] Chatterbox warmup: modele + voix de reference..." -ForegroundColor Cyan
    $warm = Invoke-RestMethod -Method Post -Uri "$Url/warmup" -TimeoutSec 180
    if (-not $warm.ok) { return $false }
    $ref = if ($warm.conditioned_reference) { " + reference" } else { "" }
    Write-Host "[SHINO-OS] Chatterbox READY sur $($warm.device)$ref ($([math]::Round([double]$warm.load_ms/1000,1)) s)." -ForegroundColor Cyan
    return $true
  } catch {
    Write-Host "[SHINO-OS] Chatterbox warmup echec: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

$health = Test-ChatterboxHealth
if ($health) {
  if ($health.ready) {
    $env:SHINO_TTS_URL = $Url
    Write-Output $Url
    exit 0
  }
  if (Invoke-ChatterboxWarmup) {
    $health = Test-ChatterboxHealth
    if ($health -and $health.ready) {
      $env:SHINO_TTS_URL = $Url
      Write-Output $Url
      exit 0
    }
  }
  Write-Output ""
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

$health = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 400
  $health = Test-ChatterboxHealth
  if ($health) { break }
}

if (-not $health) {
  Write-Host "[SHINO-OS] Worker Chatterbox non joignable apres demarrage." -ForegroundColor Yellow
  Write-Output ""
  exit 0
}

if (-not (Invoke-ChatterboxWarmup)) {
  Write-Output ""
  exit 0
}

$health = Test-ChatterboxHealth
if ($health -and $health.ready) {
  $env:SHINO_TTS_URL = $Url
  Write-Output $Url
  exit 0
}

Write-Output ""
