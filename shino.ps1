param(
  [ValidateSet("setup","run","api","doctor","update","status")]
  [string]$Command = "run"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($env:SHINO_RUNTIME_ROOT) {
  $RuntimeRoot = $env:SHINO_RUNTIME_ROOT
} elseif ($env:LOCALAPPDATA) {
  $RuntimeRoot = Join-Path $env:LOCALAPPDATA "SHINO-OS\runtime"
} else {
  $RuntimeRoot = Join-Path $env:USERPROFILE ".shino-os\runtime"
}

$JarvisDir = Join-Path $RuntimeRoot "jarvis-OS"
$LockPath = Join-Path $Root "UPSTREAM.lock"
$ExtensionsRoot = Join-Path $Root "extensions"

function Write-Shino([string]$Message) {
  Write-Host "[SHINO-OS] $Message" -ForegroundColor Cyan
}

function Require-Git {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git est requis. Installe Git for Windows puis relance shino.bat."
  }
}

function Read-UpstreamLock {
  if (-not (Test-Path $LockPath)) {
    throw "UPSTREAM.lock introuvable: $LockPath"
  }
  return Get-Content $LockPath -Raw | ConvertFrom-Json
}

function Ensure-Upstream {
  Require-Git
  $lock = Read-UpstreamLock
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null

  if ($JarvisDir -match "(?i)[\\/]OneDrive[\\/]") {
    throw "Runtime Jarvis refuse sous OneDrive: $JarvisDir"
  }

  if (-not (Test-Path (Join-Path $JarvisDir ".git"))) {
    Write-Shino "Clonage de Jarvis OS hors OneDrive: $JarvisDir"
    git clone $lock.repository $JarvisDir
    if ($LASTEXITCODE -ne 0) {
      throw "Echec du clone de Jarvis OS."
    }

    git -C $JarvisDir checkout --detach $lock.ref
    if ($LASTEXITCODE -ne 0) {
      throw "Impossible de checkout le commit upstream $($lock.ref)."
    }
    Write-Shino "Runtime initial verrouille sur $($lock.ref)."
  }
}

function Ensure-SetupBundle {
  $manifest = Join-Path $JarvisDir "bundle\manifest.json"
  $bundlePython = Join-Path $JarvisDir "bundle\.venv\Scripts\python.exe"
  $devPython = Join-Path $JarvisDir ".venv\Scripts\python.exe"

  if ((Test-Path $manifest) -and (Test-Path $bundlePython)) { return }
  if (Test-Path $devPython) { return }

  $downloader = Join-Path $JarvisDir "scripts\download_bundle.ps1"
  if (-not (Test-Path $downloader)) {
    Write-Shino "Downloader du bundle upstream introuvable; Jarvis gerera son setup normalement."
    return
  }

  Write-Shino "Installation du bundle Windows officiel Jarvis (~658 MB)..."
  . $downloader
  Install-JarvisBundle -ProjectRoot $JarvisDir

  if (-not ((Test-Path $manifest) -and (Test-Path $bundlePython))) {
    throw "Le bundle Jarvis ne semble pas utilisable apres telechargement."
  }
  Write-Shino "Bundle Jarvis pret."
}

function Set-ShinoEnvironment {
  $env:JARVIS_DEV_EXTENSIONS_DIR = $ExtensionsRoot
  $env:SHINO_OS_ROOT = $Root
  $env:SHINO_OS = "1"
}

function Get-JarvisPort {
  $port = 8000
  $envPath = Join-Path $JarvisDir ".env"

  if (Test-Path $envPath) {
    $line = Get-Content $envPath -Encoding UTF8 | Where-Object { $_ -match "^\s*PORT\s*=\s*\d+\s*$" } | Select-Object -First 1
    if ($line -and ($line -match "=\s*(\d+)\s*$")) {
      $port = [int]$Matches[1]
    }
  }

  return $port
}

function Set-JarvisPort {
  param([int]$Port)

  $envPath = Join-Path $JarvisDir ".env"
  if (-not (Test-Path $envPath)) {
    throw "Fichier .env Jarvis introuvable: $envPath"
  }

  $lines = @(Get-Content $envPath -Encoding UTF8)
  $replaced = $false

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s*PORT\s*=") {
      $lines[$i] = "PORT=$Port"
      $replaced = $true
      break
    }
  }

  if (-not $replaced) {
    $lines += "PORT=$Port"
  }

  Set-Content -Path $envPath -Value $lines -Encoding UTF8
}

function Get-ShinoStableJarvisPort {
  $port = 8000
  if ($env:SHINO_JARVIS_PORT) {
    $parsed = 0
    if (-not [int]::TryParse($env:SHINO_JARVIS_PORT, [ref]$parsed)) {
      throw "SHINO_JARVIS_PORT invalide: $($env:SHINO_JARVIS_PORT)"
    }
    if ($parsed -lt 1 -or $parsed -gt 65535) {
      throw "SHINO_JARVIS_PORT hors plage: $parsed"
    }
    $port = $parsed
  }
  return $port
}

