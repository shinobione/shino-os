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

function Replace-TrimmedLineExact {
  param(
    [string[]]$Lines,
    [string]$Needle,
    [string[]]$Replacement,
    [string]$Label,
    [int]$ExpectedCount = 1
  )

  $hits = @()
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($Lines[$i].Trim() -eq $Needle) { $hits += $i }
  }
  if ($hits.Count -ne $ExpectedCount) {
    throw "${Label}: attendu $ExpectedCount ligne(s) upstream, trouve $($hits.Count). Patch refuse pour ne pas corrompre Jarvis."
  }

  $result = @()
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    if ($hits -contains $i) {
      if ($Replacement) { $result += $Replacement }
    } else {
      $result += $Lines[$i]
    }
  }
  return @($result)
}

# These files belong to the pinned Jarvis runtime. Restore them before every SHINO
# patch so a previous failed/old overlay can never accumulate in Capabilities.
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
# Backend: line-based edits only. This deliberately avoids multiline .Contains()
# matches, which are fragile on Windows because runtime files may use CRLF.
# -----------------------------------------------------------------------------
$oauthLines = @(Get-Content $GoogleOAuthPath -Encoding UTF8)

# SHINO owns one stable localhost origin. Replace the single return line rather
# than rewriting the whole function, so upstream comments/newlines cannot break us.
$oauthLines = Replace-TrimmedLineExact -Lines $oauthLines `
  -Needle 'return f"{base}/api/google/callback/{service}"' `
  -Replacement @('    return f"' + $CanonicalOrigin + '/api/google/callback/{service}"') `
  -Label "Callback Google OAuth"

# Validate the real credentials immediately before Jarvis regenerates its JSON.
# Older SHINO builds could save masked placeholders returned by /api/settings.
$oauthLines = Replace-TrimmedLineExact -Lines $oauthLines `
  -Needle '_maybe_write_credentials_from_env(request)' `
  -Replacement @(
    '    if os.getenv("SHINO_OS") == "1":',
    '        client_id = (settings.google_client_id or "").strip()',
    '        client_secret = settings.google_client_secret.get_secret_value().strip()',
    '        masked = any(ch in client_id or ch in client_secret for ch in ("•", "*"))',
    '        if (',
    '            not client_id',
    '            or not client_secret',
    '            or masked',
    '            or not client_id.endswith(".apps.googleusercontent.com")',
    '        ):',
    '            logger.error("SHINO Google OAuth credentials invalid or masked")',
    '            return RedirectResponse("/capabilities?google_error=invalid_client_config")',
    '',
    '    _maybe_write_credentials_from_env(request)'
  ) `
  -Label "Validation credentials Google"

Set-Content -Path $GoogleOAuthPath -Value ($oauthLines -join [Environment]::NewLine) -Encoding UTF8

# -----------------------------------------------------------------------------
# Capabilities: edit exact known lines only. Never regex across JS blocks.
# -----------------------------------------------------------------------------
$uiLines = @(Get-Content $CapabilitiesPath -Encoding UTF8)

# Jarvis has two masked-value prefill sites: connector fields and skill config.
# Protect both, otherwise a masked placeholder can still be saved back to .env.
$uiLines = Replace-TrimmedLineExact -Lines $uiLines -Needle 'const v = (ss.api_keys || {})[f.key] || "";' -ExpectedCount 2 -Replacement @(
  '            const configured = Boolean((ss.api_keys || {})[f.key]);',
  '            if (configured) {',
  '              inp.dataset.configured = "1";',
  '              inp.placeholder = f.secret',
  '                ? "Déjà configuré — saisir une nouvelle valeur pour remplacer"',
  '                : "Déjà configuré — laisser vide pour conserver";',
  '            }'
) -Label "Credentials masques"
$uiLines = Replace-TrimmedLineExact -Lines $uiLines -Needle 'if (v) inp.value = v;' -ExpectedCount 2 -Replacement @() -Label "Ancien pre-remplissage masque"

# OAuth must leave Jarvis' persistent iframe but remain in the SAME browser tab.
$uiLines = Replace-TrimmedLineExact -Lines $uiLines -Needle 'window.location.href = cfg.url;' -Replacement @(
  '      const target = window.top || window;',
  '      target.location.href = cfg.url;'
) -Label "Navigation OAuth simple"

$uiLines = Replace-TrimmedLineExact -Lines $uiLines -Needle 'connectBtn.addEventListener("click", () => { window.location.href = cfg.url; });' -Replacement @(
  '        connectBtn.addEventListener("click", () => {',
  '          if (connectBtn.disabled) return;',
  '          connectBtn.disabled = true;',
  '          connectBtn.textContent = "Connexion…";',
  '          const target = window.top || window;',
  '          target.location.href = cfg.url;',
  '        });'
) -Label "Handler OAuth hybride"

$uiLines = Replace-TrimmedLineExact -Lines $uiLines -Needle 'J.mountAtmosphere();' -Replacement @(
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

# Cache-bust repaired Capabilities JS so Chrome cannot reuse an older broken copy.
$htmlLines = @(Get-Content $CapabilitiesHtmlPath -Encoding UTF8)
$htmlLines = Replace-TrimmedLineExact -Lines $htmlLines `
  -Needle '<script src="/capabilities.js"></script>' `
  -Replacement @('<script src="/capabilities.js?v=shino-oauth-clean-4"></script>') `
  -Label "Script Capabilities"
Set-Content -Path $CapabilitiesHtmlPath -Value ($htmlLines -join [Environment]::NewLine) -Encoding UTF8

Write-Host "[SHINO-OS] Google OAuth propre: Capabilities restaure, meme onglet, credentials masques proteges." -ForegroundColor Cyan
