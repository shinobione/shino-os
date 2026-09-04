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
$GoogleOAuthRel = "src/jarvis/interfaces/api/google_oauth.py"
$CapabilitiesRel = "src/jarvis/interfaces/ui/static/capabilities.js"
$CapabilitiesHtmlRel = "src/jarvis/interfaces/ui/static/capabilities.html"
$GoogleOAuthPath = Join-Path $JarvisDir $GoogleOAuthRel
$CapabilitiesPath = Join-Path $JarvisDir $CapabilitiesRel
$CapabilitiesHtmlPath = Join-Path $JarvisDir $CapabilitiesHtmlRel

$Port = 18777
if ($env:SHINO_JARVIS_PORT) {
  $parsed = 0
  if ([int]::TryParse($env:SHINO_JARVIS_PORT, [ref]$parsed) -and $parsed -ge 1 -and $parsed -le 65535) {
    $Port = $parsed
  }
}
$CanonicalOrigin = "http://localhost:$Port"

if (-not (Test-Path $GoogleOAuthPath)) { exit 0 }

# IMPORTANT: these are upstream runtime files, not SHINO source files. Previous
# iterations patched them in-place and accumulated edits across runs, eventually
# corrupting capabilities.js. Always restore the three files from the pinned
# Jarvis HEAD first, then apply one deterministic SHINO patch from a clean base.
if (Test-Path (Join-Path $JarvisDir ".git")) {
  foreach ($rel in @($GoogleOAuthRel, $CapabilitiesRel, $CapabilitiesHtmlRel)) {
    & git -C $JarvisDir checkout -- $rel 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Impossible de restaurer le fichier Jarvis propre avant patch OAuth: $rel"
    }
  }
  Write-Host "[SHINO-OS] OAuth runtime restaure depuis le pin Jarvis avant patch." -ForegroundColor DarkGray
}

# -----------------------------------------------------------------------------
# 1) Backend: one canonical localhost callback + reject obviously corrupted keys.
# -----------------------------------------------------------------------------
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
    if os.getenv("SHINO_OS") == "1":
        return f"__ORIGIN__/api/google/callback/{service}"
    base = str(request.base_url).rstrip("/")
    if not base.startswith("https://") and "127.0.0.1" not in base and "localhost" not in base:
        base = base.replace("http://", "https://", 1)
    return f"{base}/api/google/callback/{service}"
'@
$newRedirect = $newRedirect.Replace("__ORIGIN__", $CanonicalOrigin)

if (-not $oauth.Contains($oldRedirect)) {
  throw "Bloc _redirect_uri Google OAuth upstream inattendu; patch SHINO refuse plutot que de corrompre le runtime."
}
$oauth = $oauth.Replace($oldRedirect, $newRedirect)

$oldServiceGuard = @'
    if service not in ("gmail", "calendar"):
        return RedirectResponse("/capabilities?error=unknown_service")

    # Si les credentials sont fournis en .env (UI), (re)génère le fichier JSON
'@

$newServiceGuard = @'
    if service not in ("gmail", "calendar"):
        return RedirectResponse("/capabilities?error=unknown_service")

    # The Capabilities API masks secrets. Older SHINO builds accidentally wrote
    # those masked placeholders back into .env. Refuse to send an invalid client
    # to Google; the UI will ask for the real Client ID / Secret again instead.
    if os.getenv("SHINO_OS") == "1":
        client_id = (settings.google_client_id or "").strip()
        client_secret = settings.google_client_secret.get_secret_value().strip()
        masked = any(ch in client_id or ch in client_secret for ch in ("•", "*"))
        if (
            not client_id
            or not client_secret
            or masked
            or not client_id.endswith(".apps.googleusercontent.com")
        ):
            logger.error("SHINO Google OAuth credentials invalid or masked")
            return RedirectResponse("/capabilities?google_error=invalid_client_config")

    # Si les credentials sont fournis en .env (UI), (re)génère le fichier JSON
'@

if (-not $oauth.Contains($oldServiceGuard)) {
  throw "Bloc google_auth upstream inattendu; patch SHINO refuse plutot que de corrompre le runtime."
}
$oauth = $oauth.Replace($oldServiceGuard, $newServiceGuard)
Set-Content -Path $GoogleOAuthPath -Value $oauth -Encoding UTF8

