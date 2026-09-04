$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$WorkerRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeRoot = if ($env:SHINO_RUNTIME_ROOT) {
  $env:SHINO_RUNTIME_ROOT
} elseif ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "SHINO-OS\runtime"
} else {
  Join-Path $env:USERPROFILE ".shino-os\runtime"
}
$WorkerRuntime = Join-Path $RuntimeRoot "workers\chatterbox"
$Venv = Join-Path $WorkerRuntime ".venv"
$Python = Join-Path $Venv "Scripts\python.exe"

New-Item -ItemType Directory -Force -Path $WorkerRuntime | Out-Null

$drive = Get-PSDrive -Name ([System.IO.Path]::GetPathRoot($RuntimeRoot).Substring(0,1)) -ErrorAction SilentlyContinue
if ($drive) {
  $freeGb = [math]::Round($drive.Free / 1GB, 1)
  Write-Host "[SHINO-OS] Espace libre: $freeGb GB" -ForegroundColor Cyan
  if ($freeGb -lt 8) {
    throw "Moins de 8 GB libres. Libere de l'espace avant d'installer Chatterbox."
  }
}

$bootstrap = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  try {
    & py -3.11 -c "import sys; print(sys.version)" | Out-Null
    if ($LASTEXITCODE -eq 0) { $bootstrap = @("py", "-3.11") }
  } catch { }
}
if (-not $bootstrap -and (Get-Command python -ErrorAction SilentlyContinue)) {
  $bootstrap = @("python")
}
if (-not $bootstrap) {
  throw "Python 3.10+ requis pour Chatterbox. Installe Python 3.11 puis relance."
}

if (-not (Test-Path $Python)) {
  Write-Host "[SHINO-OS] Creation du venv Chatterbox: $Venv" -ForegroundColor Cyan
  if ($bootstrap.Count -eq 2) {
    & $bootstrap[0] $bootstrap[1] -m venv $Venv
  } else {
    & $bootstrap[0] -m venv $Venv
  }
  if ($LASTEXITCODE -ne 0) { throw "Echec creation venv Chatterbox." }
}

Write-Host "[SHINO-OS] Installation Chatterbox Multilingual V3 + worker..." -ForegroundColor Cyan
& $Python -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "Echec mise a jour pip." }
& $Python -m pip install -r (Join-Path $WorkerRoot "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Echec installation dependances Chatterbox." }

function Get-TorchCudaState {
  $value = [string](& $Python -c "import torch; print('true' if torch.cuda.is_available() else 'false')")
  return $value.Trim().ToLowerInvariant()
}

$cuda = Get-TorchCudaState
Write-Host "[SHINO-OS] Torch CUDA disponible: $cuda" -ForegroundColor Cyan

if ($cuda -ne "true") {
  Write-Host "[SHINO-OS] PyTorch CPU detecte; installation du build officiel CUDA 12.4..." -ForegroundColor Yellow
  & $Python -m pip install --upgrade --force-reinstall `
    "torch==2.6.0" "torchaudio==2.6.0" `
    --index-url "https://download.pytorch.org/whl/cu124"
  if ($LASTEXITCODE -ne 0) {
    throw "Echec installation PyTorch CUDA 12.4."
  }

  $cuda = Get-TorchCudaState
  Write-Host "[SHINO-OS] Torch CUDA apres correction: $cuda" -ForegroundColor Cyan
}

if ($cuda -ne "true") {
  Write-Host "[SHINO-OS] CUDA reste indisponible; diagnostic NVIDIA:" -ForegroundColor Yellow
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    & nvidia-smi
  } else {
    Write-Host "[SHINO-OS] nvidia-smi introuvable dans le PATH." -ForegroundColor Yellow
  }
  throw "Chatterbox GPU non pret: torch.cuda.is_available() est false. Prechargement CPU refuse."
}

& $Python -c "import torch; print('torch', torch.__version__, 'cuda_runtime', torch.version.cuda, 'gpu', torch.cuda.get_device_name(0))"
if ($LASTEXITCODE -ne 0) { throw "Verification GPU PyTorch impossible." }

Write-Host "[SHINO-OS] Prechargement du modele Multilingual V3 (telechargement au premier setup)..." -ForegroundColor Cyan
& $Python -c "from chatterbox.mtl_tts import ChatterboxMultilingualTTS; m=ChatterboxMultilingualTTS.from_pretrained(device='cuda', t3_model='v3'); print('ready', m.sr)"
if ($LASTEXITCODE -ne 0) { throw "Echec telechargement/prechargement Chatterbox Multilingual V3." }

Write-Host ""
Write-Host "[SHINO-OS] Chatterbox Multilingual V3 pret sur GPU." -ForegroundColor Green
Write-Host "[SHINO-OS] Ensuite .\shino.bat run le demarrera automatiquement; Piper restera le fallback." -ForegroundColor Cyan
