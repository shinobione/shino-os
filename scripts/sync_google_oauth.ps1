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
$GoogleOAuthPath = Join-Path $JarvisDir "src\jarvis\interfaces\api\google_oauth.py"
$CapabilitiesPath = Join-Path $JarvisDir "src\jarvis\interfaces\ui\static\capabilities.js"
$Port = 18777
if ($env:SHINO_JARVIS_PORT) {
  $parsed = 0
  if ([int]::TryParse($env:SHINO_JARVIS_PORT, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
    $Port = $parsed
  }
}
$CanonicalOrigin = "http://localhost:$Port"

if (-not (Test-Path $GoogleOAuthPath)) { exit 0 }

# SHINO owns a stable local origin. Google OAuth requires an exact redirect URI,
# so never derive it from whichever hostname happened to be used in the browser.
$oauth = Get-Content $GoogleOAuthPath -Raw -Encoding UTF8
$oldRedirect = @'
def _redirect_uri(request: Request, service: str) -> str:
    base = str(request.base_url).rstrip("/")
    if not base.startswith("https://") and "127.0.0.1" not in base and "localhost" not in base:
        base = base.replace("http://", "https://", 1)
    return f"{base}/api/google/callback/{service}"
'@
$newRedirect = @'
def _redirect_uri(request: Request, service: str) -> str:
    # SHINO-OS uses one canonical local OAuth origin so Google redirect URIs stay
    # stable across restarts and regardless of localhost vs 127.0.0.1 navigation.
    if os.getenv("SHINO_OS") == "1":
        return f"__ORIGIN__/api/google/callback/{service}"
    base = str(request.base_url).rstrip("/")
    if not base.startswith("https://") and "127.0.0.1" not in base and "localhost" not in base:
        base = base.replace("http://", "https://", 1)
    return f"{base}/api/google/callback/{service}"
'@
$newRedirect = $newRedirect.Replace("__ORIGIN__", $CanonicalOrigin)

if ($oauth.Contains($oldRedirect)) {
  $oauth = $oauth.Replace($oldRedirect, $newRedirect)
  Set-Content -Path $GoogleOAuthPath -Value $oauth -Encoding UTF8
  Write-Host "[SHINO-OS] Google OAuth callback fixe: $CanonicalOrigin/api/google/callback/{service}" -ForegroundColor Cyan
} elseif ($oauth -match 'SHINO-OS uses one canonical local OAuth origin') {
  $patched = [regex]::Replace(
    $oauth,
    'return f"http://localhost:\d+/api/google/callback/\{service\}"',
    ('return f"' + $CanonicalOrigin + '/api/google/callback/{service}"')
  )
  if ($patched -ne $oauth) {
    Set-Content -Path $GoogleOAuthPath -Value $patched -Encoding UTF8
    Write-Host "[SHINO-OS] Google OAuth callback repinne: $CanonicalOrigin/api/google/callback/{service}" -ForegroundColor Cyan
  } else {
    Write-Host "[SHINO-OS] Google OAuth callback fixe deja applique: $CanonicalOrigin" -ForegroundColor DarkGray
  }
} else {
  Write-Host "[SHINO-OS] Google OAuth upstream inattendu; callback non modifie." -ForegroundColor Yellow
}

# Guard the connect button against repeated clicks while the browser leaves the page.
if (Test-Path $CapabilitiesPath) {
  $ui = Get-Content $CapabilitiesPath -Raw -Encoding UTF8
  $oldConnect = 'connectBtn.addEventListener("click", () => { window.location.href = cfg.url; });'
  $newConnect = 'connectBtn.addEventListener("click", () => { if (connectBtn.disabled) return; connectBtn.disabled = true; connectBtn.textContent = "Connexion…"; window.location.assign(cfg.url); });'
  if ($ui.Contains($oldConnect)) {
    $ui = $ui.Replace($oldConnect, $newConnect)
    Set-Content -Path $CapabilitiesPath -Value $ui -Encoding UTF8
    Write-Host "[SHINO-OS] Google OAuth anti-double-clic actif." -ForegroundColor DarkGray
  }
}
