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
$SystemPromptPath = Join-Path $JarvisDir "prompts\system_static.md"

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

# Strengthen upstream [voix] behavior without changing user/session text.
# This edits only the detached Jarvis runtime and is re-applied idempotently at launch.
if (Test-Path $SystemPromptPath) {
  $prompt = Get-Content $SystemPromptPath -Raw -Encoding UTF8
  $voiceSection = @'
## Tag [voix]
Quand un message se termine par `[voix]`, c'est une requête vocale (micro -> STT).
Règles strictes pour ce mode :
- Parle en francais oral naturel, comme dans une conversation en face a face.
- Reponds directement au fond. Pas de preambule de chatbot, pas de "Bien sur", "Excellente question", "Je vais..." si tu peux simplement repondre ou agir.
- 1 a 2 phrases courtes par defaut; 3 seulement si elles sont vraiment utiles. Developpe uniquement si l'utilisateur le demande.
- Pas de markdown, listes, titres, emoji, URLs, blocs de code ni mise en forme pensee pour l'ecran.
- N'enonce jamais les balises techniques ou UI : `[visuel]`, `[son]`, `[tool]`, `[outil]`, `[I]`, `[CF]`, `[BG]`, `[BG:PROJECT]`.
- Si un outil ou une vue est utilise, dis seulement le resultat utile a l'oral; ne decris pas la plomberie interne.
- Evite les tics artificiels ("euh", "hmm") et les formulations scolaires. Utilise des phrases simples et naturelles.
- Une blague doit commencer directement par la blague; une reponse factuelle doit commencer directement par l'information utile.
- Pour [BG:PROJECT], l'ack oral tient en une seule phrase naturelle.
- Ignore le `[voix]` a la fin du message utilisateur : c'est un marqueur technique, pas du contenu.

'@
  $voicePattern = '(?ms)^## Tag \[voix\]\r?\n.*?(?=^## Règles\s*$)'
  if ([regex]::IsMatch($prompt, $voicePattern)) {
    $prompt = [regex]::Replace($prompt, $voicePattern, $voiceSection)
    Set-Content -Path $SystemPromptPath -Value $prompt -Encoding UTF8
    Write-Host "[SHINO-OS] Style vocal Jarvis renforce: oral court, naturel, sans tags techniques." -ForegroundColor Cyan
  } else {
    Write-Host "[SHINO-OS] Section [voix] upstream introuvable; style vocal non modifie." -ForegroundColor Yellow
  }
}

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

# SHINO voice path: browser mic -> Handy/Vulkan -> Ollama -> Chatterbox V3 (optional) -> Piper fallback.
# Handy --model expects the exact local registry id returned by --list-models --json.
Set-EnvValue "SHINO_STT_BACKEND" "handy"
Set-EnvValue "SHINO_HANDY_MODEL" "handy-computer/whisper-large-v3-turbo-gguf/whisper-large-v3-turbo-Q8_0.gguf"
Set-EnvValue "SHINO_HANDY_DEVICE_INDEX" "0"
Set-EnvValue "TTS_PROVIDER" "piper"

$naturalTtsScript = Join-Path $Root "scripts\ensure_natural_tts.ps1"
$naturalTtsUrl = ""
if (Test-Path $naturalTtsScript) {
  try {
    $naturalTtsUrl = [string](& $naturalTtsScript -Root $Root -RuntimeRoot $RuntimeRoot | Select-Object -Last 1)
    $naturalTtsUrl = $naturalTtsUrl.Trim()
  } catch {
    Write-Host "[SHINO-OS] Chatterbox indisponible: $($_.Exception.Message)" -ForegroundColor Yellow
    $naturalTtsUrl = ""
  }
}

if ($naturalTtsUrl) {
  $env:SHINO_TTS_URL = $naturalTtsUrl
  Set-EnvValue "SHINO_TTS_URL" $naturalTtsUrl
  Set-EnvValue "SHINO_TTS_LANGUAGE" "fr"
  Write-Host "[SHINO-OS] TTS naturel: Chatterbox Multilingual V3 resident ($naturalTtsUrl), Piper fallback." -ForegroundColor Cyan
} else {
  Remove-Item Env:SHINO_TTS_URL -ErrorAction SilentlyContinue
  Set-EnvValue "SHINO_TTS_URL" ""
  Write-Host "[SHINO-OS] TTS naturel non installe: Piper reste le fallback actif." -ForegroundColor Yellow
}

Write-Host "[SHINO-OS] Voix locale synchronisee: Handy + Whisper Large V3 Turbo Q8_0 (device 0) + Ollama + TTS." -ForegroundColor Cyan
if ($env:SHINO_STT_URL) {
  Write-Host "[SHINO-OS] Noeud STT LAN configure: $env:SHINO_STT_URL" -ForegroundColor Cyan
}
