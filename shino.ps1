param(
  [ValidateSet('setup','run','api','doctor','update','status')]
  [string]$Command = 'run'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Jarvis' embedded Python/venv bundle must NOT live under OneDrive.
# SHINO-OS itself may live in a synced Git folder, but the runtime is deliberately
# stored outside the repo. Override with SHINO_RUNTIME_ROOT if ever needed.
if ($env:SHINO_RUNTIME_ROOT) {
  $RuntimeRoot = $env:SHINO_RUNTIME_ROOT
} elseif ($env:LOCALAPPDATA) {
  $RuntimeRoot = Join-Path $env:LOCALAPPDATA 'SHINO-OS\runtime'
} else {
  $RuntimeRoot = Join-Path $env:USERPROFILE '.shino-os\runtime'
}

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

  if ($JarvisDir -match '(?i)[\\/]OneDrive[\\/]') {
    throw "Runtime Jarvis refusé sous OneDrive: $JarvisDir. Définis SHINO_RUNTIME_ROOT vers un dossier local hors OneDrive."
  }

  if (-not (Test-Path (Join-Path $JarvisDir '.git'))) {
    Write-Shino "Clonage de Jarvis OS hors OneDrive: $JarvisDir"
    git clone $lock.repository $JarvisDir
    if ($LASTEXITCODE -ne 0) { throw 'Échec du clone de Jarvis OS.' }

    # Only a fresh runtime is forced to the reproducible pin.
    git -C $JarvisDir checkout --detach $lock.ref
    if ($LASTEXITCODE -ne 0) { throw "Impossible de checkout le commit upstream $($lock.ref)." }
    Write-Shino "Runtime initial verrouillé sur $($lock.ref)."
  }
}

function Ensure-SetupBundle {
  $manifest = Join-Path $JarvisDir 'bundle\manifest.json'
  $bundlePython = Join-Path $JarvisDir 'bundle\.venv\Scripts\python.exe'
  $devPython = Join-Path $JarvisDir '.venv\Scripts\python.exe'

  # Existing final-user bundle or deliberate dev venv: nothing to do.
  if ((Test-Path $manifest) -and (Test-Path $bundlePython)) { return }
  if (Test-Path $devPython) { return }

  $downloader = Join-Path $JarvisDir 'scripts\download_bundle.ps1'
  if (-not (Test-Path $downloader)) {
    Write-Shino 'Downloader du bundle upstream introuvable; Jarvis gérera son setup normalement.'
    return
  }

  Write-Shino 'Installation du bundle Windows officiel Jarvis (~658 MB)...'
  . $downloader
  Install-JarvisBundle -ProjectRoot $JarvisDir

  if (-not ((Test-Path $manifest) -and (Test-Path $bundlePython))) {
    throw 'Le bundle Jarvis ne semble pas utilisable après téléchargement.'
  }
  Write-Shino 'Bundle Jarvis prêt.'
}

function Set-ShinoEnvironment {
  # Jarvis natively scans this root for dev skills/presets and mounts dev views.
  # The current upstream view-script endpoint still enumerates installed views,
  # therefore Sync-ShinoInstalledViews also stages SHINO views into that path.
  $env:JARVIS_DEV_EXTENSIONS_DIR = $ExtensionsRoot
  $env:SHINO_OS_ROOT = $Root
  $env:SHINO_OS = '1'
}

