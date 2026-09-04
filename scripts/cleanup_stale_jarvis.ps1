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

function Test-IsJarvisProcess($Proc) {
  if ($null -eq $Proc) { return $false }
  $name = [string]$Proc.Name
  $cmd = [string]$Proc.CommandLine
  if (-not $cmd) { return $false }

  $rootPattern = [regex]::Escape($JarvisDir)
  if ($name -match '(?i)^python(\.exe)?$' -and $cmd -match '(?i)-m\s+jarvis\.app\b') { return $true }
  if ($name -match '(?i)^python(\.exe)?$' -and $cmd -match $rootPattern) { return $true }
  if ($name -match '(?i)^cmd\.exe$' -and $cmd -match $rootPattern -and $cmd -match '(?i)jarvis\.app') { return $true }
  return $false
}

$pids = @(Get-ListenerPids -ListenPort $Port)
if (-not $pids.Count) { exit 0 }

$foreign = @()
foreach ($id in $pids) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $id" -ErrorAction SilentlyContinue
  if (Test-IsJarvisProcess $proc) {
    Write-Shino "Ancienne API Jarvis detectee sur le port $Port (PID $id) -> arret." Cyan
    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
  } else {
    $foreign += [pscustomobject]@{
      Id = $id
      Name = if ($proc) { [string]$proc.Name } else { "inconnu" }
      CommandLine = if ($proc) { [string]$proc.CommandLine } else { "" }
    }
  }
}

$deadline = (Get-Date).AddSeconds(5)
do {
  Start-Sleep -Milliseconds 200
  $remaining = @(Get-ListenerPids -ListenPort $Port)
} while ($remaining.Count -and (Get-Date) -lt $deadline)

if (-not $remaining.Count) {
  Write-Shino "Port $Port libere avant demarrage." DarkGray
  exit 0
}

# Never kill an unrelated app just because it uses SHINO's preferred port.
$details = @($foreign | ForEach-Object { "$($_.Name) PID=$($_.Id)" }) -join ', '
if (-not $details) { $details = "PID(s): $($remaining -join ', ')" }
Write-Shino "Port $Port encore occupe par un process non-Jarvis: $details" Yellow
exit 0
