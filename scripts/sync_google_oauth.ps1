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
$CapabilitiesHtmlPath = Join-Path $JarvisDir "src\jarvis\interfaces\ui\static\capabilities.html"
$Port = 18777
if ($env:SHINO_JARVIS_PORT) {
  $parsed = 0
  if ([int]::TryParse($env:SHINO_JARVIS_PORT, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
    $Port = $parsed
  }
}
$CanonicalOrigin = "http://localhost:$Port"

if (-not (Test-Path $GoogleOAuthPath)) { exit 0 }

# SHINO owns one stable local origin. Google OAuth requires an exact redirect URI,
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

# Capabilities is rendered inside Jarvis' persistent iframe. Google refuses to be
# embedded there, so OAuth MUST escape to the top-level browser tab. Do not use a
# popup and do not navigate the iframe. A top-level location replacement makes a
# tab storm structurally impossible: one click = one navigation in the same tab.
if (Test-Path $CapabilitiesPath) {
  $ui = Get-Content $CapabilitiesPath -Raw -Encoding UTF8

  $singleTabHandler = @'
connectBtn.addEventListener("click", () => {
          const topWin = window.top || window;
          if (topWin.__SHINO_GOOGLE_OAUTH_NAVIGATING__) return;
          topWin.__SHINO_GOOGLE_OAUTH_NAVIGATING__ = true;
          connectBtn.disabled = true;
          connectBtn.textContent = "Connexion…";
          topWin.location.assign(cfg.url);
        });
'@.Trim()

  # Replace every SHINO/legacy variant we have shipped, then fall back to a narrow
  # regex around the connector click handler so stale runtime copies are repaired.
  $variants = @(
    'connectBtn.addEventListener("click", () => { window.location.href = cfg.url; });',
    'connectBtn.addEventListener("click", () => { if (connectBtn.disabled) return; connectBtn.disabled = true; connectBtn.textContent = "Connexion…"; window.location.assign(cfg.url); });'
  )

  $changed = $false
  foreach ($variant in $variants) {
    if ($ui.Contains($variant)) {
      $ui = $ui.Replace($variant, $singleTabHandler)
      $changed = $true
    }
  }

  if ($ui -match '__SHINO_GOOGLE_OAUTH_WINDOW__') {
    $popupPattern = 'connectBtn\.addEventListener\("click", \(\) => \{(?s:.*?)topWin\.__SHINO_GOOGLE_OAUTH_WINDOW__(?s:.*?)\}\);'
    $ui2 = [regex]::Replace($ui, $popupPattern, $singleTabHandler, 1)
    if ($ui2 -ne $ui) {
      $ui = $ui2
      $changed = $true
    }
  }

  # Keep the setup hints aligned with SHINO's actual stable OAuth origin.
  $ui2 = $ui.Replace('http://127.0.0.1:8000/api/google/callback/gmail + .../calendar', ($CanonicalOrigin + '/api/google/callback/gmail + .../calendar'))
  $ui2 = $ui2.Replace('http://localhost:8000/api/google/callback/gmail + .../calendar', ($CanonicalOrigin + '/api/google/callback/gmail + .../calendar'))
  if ($ui2 -ne $ui) {
    $ui = $ui2
    $changed = $true
  }

  if ($changed) {
    Set-Content -Path $CapabilitiesPath -Value $ui -Encoding UTF8
    Write-Host "[SHINO-OS] Google OAuth single-tab top-level actif (iframe/popup desactives)." -ForegroundColor Cyan
  } elseif ($ui -match '__SHINO_GOOGLE_OAUTH_NAVIGATING__') {
    Write-Host "[SHINO-OS] Google OAuth single-tab top-level deja actif." -ForegroundColor DarkGray
  } else {
    Write-Host "[SHINO-OS] Handler OAuth UI upstream inattendu; single-tab non modifie." -ForegroundColor Yellow
  }
}

# Force browsers to fetch the repaired connector JS instead of reusing an older
# cached capabilities.js that can still contain the iframe/popup handler.
if (Test-Path $CapabilitiesHtmlPath) {
  $html = Get-Content $CapabilitiesHtmlPath -Raw -Encoding UTF8
  $html2 = [regex]::Replace($html, '<script src="/capabilities\.js(?:\?[^\"]*)?"></script>', '<script src="/capabilities.js?v=shino-oauth-3"></script>')
  if ($html2 -ne $html) {
    Set-Content -Path $CapabilitiesHtmlPath -Value $html2 -Encoding UTF8
    Write-Host "[SHINO-OS] Cache-bust capabilities OAuth applique." -ForegroundColor DarkGray
  }
}