function Sync-ShinoInstalledViews {
  $viewsRoot = Join-Path $ExtensionsRoot 'views'
  if (-not (Test-Path $viewsRoot)) { return }

  $staticRoot = Join-Path $JarvisDir 'src\jarvis\interfaces\ui\static\skills'
  $installedRoot = Join-Path $JarvisDir 'skills_data\installed'
  New-Item -ItemType Directory -Force -Path $staticRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $installedRoot | Out-Null

  foreach ($viewDir in Get-ChildItem -Path $viewsRoot -Directory) {
    $name = $viewDir.Name
    $skillYaml = Join-Path $viewDir.FullName 'skill.yaml'
    $skillPy = Join-Path $viewDir.FullName 'skill.py'
    $viewJs = Join-Path $viewDir.FullName 'view.js'

    if (-not (Test-Path $skillYaml) -or -not (Test-Path $skillPy) -or -not (Test-Path $viewJs)) {
      Write-Shino "Vue ignorée (packaging incomplet): $name"
      continue
    }

    $staticDest = Join-Path $staticRoot $name
    $installedDest = Join-Path $installedRoot $name

    # Rebuild only our named staging directories so stale JS/CSS never survives a pull.
    if (Test-Path $staticDest) { Remove-Item $staticDest -Recurse -Force }
    if (Test-Path $installedDest) { Remove-Item $installedDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $staticDest | Out-Null
    New-Item -ItemType Directory -Force -Path $installedDest | Out-Null

    Get-ChildItem -Path $viewDir.FullName -File | Where-Object {
      $_.Extension -in @('.js', '.css')
    } | ForEach-Object {
      Copy-Item $_.FullName (Join-Path $staticDest $_.Name) -Force
    }

    Copy-Item $skillYaml (Join-Path $installedDest 'skill.yaml') -Force
    Copy-Item $skillPy (Join-Path $installedDest 'skill.py') -Force

    Write-Shino "Vue Jarvis synchronisée: $name"
  }
}

function Invoke-Jarvis([string]$JarvisCommand) {
  Ensure-Upstream
  Set-ShinoEnvironment

  if ($JarvisCommand -eq 'setup') {
    Ensure-SetupBundle
  }

  # Current Jarvis upstream mounts dev view assets but /api/skills/view-scripts
  # only enumerates installed view metadata. Stage our overlay before every launch.
  Sync-ShinoInstalledViews

  $launcher = Join-Path $JarvisDir 'jarvis.bat'
  if (-not (Test-Path $launcher)) { throw "Lanceur Jarvis introuvable: $launcher" }

  Write-Shino "Jarvis backend + extensions SHINO: $JarvisCommand"
  Push-Location $JarvisDir
  try {
    & $launcher $JarvisCommand
    $code = $LASTEXITCODE
  }
  finally { Pop-Location }
  exit $code
}

function Show-Status {
  Require-Git
  $lock = Read-UpstreamLock
  Write-Shino "Root SHINO: $Root"
  Write-Shino "Extensions: $ExtensionsRoot"
  Write-Shino "Runtime root: $RuntimeRoot"
  Write-Shino "Jarvis runtime: $JarvisDir"
  Write-Shino "Upstream pin: $($lock.ref)"

  if (Test-Path (Join-Path $JarvisDir '.git')) {
    $sha = (git -C $JarvisDir rev-parse HEAD).Trim()
    # Unlike `git branch --show-current`, this always emits text:
    # a branch name when attached, or the literal `HEAD` when detached.
    $branch = (git -C $JarvisDir rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -eq 'HEAD') { $branch = '(detached)' }
    Write-Shino "Runtime Jarvis: $sha $branch"
    Write-Shino "Au pin: $($sha -eq $lock.ref)"
    Write-Shino "Bundle présent: $(Test-Path (Join-Path $JarvisDir 'bundle\manifest.json'))"
    Write-Shino ".env présent: $(Test-Path (Join-Path $JarvisDir '.env'))"
    Write-Shino "Command Center stagé: $(Test-Path (Join-Path $JarvisDir 'skills_data\installed\shino-command-center\skill.yaml'))"
  } else {
    Write-Shino 'Runtime Jarvis: non installé.'
  }
}

function Update-Upstream {
  Require-Git
  Ensure-Upstream

  Write-Shino 'Mise à jour volontaire vers origin/main...'
  git -C $JarvisDir fetch origin --prune
  if ($LASTEXITCODE -ne 0) { throw 'Échec du fetch upstream.' }
  git -C $JarvisDir checkout --detach origin/main
  if ($LASTEXITCODE -ne 0) { throw 'Échec du checkout origin/main.' }
  $sha = (git -C $JarvisDir rev-parse HEAD).Trim()
  Write-Shino "Runtime mis à jour: $sha"
  Write-Shino 'Les futurs run gardent ce commit. Les nouveaux installs restent sur UPSTREAM.lock jusqu’au prochain bump du repo.'
}

switch ($Command) {
  'setup'  { Invoke-Jarvis 'setup' }
  'run'    { Invoke-Jarvis 'run' }
  'api'    { Invoke-Jarvis 'api' }
  'doctor' { Invoke-Jarvis 'doctor' }
  'update' { Update-Upstream }
  'status' { Show-Status }
}