# -----------------------------------------------------------------------------
# 2) Capabilities: deterministic edits only. No broad regex over JS blocks.
# -----------------------------------------------------------------------------
$ui = Get-Content $CapabilitiesPath -Raw -Encoding UTF8

# Stable setup hint.
$ui = $ui.Replace(
  'http://127.0.0.1:8000/api/google/callback/gmail + .../calendar',
  ($CanonicalOrigin + '/api/google/callback/gmail + .../calendar')
)

# Never pre-fill editable fields with masked values returned by /api/settings.
# This was the root cause of invalid_client after a second Save click.
$oldMaskedPrefill = @'
            const v = (ss.api_keys || {})[f.key] || "";
            if (v) inp.value = v;
'@
$newMaskedPrefill = @'
            const configured = Boolean((ss.api_keys || {})[f.key]);
            if (configured) {
              inp.dataset.configured = "1";
              inp.placeholder = f.secret
                ? "Déjà configuré — saisir une nouvelle valeur pour remplacer"
                : "Déjà configuré — laisser vide pour conserver";
            }
'@
if (-not $ui.Contains($oldMaskedPrefill)) {
  throw "Bloc de pre-remplissage credentials upstream inattendu; patch SHINO refuse."
}
$ui = $ui.Replace($oldMaskedPrefill, $newMaskedPrefill)

# OAuth-only connectors must also escape the persistent Jarvis iframe.
$oldPlainOAuth = @'
    if (cfg.kind === "oauth") {
      window.location.href = cfg.url;
      return;
    }
'@
$newPlainOAuth = @'
    if (cfg.kind === "oauth") {
      const target = window.top || window;
      target.location.href = cfg.url;
      return;
    }
'@
if (-not $ui.Contains($oldPlainOAuth)) {
  throw "Bloc OAuth simple upstream inattendu; patch SHINO refuse."
}
$ui = $ui.Replace($oldPlainOAuth, $newPlainOAuth)

# Hybrid OAuth connector (Gmail/Calendar): same browser tab, never iframe/popup.
$oldConnect = '        connectBtn.addEventListener("click", () => { window.location.href = cfg.url; });'
$newConnect = @'
        connectBtn.addEventListener("click", () => {
          if (connectBtn.disabled) return;
          connectBtn.disabled = true;
          connectBtn.textContent = "Connexion…";
          const target = window.top || window;
          target.location.href = cfg.url;
        });
'@.TrimEnd()
if (-not $ui.Contains($oldConnect)) {
  throw "Handler OAuth hybride upstream inattendu; patch SHINO refuse."
}
$ui = $ui.Replace($oldConnect, $newConnect)

# Friendly error when the old masked-value bug has already damaged .env.
$oldInit = @'
  J.mountAtmosphere();

  J.mountRooms({
'@
$newInit = @'
  J.mountAtmosphere();

  const shinoParams = new URLSearchParams(window.location.search);
  if (shinoParams.get("google_error") === "invalid_client_config") {
    window.setTimeout(() => J.notify({
      kind: "error",
      text: "Google OAuth : les identifiants enregistrés sont invalides. Recopie une fois le vrai Client ID et le vrai Client Secret, puis Sauvegarder.",
    }), 150);
  }

  J.mountRooms({
'@
if (-not $ui.Contains($oldInit)) {
  throw "Bloc INIT capabilities upstream inattendu; patch SHINO refuse."
}
$ui = $ui.Replace($oldInit, $newInit)
Set-Content -Path $CapabilitiesPath -Value $ui -Encoding UTF8

# -----------------------------------------------------------------------------
# 3) Cache bust the now-clean capabilities JS.
# -----------------------------------------------------------------------------
$html = Get-Content $CapabilitiesHtmlPath -Raw -Encoding UTF8
$oldScript = '<script src="/capabilities.js"></script>'
$newScript = '<script src="/capabilities.js?v=shino-oauth-clean-1"></script>'
if (-not $html.Contains($oldScript)) {
  throw "Script capabilities.html upstream inattendu; patch SHINO refuse."
}
$html = $html.Replace($oldScript, $newScript)
Set-Content -Path $CapabilitiesHtmlPath -Value $html -Encoding UTF8

Write-Host "[SHINO-OS] Google OAuth propre: callback $CanonicalOrigin, meme onglet, credentials masques non reecrits." -ForegroundColor Cyan
