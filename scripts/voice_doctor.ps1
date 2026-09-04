$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
if ($env:SHINO_RUNTIME_ROOT) {
  $RuntimeRoot = $env:SHINO_RUNTIME_ROOT
} elseif ($env:LOCALAPPDATA) {
  $RuntimeRoot = Join-Path $env:LOCALAPPDATA "SHINO-OS\runtime"
} else {
  $RuntimeRoot = Join-Path $env:USERPROFILE ".shino-os\runtime"
}

$Url = "http://127.0.0.1:8765"
$EnsureWorker = Join-Path $Root "scripts\ensure_natural_tts.ps1"
$WorkerRuntime = Join-Path $RuntimeRoot "workers\chatterbox"
$WorkerPython = Join-Path $WorkerRuntime ".venv\Scripts\python.exe"
$WorkerErrLog = Join-Path $WorkerRuntime "logs\worker.err.log"
$WorkerOutLog = Join-Path $WorkerRuntime "logs\worker.out.log"
$voiceReference = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "SHINO-OS\voice\reference.wav"
} else {
  ""
}

function Write-Shino([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::Cyan) {
  Write-Host "[SHINO-VOICE] $Message" -ForegroundColor $Color
}

function Get-Health {
  try {
    return Invoke-RestMethod -Uri "$Url/health" -Method Get -TimeoutSec 3
  } catch {
    return $null
  }
}

function Show-WorkerLogs {
  Write-Host ""
  Write-Shino "Runtime worker: $WorkerRuntime" DarkGray
  Write-Shino "Python worker present: $(Test-Path $WorkerPython)" DarkGray

  if (Test-Path $WorkerErrLog) {
    Write-Host ""
    Write-Shino "--- worker.err.log (80 dernieres lignes) ---" Yellow
    Get-Content $WorkerErrLog -Tail 80 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
  } else {
    Write-Shino "worker.err.log absent: $WorkerErrLog" Yellow
  }

  if (Test-Path $WorkerOutLog) {
    Write-Host ""
    Write-Shino "--- worker.out.log (30 dernieres lignes) ---" DarkGray
    Get-Content $WorkerOutLog -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
  }
}

function Try-StartWorker {
  if (-not (Test-Path $EnsureWorker)) {
    Write-Shino "Script de lancement Chatterbox introuvable: $EnsureWorker" Red
    return $false
  }
  if (-not (Test-Path $WorkerPython)) {
    Write-Shino "Environnement Chatterbox introuvable: $WorkerPython" Red
    return $false
  }

  Write-Shino "Worker absent: tentative de demarrage autonome..." Yellow
  try {
    $result = [string](& $EnsureWorker -Root $Root -RuntimeRoot $RuntimeRoot | Select-Object -Last 1)
    $result = $result.Trim()
    if ($result) { Write-Shino "ensure_natural_tts -> $result" DarkGray }
  } catch {
    Write-Shino "Demarrage worker en echec: $($_.Exception.Message)" Red
  }

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Get-Health) { return $true }
  }
  return $false
}

function Get-HttpErrorDetail($ErrorRecord) {
  $detail = ""
  try { $detail = [string]$ErrorRecord.ErrorDetails.Message } catch { }
  if ($detail) { return $detail }
  try {
    $response = $ErrorRecord.Exception.Response
    if ($response) {
      $stream = $response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $detail = $reader.ReadToEnd()
        $reader.Dispose()
      }
    }
  } catch { }
  if ($detail) { return $detail }
  return [string]$ErrorRecord.Exception.Message
}

Write-Shino "Diagnostic Chatterbox direct (Jarvis/Ollama/SHINO UI contournes)."

$health = Get-Health
if (-not $health) {
  Write-Shino "Worker $Url introuvable." Red
  $started = Try-StartWorker
  if ($started) {
    Write-Shino "Worker relance et joignable." Green
    $health = Get-Health
  } else {
    Write-Shino "Le worker ne tient pas en vie. Voici les logs du crash." Red
    Show-WorkerLogs
    exit 2
  }
}

Write-Shino "Worker: engine=$($health.engine) loaded=$($health.loaded) device=$($health.device) cuda=$($health.cuda_available)"
if ($health.gpu) { Write-Shino "GPU: $($health.gpu) | free=$($health.cuda_free_mb) MB / total=$($health.cuda_total_mb) MB | reserved=$($health.cuda_reserved_mb) MB" }
if ($health.last_error) { Write-Shino "Erreur precedente: $($health.last_error)" Yellow }
if ($health.last_synth_ms) { Write-Shino "Derniere synthese: $($health.last_synth_ms) ms | count=$($health.synth_count)" }
if ($health.conditioned_reference) { Write-Shino "Reference conditionnee: $($health.conditioned_reference)" }

if (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue) {
  Write-Host ""
  Write-Shino "VRAM globale NVIDIA avant test:"
  & nvidia-smi.exe --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu --format=csv,noheader
}

$payload = @{
  text = "Bonjour Jerry. Ceci est un test direct de la voix Chatterbox."
  language_id = "fr"
  exaggeration = 0.65
  cfg_weight = 0.30
  temperature = 0.75
}

if ($voiceReference -and (Test-Path $voiceReference)) {
  $payload.audio_prompt_path = $voiceReference
  Write-Shino "Reference testee: $voiceReference"
} else {
  Write-Shino "Aucune reference.wav trouvee; test de la voix integree." Yellow
}

$out = Join-Path $env:TEMP "shino-chatterbox-doctor.wav"
$body = $payload | ConvertTo-Json -Compress
$sw = [Diagnostics.Stopwatch]::StartNew()

try {
  Invoke-WebRequest -Uri "$Url/synthesize" -Method Post -ContentType "application/json" -Body $body -OutFile $out -TimeoutSec 120 -UseBasicParsing | Out-Null
  $sw.Stop()
  $bytes = (Get-Item $out).Length
  Write-Shino "SYNTH OK en $([math]::Round($sw.Elapsed.TotalSeconds,2)) s -> $out ($([math]::Round($bytes/1KB,1)) KB)" Green
} catch {
  $sw.Stop()
  $detail = Get-HttpErrorDetail $_
  Write-Shino "SYNTH ECHEC apres $([math]::Round($sw.Elapsed.TotalSeconds,2)) s" Red
  Write-Host $detail -ForegroundColor Red
  $after = Get-Health
  if ($after -and $after.last_error) {
    Write-Shino "Worker last_error: $($after.last_error)" Red
  }
  Show-WorkerLogs
  if (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Shino "VRAM globale NVIDIA apres echec:"
    & nvidia-smi.exe --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu --format=csv,noheader
  }
  exit 1
}

$after = Get-Health
if ($after) {
  Write-Shino "Apres test: synth=$($after.last_synth_ms) ms | conditioning=$($after.conditioning_ms) ms | free CUDA=$($after.cuda_free_mb) MB"
  if ($after.reference_duration_s) {
    Write-Shino "Reference WAV: $($after.reference_duration_s) s (Chatterbox recommande typiquement un clip court ~10 s)."
  }
}

if (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue) {
  Write-Host ""
  Write-Shino "VRAM globale NVIDIA apres test:"
  & nvidia-smi.exe --query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu --format=csv,noheader
}

Write-Shino "Le WAV de test est pret: $out" Green
