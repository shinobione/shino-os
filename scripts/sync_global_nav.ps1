$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$GlobalRoot = Join-Path $Root "extensions\global"

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
if (-not (Test-Path $GlobalRoot)) { exit 0 }

$NavJs = Join-Path $GlobalRoot "shino-global-nav.js"
$NavCss = Join-Path $GlobalRoot "shino-global-nav.css"
if (-not (Test-Path $NavJs) -or -not (Test-Path $NavCss)) { exit 0 }

Copy-Item $NavJs (Join-Path $StaticRoot "shino-global-nav.js") -Force
Copy-Item $NavCss (Join-Path $StaticRoot "shino-global-nav.css") -Force

if (-not (Test-Path $SharedJs)) { exit 0 }

$begin = "/* SHINO_GLOBAL_NAV_LOADER_BEGIN */"
$end = "/* SHINO_GLOBAL_NAV_LOADER_END */"
$content = Get-Content $SharedJs -Raw -Encoding UTF8
$pattern = [regex]::Escape($begin) + "(?s).*?" + [regex]::Escape($end)
$content = [regex]::Replace($content, $pattern, "").TrimEnd()

$loader = @'

/* SHINO_GLOBAL_NAV_LOADER_BEGIN */
(function () {
  if (!document.querySelector('link[data-shino-global-nav]')) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/shino-global-nav.css';
    link.dataset.shinoGlobalNav = '1';
    document.head.appendChild(link);
  }
  if (!document.querySelector('script[data-shino-global-nav]')) {
    var script = document.createElement('script');
    script.src = '/shino-global-nav.js';
    script.dataset.shinoGlobalNav = '1';
    document.body.appendChild(script);
  }
})();
/* SHINO_GLOBAL_NAV_LOADER_END */
'@

Set-Content -Path $SharedJs -Value ($content + $loader) -Encoding UTF8
Write-Host "[SHINO-OS] Navigation globale synchronisee (Home direct sur toutes les pages)." -ForegroundColor Cyan
