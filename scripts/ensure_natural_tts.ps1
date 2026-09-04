param(
  [string]$Root,
  [string]$RuntimeRoot,
  [int]$Port = 18765
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

function Get-OptionalProperty($Object, [string]$Name, $Default = $null) {
  if ($null -eq $Object) { return $Default }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $Default }
  return $property.Value
}

function Stop-StaleChatterboxWorker {
  if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) {
    return $false
  }

  try {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
    if (-not $listener) { return $false }
    $pidValue = [int]$listener.OwningProcess
    $process = Get-Process -Id $pidValue -ErrorAction Stop
    $processPath = ""
    try { $processPath = [string]$process.Path } catch { }

    $expectedPython = ""
    try { $expectedPython = [string](Resolve-Path $Python -ErrorAction Stop) } catch { }

    if ($processPath -and $expectedPython -and ($processPath -ieq $expectedPython)) {
      Write-Host "[SHINO-OS] Ancien worker Chatterbox detecte (PID $pidValue); redemarrage avec le code courant." -ForegroundColor Yellow
      Stop-Process -Id $pidValue -Force -ErrorAction Stop
      for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 250
        if (-not (Test-ChatterboxHealth)) { return $true }
      }
      return $true
    }

    Write-Host "[SHINO-OS] Port $Port occupe par un processus non reconnu (PID $pidValue, $processPath); worker non tue." -ForegroundColor Yellow
    return $false
  } catch {
    Write-Host "[SHINO-OS] Impossible de redemarrer le worker Chatterbox obsolete: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

function Invoke-ChatterboxWarmup {
  try {
    Write-Host "[SHINO-OS] Chatterbox warmup: modele + voix de reference..." -ForegroundColor Cyan
    $warm = Invoke-RestMethod -Method Post -Uri "$Url/warmup" -TimeoutSec 180
    if (-not (Get-OptionalProperty $warm "ok" $false)) { return $false }
    $conditioned = Get-OptionalProperty $warm "conditioned_reference" $null
    $ref = if ($conditioned) { " + reference" } else { "" }
    $device = [string](Get-OptionalProperty $warm "device" "?")
    $loadMs = [double](Get-OptionalProperty $warm "load_ms" 0)
    Write-Host "[SHINO-OS] Chatterbox READY sur $device$ref ($([math]::Round($loadMs/1000,1)) s)." -ForegroundColor Cyan
    return $true
  } catch {
    Write-Host "[SHINO-OS] Chatterbox warmup echec: $($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

function Test-CurrentWorkerSchema($Health) {
  if ($null -eq $Health) { return $false }
  return $null -ne $Health.PSObject.Properties["ready"]
}

function Start-ChatterboxWorker {
  if (-not (Test-Path $Python)) {
    return $false
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

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 400
    $health = Test-ChatterboxHealth
    if ($health) { return $true }
  }
  return $false
}

$health = Test-ChatterboxHealth
if ($health -and -not (Test-CurrentWorkerSchema $health)) {
  Write-Host "[SHINO-OS] Worker Chatterbox obsolete detecte (schema /health sans ready)." -ForegroundColor Yellow
  if (-not (Stop-StaleChatterboxWorker)) {
    Write-Output ""
    exit 0
  }
  $health = $null
}

if ($health) {
  if ([bool](Get-OptionalProperty $health "ready" $false)) {
    $env:SHINO_TTS_URL = $Url
    Write-Output $Url
    exit 0
  }
  if (Invoke-ChatterboxWarmup) {
    $health = Test-ChatterboxHealth
    if ($health -and [bool](Get-OptionalProperty $health "ready" $false)) {
      $env:SHINO_TTS_URL = $Url
      Write-Output $Url
      exit 0
    }
  }
  Write-Output ""
  exit 0
}

if (-not (Start-ChatterboxWorker)) {
  Write-Host "[SHINO-OS] Worker Chatterbox non joignable apres demarrage." -ForegroundColor Yellow
  Write-Output ""
  exit 0
}

if (-not (Invoke-ChatterboxWarmup)) {
  Write-Output ""
  exit 0
}

$health = Test-ChatterboxHealth
if ($health -and [bool](Get-OptionalProperty $health "ready" $false)) {
  $env:SHINO_TTS_URL = $Url
  Write-Output $Url
  exit 0
}

Write-Output ""