function Ensure-StableJarvisPort {
  # IMPORTANT: ne pas sonder puis incrementer le port ici.
  # Jarvis nettoie lui-meme ses anciens process/listeners au demarrage.
  # L'ancien comportement SHINO incrementait le PORT avant ce nettoyage,
  # laissait les instances precedentes vivantes et cassait les redirect URI OAuth.
  $stablePort = Get-ShinoStableJarvisPort
  $configuredPort = Get-JarvisPort
  if ($configuredPort -ne $stablePort) {
    Set-JarvisPort -Port $stablePort
    Write-Shino "Port Jarvis repinne: $configuredPort -> $stablePort (URL/OAuth stable)."
  } else {
    Write-Shino "Port Jarvis fixe: $stablePort (URL/OAuth stable)."
  }
  return $stablePort
}

function Sync-ShinoInstalledViews {
  $viewsRoot = Join-Path $ExtensionsRoot "views"
  if (-not (Test-Path $viewsRoot)) { return }

  $staticRoot = Join-Path $JarvisDir "src\jarvis\interfaces\ui\static\skills"
  $installedRoot = Join-Path $JarvisDir "skills_data\installed"
  New-Item -ItemType Directory -Force -Path $staticRoot | Out-Null
  New-Item -ItemType Directory -Force -Path $installedRoot | Out-Null

  foreach ($viewDir in Get-ChildItem -Path $viewsRoot -Directory) {
    $name = $viewDir.Name
    $skillYaml = Join-Path $viewDir.FullName "skill.yaml"
    $skillPy = Join-Path $viewDir.FullName "skill.py"
    $viewJs = Join-Path $viewDir.FullName "view.js"

    if (-not (Test-Path $skillYaml) -or -not (Test-Path $skillPy) -or -not (Test-Path $viewJs)) {
      Write-Shino "Vue ignoree (packaging incomplet): $name"
      continue
    }

    $staticDest = Join-Path $staticRoot $name
    $installedDest = Join-Path $installedRoot $name

    if (Test-Path $staticDest) { Remove-Item $staticDest -Recurse -Force }
    if (Test-Path $installedDest) { Remove-Item $installedDest -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $staticDest | Out-Null
    New-Item -ItemType Directory -Force -Path $installedDest | Out-Null

    Get-ChildItem -Path $viewDir.FullName -File | Where-Object {
      $_.Extension -in @(".js", ".css")
    } | ForEach-Object {
      Copy-Item $_.FullName (Join-Path $staticDest $_.Name) -Force
    }

    Copy-Item $skillYaml (Join-Path $installedDest "skill.yaml") -Force
    Copy-Item $skillPy (Join-Path $installedDest "skill.py") -Force

    Write-Shino "Vue Jarvis synchronisee: $name"
  }
}

function Sync-LocalVoiceRuntime {
  $script = Join-Path $Root "scripts\sync_local_voice.ps1"
  if (-not (Test-Path $script)) { return }
  $env:SHINO_RUNTIME_ROOT = $RuntimeRoot
  & $script
}

function Invoke-Jarvis([string]$JarvisCommand) {
  Ensure-Upstream
  Set-ShinoEnvironment

  if ($JarvisCommand -eq "setup") {
    Ensure-SetupBundle
  }

  if ($JarvisCommand -in @("run", "api")) {
    $activePort = Ensure-StableJarvisPort
    Write-Shino "Port Jarvis: $activePort"
  }

  Sync-ShinoInstalledViews
  if ($JarvisCommand -in @("run", "api")) {
    Sync-LocalVoiceRuntime
  }

  $launcher = Join-Path $JarvisDir "jarvis.bat"
  if (-not (Test-Path $launcher)) {
    throw "Lanceur Jarvis introuvable: $launcher"
  }

  Write-Shino "Jarvis backend + extensions SHINO: $JarvisCommand"
  Push-Location $JarvisDir
  try {
    & $launcher $JarvisCommand
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }
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

  if (Test-Path (Join-Path $JarvisDir ".git")) {
    $sha = (git -C $JarvisDir rev-parse HEAD).Trim()
    $branch = (git -C $JarvisDir rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -eq "HEAD") { $branch = "(detached)" }
    Write-Shino "Runtime Jarvis: $sha $branch"
    Write-Shino "Au pin: $($sha -eq $lock.ref)"
    Write-Shino "Port configure: $(Get-JarvisPort)"
    Write-Shino "Bundle present: $(Test-Path (Join-Path $JarvisDir "bundle\manifest.json"))"
    Write-Shino ".env present: $(Test-Path (Join-Path $JarvisDir ".env"))"
    Write-Shino "Command Center stage: $(Test-Path (Join-Path $JarvisDir "skills_data\installed\shino-command-center\skill.yaml"))"
  } else {
    Write-Shino "Runtime Jarvis: non installe."
  }
}

function Update-Upstream {
  Require-Git
  Ensure-Upstream

  Write-Shino "Mise a jour volontaire vers origin/main..."
  git -C $JarvisDir fetch origin --prune
  if ($LASTEXITCODE -ne 0) { throw "Echec du fetch upstream." }
  git -C $JarvisDir checkout --detach origin/main
  if ($LASTEXITCODE -ne 0) { throw "Echec du checkout origin/main." }
  $sha = (git -C $JarvisDir rev-parse HEAD).Trim()
  Write-Shino "Runtime mis a jour: $sha"
}

switch ($Command) {
  "setup"  { Invoke-Jarvis "setup" }
  "run"    { Invoke-Jarvis "run" }
  "api"    { Invoke-Jarvis "api" }
  "doctor" { Invoke-Jarvis "doctor" }
  "update" { Update-Upstream }
  "status" { Show-Status }
}