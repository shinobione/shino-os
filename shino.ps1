param(
  [ValidateSet('setup','run','api','doctor','update','status')]
  [string]$Command = 'run'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeRoot = Join-Path $Root '.runtime'
$JarvisDir = Join-Path $RuntimeRoot 'jarvis-OS'
$LockPath = Join-Path $Root 'UPSTREAM.lock'
$ExtensionsRoot = Join-Path $Root 'extensions'

function Write-Shino([string]$Message) {
  Write-Host "[SHINO-OS] $Message" -ForegroundColor Cyan
}

function Require-Git {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git est requis. Installe Git for Windows puis relance shino.bat.'
  }
}

function Read-UpstreamLock {
  if (-not (Test-Path $LockPath)) { throw "UPSTREAM.lock introuvable: $LockPath" }
  return Get-Content $LockPath -Raw | ConvertFrom-Json
}

function Ensure-Upstream {
  Require-Git
  $lock = Read-UpstreamLock
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

  if (-not (Test-Path (Join-Path $JarvisDir '.git'))) {
    Write-Shino "Clonage de Jarvis OS dans .runtime..."
    git clone $lock.repository $JarvisDir
    if ($LASTEXITCODE -ne 0) { throw 'Échec du clone de Jarvis OS.' }
  }

  Push-Location $JarvisDir
  try {
    git fetch origin --prune
    if ($LASTEXITCODE -ne 0) { throw 'Échec du fetch upstream.' }

    # Fresh installs are reproducible: checkout the version pinned by SHINO-OS.
    git checkout --detach $lock.ref
    if ($LASTEXITCODE -ne 0) { throw "Impossible de checkout le commit upstream $($lock.ref)." }
  }
  finally { Pop-Location }
}

function Set-ShinoEnvironment {
  # Jarvis natively scans this root for skills/, presets/ and views/.
  $env:JARVIS_DEV_EXTENSIONS_DIR = $ExtensionsRoot
  $env:SHINO_OS_ROOT = $Root
  $env:SHINO_OS = '1'
}

function Invoke-Jarvis([string]$JarvisCommand) {
  Ensure-Upstream
  Set-ShinoEnvironment

  $launcher = Join-Path $JarvisDir 'jarvis.bat'
  if (-not (Test-Path $launcher)) { throw "Lanceur Jarvis introuvable: $launcher" }

  Write-Shino "Jarvis backend + extensions SHINO: $JarvisCommand"
  Push-Location $JarvisDir
  try {
    & $launcher $JarvisCommand
    exit $LASTEXITCODE
  }
  finally { Pop-Location }
}

function Show-Status {
  Require-Git
  $lock = Read-UpstreamLock
  Write-Shino "Root: $Root"
  Write-Shino "Extensions: $ExtensionsRoot"
  Write-Shino "Upstream pin: $($lock.ref)"

  if (Test-Path (Join-Path $JarvisDir '.git')) {
    $sha = (git -C $JarvisDir rev-parse HEAD).Trim()
    $branch = (git -C $JarvisDir branch --show-current).Trim()
    if (-not $branch) { $branch = '(detached / pinned)' }
    Write-Shino "Runtime Jarvis: $sha $branch"
    Write-Shino "Bundle présent: $(Test-Path (Join-Path $JarvisDir 'bundle'))"
    Write-Shino ".env présent: $(Test-Path (Join-Path $JarvisDir '.env'))"
  } else {
    Write-Shino 'Runtime Jarvis: non installé.'
  }
}

function Update-Upstream {
  Require-Git
  if (-not (Test-Path (Join-Path $JarvisDir '.git'))) {
    Ensure-Upstream
  }

  Write-Shino 'Mise à jour volontaire vers origin/main...'
  git -C $JarvisDir fetch origin --prune
  if ($LASTEXITCODE -ne 0) { throw 'Échec du fetch upstream.' }
  git -C $JarvisDir checkout --detach origin/main
  if ($LASTEXITCODE -ne 0) { throw 'Échec du checkout origin/main.' }
  $sha = (git -C $JarvisDir rev-parse HEAD).Trim()
  Write-Shino "Runtime mis à jour: $sha"
  Write-Shino 'Note: les nouveaux installs restent sur UPSTREAM.lock tant que ce fichier n’est pas bumpé dans le repo.'
}

switch ($Command) {
  'setup'  { Invoke-Jarvis 'setup' }
  'run'    { Invoke-Jarvis 'run' }
  'api'    { Invoke-Jarvis 'api' }
  'doctor' { Invoke-Jarvis 'doctor' }
  'update' { Update-Upstream }
  'status' { Show-Status }
}
