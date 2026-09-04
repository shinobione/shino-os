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

# OAuth must never create a tab storm. Capabilities runs inside the persistent
# Jarvis iframe, so open Google from the top shell in one stable named popup.
# Even if the handler is somehow triggered repeatedly, the same popup is focused
# instead of creating another browser tab/window.
if (Test-Path $CapabilitiesPath) {
  $ui = Get-Content $CapabilitiesPath -Raw -Encoding UTF8

  $oldConnect = 'connectBtn.addEventListener("click", () => { window.location.href = cfg.url; });'
  $previousConnect = 'connectBtn.addEventListener("click", () => { if (connectBtn.disabled) return; connectBtn.disabled = true; connectBtn.textContent = "Connexion…"; window.location.assign(cfg.url); });'
  $newConnect = @'
connectBtn.addEventListener("click", () => {
          const topWin = window.top || window;
          const now = Date.now();
          const last = Number(topWin.__SHINO_GOOGLE_OAUTH_LAST__ || 0);
          if (now - last < 1500) return;
          topWin.__SHINO_GOOGLE_OAUTH_LAST__ = now;
          const existing = topWin.__SHINO_GOOGLE_OAUTH_WINDOW__;
          if (existing && !existing.closed) {
            try { existing.focus(); } catch (_) {}
            return;
          }
          connectBtn.disabled = true;
          connectBtn.textContent = "Connexion…";
          const popup = topWin.open(cfg.url, "shino-google-oauth", "popup,width=720,height=820,resizable=yes,scrollbars=yes");
          if (popup) {
            topWin.__SHINO_GOOGLE_OAUTH_WINDOW__ = popup;
            const timer = topWin.setInterval(() => {
              if (popup.closed) {
                topWin.clearInterval(timer);
                connectBtn.disabled = false;
                connectBtn.textContent = "Connecter mon compte →";
              }
            }, 500);
          } else {
            connectBtn.disabled = false;
            connectBtn.textContent = "Connecter mon compte →";
            J.notify({ kind: "error", text: "Fenêtre Google bloquée par le navigateur." });
          }
        });
'@

  $changed = $false
  if ($ui.Contains($oldConnect)) {
    $ui = $ui.Replace($oldConnect, $newConnect.Trim())
    $changed = $true
  } elseif ($ui.Contains($previousConnect)) {
    $ui = $ui.Replace($previousConnect, $newConnect.Trim())
    $changed = $true
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
    Write-Host "[SHINO-OS] Google OAuth popup unique + anti-rafale actif." -ForegroundColor Cyan
  } elseif ($ui -match '__SHINO_GOOGLE_OAUTH_WINDOW__') {
    Write-Host "[SHINO-OS] Google OAuth popup unique deja actif." -ForegroundColor DarkGray
  } else {
    Write-Host "[SHINO-OS] Handler OAuth UI upstream inattendu; anti-rafale non modifie." -ForegroundColor Yellow
  }
}
