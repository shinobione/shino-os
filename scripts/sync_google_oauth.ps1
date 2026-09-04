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

function Replace-RegexOnce {
  param(
    [string]$Text,
    [string]$Pattern,
    [string]$Replacement,
    [string]$Label
  )
  $rx = [regex]::new($Pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
  $matches = $rx.Matches($Text)
  if ($matches.Count -ne 1) {
    throw "${Label}: attendu 1 bloc upstream, trouve $($matches.Count). Patch refuse pour ne pas corrompre Jarvis."
  }
  return $rx.Replace($Text, $Replacement, 1)
}

# These are upstream runtime files, not SHINO source files. Previous iterations
# patched them in-place and accumulated edits across runs. Always reset this tiny
# surface from the pinned Jarvis HEAD, then apply one deterministic patch.
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
# 1) Backend: one canonical callback + reject masked/corrupted credentials.
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
  throw "Bloc _redirect_uri Google OAuth upstream inattendu; patch SHINO refuse."
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

    # Older SHINO builds accidentally wrote masked placeholders from /api/settings
    # back into .env. Do not send such a fake client to Google.
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
  throw "Bloc google_auth upstream inattendu; patch SHINO refuse."
}
$oauth = $oauth.Replace($oldServiceGuard, $newServiceGuard)
Set-Content -Path $GoogleOAuthPath -Value $oauth -Encoding UTF8

# -----------------------------------------------------------------------------
# 2) Capabilities: tiny, count-checked edits only.
# -----------------------------------------------------------------------------
$ui = Get-Content $CapabilitiesPath -Raw -Encoding UTF8
$ui = $ui.Replace(
  'http://127.0.0.1:8000/api/google/callback/gmail + .../calendar',
  ($CanonicalOrigin + '/api/google/callback/gmail + .../calendar')
)

# Root cause of invalid_client: the upstream endpoint returns API values masked,
# but Capabilities put those masks back into editable inputs. A later Save wrote
# the mask to .env. Keep the fields empty and only indicate that a value exists.
$maskedPattern = '(?m)^[ \t]*const v = \(ss\.api_keys \|\| \{\}\)\[f\.key\] \|\| "";\r?\n[ \t]*if \(v\) inp\.value = v;[ \t]*$'
$maskedReplacement = @'
            const configured = Boolean((ss.api_keys || {})[f.key]);
            if (configured) {
              inp.dataset.configured = "1";
              inp.placeholder = f.secret
                ? "Déjà configuré — saisir une nouvelle valeur pour remplacer"
                : "Déjà configuré — laisser vide pour conserver";
            }
'@.TrimEnd()
$ui = Replace-RegexOnce -Text $ui -Pattern $maskedPattern -Replacement $maskedReplacement -Label "Credentials masques"

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

# Gmail/Calendar/other hybrid OAuth: same browser tab, never iframe and never popup.
$connectPattern = '(?m)^[ \t]*connectBtn\.addEventListener\("click", \(\) => \{ window\.location\.href = cfg\.url; \}\);[ \t]*$'
$connectReplacement = @'
        connectBtn.addEventListener("click", () => {
          if (connectBtn.disabled) return;
          connectBtn.disabled = true;
          connectBtn.textContent = "Connexion…";
          const target = window.top || window;
          target.location.href = cfg.url;
        });
'@.TrimEnd()
$ui = Replace-RegexOnce -Text $ui -Pattern $connectPattern -Replacement $connectReplacement -Label "Handler OAuth hybride"

# Friendly message if the old masked-value bug already damaged .env.
$initPattern = '(?m)^  J\.mountAtmosphere\(\);[ \t]*$'
$initReplacement = @'
  J.mountAtmosphere();

  const shinoParams = new URLSearchParams(window.location.search);
  if (shinoParams.get("google_error") === "invalid_client_config") {
    window.setTimeout(() => J.notify({
      kind: "error",
      text: "Google OAuth : les identifiants enregistrés sont invalides. Recopie une fois le vrai Client ID et le vrai Client Secret, puis Sauvegarder.",
    }), 150);
  }
'@.TrimEnd()
$ui = Replace-RegexOnce -Text $ui -Pattern $initPattern -Replacement $initReplacement -Label "INIT Capabilities"
Set-Content -Path $CapabilitiesPath -Value $ui -Encoding UTF8

# -----------------------------------------------------------------------------
# 3) Cache-bust only this repaired page.
# -----------------------------------------------------------------------------
$html = Get-Content $CapabilitiesHtmlPath -Raw -Encoding UTF8
$oldScript = '<script src="/capabilities.js"></script>'
$newScript = '<script src="/capabilities.js?v=shino-oauth-clean-2"></script>'
if (-not $html.Contains($oldScript)) {
  throw "Script capabilities.html upstream inattendu; patch SHINO refuse."
}
$html = $html.Replace($oldScript, $newScript)
Set-Content -Path $CapabilitiesHtmlPath -Value $html -Encoding UTF8

Write-Host "[SHINO-OS] Google OAuth propre: Capabilities restaure, meme onglet, credentials masques proteges." -ForegroundColor Cyan
