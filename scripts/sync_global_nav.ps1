$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($env:SHINO_RUNTIME_ROOT) {
  $RuntimeRoot = $env:SHINO_RUNTIME_ROOT
} elseif ($env:LOCALAPPDATA) {
  $RuntimeRoot = Join-Path $env:LOCALAPPDATA "SHINO-OS\runtime"
} else {
  $RuntimeRoot = Join-Path $env:USERPROFILE ".shino-os\runtime"
}

$JarvisDir = Join-Path $RuntimeRoot "jarvis-OS"
$StaticRoot = Join-Path $JarvisDir "src\jarvis\interfaces\ui\static"
$SharedJs = Join-Path $StaticRoot "_shared.js"

if (-not (Test-Path $StaticRoot)) { exit 0 }

# V0.2.4: remove the old cross-page SHINO navigation injection. Jarvis already
# owns an iframe-aware router from the persistent Home shell; duplicating it in
# every child page caused full-page/iframe navigation races.
if (Test-Path $SharedJs) {
  $begin = "/* SHINO_GLOBAL_NAV_LOADER_BEGIN */"
  $end = "/* SHINO_GLOBAL_NAV_LOADER_END */"
  $content = Get-Content $SharedJs -Raw -Encoding UTF8
  $pattern = [regex]::Escape($begin) + "(?s).*?" + [regex]::Escape($end)
  $clean = [regex]::Replace($content, $pattern, "").TrimEnd()
  Set-Content -Path $SharedJs -Value ($clean + [Environment]::NewLine) -Encoding UTF8
}

foreach ($legacy in @("shino-global-nav.js", "shino-global-nav.css")) {
  $path = Join-Path $StaticRoot $legacy
  if (Test-Path $path) { Remove-Item $path -Force }
}

Write-Host "[SHINO-OS] Legacy global navigation removed; native Jarvis iframe router is authoritative." -ForegroundColor Cyan
