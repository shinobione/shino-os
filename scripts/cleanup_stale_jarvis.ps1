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

$JarvisDir = Join-Path $RuntimeRoot "jarvis-OS"
$Port = 8000
if ($env:SHINO_JARVIS_PORT) {
  $parsed = 0
  if ([int]::TryParse($env:SHINO_JARVIS_PORT, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
    $Port = $parsed
  }
}

function Write-Shino([string]$Message, [ConsoleColor]$Color = [ConsoleColor]::DarkGray) {
  Write-Host "[SHINO-OS] $Message" -ForegroundColor $Color
}

function Get-ListenerPids([int]$ListenPort) {
  $ids = @()
  try {
    $rows = @(Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction Stop)
    $ids += @($rows | ForEach-Object { [int]$_.OwningProcess })
  } catch {
    $lines = @(netstat -ano -p tcp 2>$null | Select-String -Pattern (":$ListenPort\s+.*LISTENING\s+(\d+)\s*$"))
    foreach ($line in $lines) {
      if ($line.Matches.Count -gt 0) {
        $ids += [int]$line.Matches[0].Groups[1].Value
      }
    }
  }
  return @($ids | Where-Object { $_ -gt 0 } | Select-Object -Unique)
}

function Describe-Process([int]$Id) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $Id" -ErrorAction SilentlyContinue
  if ($proc) {
    $name = [string]$proc.Name
    $cmd = [string]$proc.CommandLine
    if ($cmd) { return "$name PID=$Id [$cmd]" }
    return "$name PID=$Id"
  }

  $gp = Get-Process -Id $Id -ErrorAction SilentlyContinue
  if ($gp) { return "$($gp.ProcessName) PID=$Id" }
  return "inconnu PID=$Id"
}

function Stop-ListenerPid([int]$Id) {
  # PID 0/4 are kernel/system listeners and must never be force-killed.
  if ($Id -le 4) {
    throw "Le port $Port est reserve par Windows (PID $Id); SHINO ne peut pas le recuperer automatiquement."
  }

  $desc = Describe-Process -Id $Id
  Write-Shino "Port $Port occupe par $desc -> liberation SHINO." Yellow

  try {
    Stop-Process -Id $Id -Force -ErrorAction Stop
  } catch {
    # Some detached cmd/python trees are awkward through Stop-Process. taskkill /T
    # also tears down children and is the reliable Windows fallback here.
    & taskkill.exe /PID $Id /T /F *> $null
  }
}

function Wait-PortFree([int]$ListenPort, [int]$TimeoutMs = 6000) {
  $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    if (-not @(Get-ListenerPids -ListenPort $ListenPort).Count) { return $true }
    Start-Sleep -Milliseconds 180
  } while ((Get-Date) -lt $deadline)
  return $false
}

$pids = @(Get-ListenerPids -ListenPort $Port)
if (-not $pids.Count) { exit 0 }

# SHINO intentionally owns one stable local origin for OAuth and UI:
# http://localhost:8000 (or SHINO_JARVIS_PORT when explicitly overridden).
# Therefore a stale/unknown listener on this canonical port is reclaimed here.
# This script is only invoked by shino.bat before SHINO run/api, so we do not
# silently hop to another port and break Google redirect URIs again.
foreach ($id in $pids) {
  Stop-ListenerPid -Id $id
}

if (-not (Wait-PortFree -ListenPort $Port -TimeoutMs 6000)) {
  $remaining = @(Get-ListenerPids -ListenPort $Port)
  # One last Windows-level attempt in case the listener belonged to a detached
  # process tree whose parent exited during the first pass.
  foreach ($id in $remaining) {
    if ($id -gt 4) {
      try { & taskkill.exe /PID $id /T /F *> $null } catch { }
    }
  }
  Start-Sleep -Milliseconds 500
}

$remaining = @(Get-ListenerPids -ListenPort $Port)
if ($remaining.Count) {
  $details = @($remaining | ForEach-Object { Describe-Process -Id $_ }) -join ', '
  Write-Shino "Impossible de liberer le port ${Port}: $details" Red
  exit 1
}

Write-Shino "Port $Port libere et reserve a SHINO." Cyan
exit 0
