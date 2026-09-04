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

function Replace-TrimmedLineOnce {
  param(
    [string[]]$Lines,
    [string]$Needle,
    [string[]]$Replacement,
    [string]$Label
  )

  $hits = @()
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i].Trim() -eq $Needle) { $hits += $i }
  }
  if ($hits.Count -ne 1) {
    throw "${Label}: attendu 1 ligne upstream, trouve $($hits.Count). Patch refuse pour ne pas corrompre Jarvis."
  }

  $index = [int]$hits[0]
  $result = @()
  if ($index -gt 0) { $result += $Lines[0..($index - 1)] }
  if ($Replacement) { $result += $Replacement }
  if ($index + 1 -lt $Lines.Count) { $result += $Lines[($index + 1)..($Lines.Count - 1)] }
  return @($result)
}

# Runtime files are restored from the pinned Jarvis HEAD on every launch. This
# repairs the Capabilities page even if an older SHINO patch corrupted it.
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
# Backend: stable callback + refuse masked/corrupted credentials.
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
# Capabilities: edit known lines only, never a broad JS regex.
# -----------------------------------------------------------------------------
$uiLines = @(Get-Content $CapabilitiesPath -Encoding UTF8)

# Never put masked API values back into editable inputs. This caused invalid_client.
$uiLines = Replace-TrimmedLineOnce -Lines $uiLines -Needle 'const v = (ss.api_keys || {})[f.key] || "";' -Replacement @(
  '            const configured = Boolean((ss.api_keys || {})[f.key]);',
  '            if (configured) {',
  '              inp.dataset.configured = "1";',
  '              inp.placeholder = f.secret',
  '                ? "Déjà configuré — saisir une nouvelle valeur pour remplacer"',
  '                : "Déjà configuré — laisser vide pour conserver";',
  '            }'
) -Label "Credentials masques"
$uiLines = Replace-TrimmedLineOnce -Lines $uiLines -Needle 'if (v) inp.value = v;' -Replacement @() -Label "Ancien pre-remplissage masque"

# OAuth must leave Jarvis' iframe but must stay in the SAME browser tab.
$uiLines = Replace-TrimmedLineOnce -Lines $uiLines -Needle 'window.location.href = cfg.url;' -Replacement @(
  '      const target = window.top || window;',
  '      target.location.href = cfg.url;'
) -Label "Navigation OAuth simple"

$uiLines = Replace-TrimmedLineOnce -Lines $uiLines -Needle 'connectBtn.addEventListener("click", () => { window.location.href = cfg.url; });' -Replacement @(
  '        connectBtn.addEventListener("click", () => {',
  '          if (connectBtn.disabled) return;',
  '          connectBtn.disabled = true;',
  '          connectBtn.textContent = "Connexion…";',
  '          const target = window.top || window;',
  '          target.location.href = cfg.url;',
  '        });'
) -Label "Handler OAuth hybride"

$uiLines = Replace-TrimmedLineOnce -Lines $uiLines -Needle 'J.mountAtmosphere();' -Replacement @(
  '  J.mountAtmosphere();',
  '',
  '  const shinoParams = new URLSearchParams(window.location.search);',
  '  if (shinoParams.get("google_error") === "invalid_client_config") {',
  '    window.setTimeout(() => J.notify({',
  '      kind: "error",',
  '      text: "Google OAuth : les identifiants enregistrés sont invalides. Recopie une fois le vrai Client ID et le vrai Client Secret, puis Sauvegarder.",',
  '    }), 150);',
  '  }'
) -Label "INIT Capabilities"

$uiText = ($uiLines -join [Environment]::NewLine)
$uiText = $uiText.Replace(
  'http://127.0.0.1:8000/api/google/callback/gmail + .../calendar',
  ($CanonicalOrigin + '/api/google/callback/gmail + .../calendar')
)
Set-Content -Path $CapabilitiesPath -Value $uiText -Encoding UTF8

# Cache-bust the repaired page so Chrome cannot reuse the broken JS.
$html = Get-Content $CapabilitiesHtmlPath -Raw -Encoding UTF8
$oldScript = '<script src="/capabilities.js"></script>'
$newScript = '<script src="/capabilities.js?v=shino-oauth-clean-3"></script>'
if (-not $html.Contains($oldScript)) {
  throw "Script capabilities.html upstream inattendu; patch SHINO refuse."
}
$html = $html.Replace($oldScript, $newScript)
Set-Content -Path $CapabilitiesHtmlPath -Value $html -Encoding UTF8

Write-Host "[SHINO-OS] Google OAuth propre: Capabilities restaure, meme onglet, credentials masques proteges." -ForegroundColor Cyan
