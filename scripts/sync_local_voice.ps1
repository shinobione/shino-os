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
$AppPath = Join-Path $JarvisDir "src\jarvis\app.py"
$ApiDir = Join-Path $JarvisDir "src\jarvis\interfaces\api"
$OverlayRouter = Join-Path $Root "runtime_overlay\jarvis\interfaces\api\shino_local_voice.py"
$EnvPath = Join-Path $JarvisDir ".env"

if (-not (Test-Path $AppPath)) { exit 0 }
if (-not (Test-Path $OverlayRouter)) { exit 0 }

New-Item -ItemType Directory -Force -Path $ApiDir | Out-Null
Copy-Item $OverlayRouter (Join-Path $ApiDir "shino_local_voice.py") -Force

$begin = "# SHINO_LOCAL_VOICE_BEGIN"
$end = "# SHINO_LOCAL_VOICE_END"
$content = Get-Content $AppPath -Raw -Encoding UTF8
$pattern = [regex]::Escape($begin) + "(?s).*?" + [regex]::Escape($end) + "\r?\n?"
$content = [regex]::Replace($content, $pattern, "")

$block = @'
# SHINO_LOCAL_VOICE_BEGIN
from jarvis.interfaces.api.shino_local_voice import router as shino_local_voice_router  # noqa: E402
app.include_router(shino_local_voice_router)
# SHINO_LOCAL_VOICE_END

'@

$surface = [regex]::Match($content, '(?m)^# .*\[SURFACE\].*$')
if (-not $surface.Success) {
  throw "Ancre SURFACE Jarvis introuvable dans app.py pour le bridge vocal SHINO."
}
$content = $content.Insert($surface.Index, $block)
Set-Content -Path $AppPath -Value $content -Encoding UTF8

function Set-EnvValue([string]$Name, [string]$Value) {
  if (-not (Test-Path $EnvPath)) { return }
  $lines = @(Get-Content $EnvPath -Encoding UTF8)
  $found = $false
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match ("^\s*" + [regex]::Escape($Name) + "\s*=")) {
      $lines[$i] = "$Name=$Value"
      $found = $true
      break
    }
  }
  if (-not $found) { $lines += "$Name=$Value" }
  Set-Content -Path $EnvPath -Value $lines -Encoding UTF8
}

# SHINO voice path: browser mic -> Handy headless/Vulkan -> Ollama -> Piper.
# handy.exe is auto-detected under %LOCALAPPDATA%\Handy unless SHINO_HANDY_EXE overrides it.
# Handy runtime model lookup uses the local model key/slug, not the catalog repository id.
Set-EnvValue "SHINO_STT_BACKEND" "handy"
Set-EnvValue "SHINO_HANDY_MODEL" "whisper-large-v3-turbo"
Set-EnvValue "SHINO_HANDY_DEVICE_INDEX" "0"
Set-EnvValue "TTS_PROVIDER" "piper"

Write-Host "[SHINO-OS] Voix locale synchronisee: Handy + Whisper Large V3 Turbo (device 0) + Ollama + Piper." -ForegroundColor Cyan
if ($env:SHINO_STT_URL) {
  Write-Host "[SHINO-OS] Noeud STT LAN configure: $env:SHINO_STT_URL" -ForegroundColor Cyan
}
