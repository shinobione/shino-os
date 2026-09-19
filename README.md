# SHINO-OS

Personal AI command center built as a **local overlay on top of Jarvis OS**.

SHINO-OS does **not** vendor/copy the Jarvis OS codebase. The launcher clones a pinned Jarvis OS runtime **outside the Git repository and outside OneDrive**, then stages SHINO-specific views/runtime overlays into that local Jarvis runtime.

> **Project status, runtime requirements and next steps:** see [`ROADMAP.md`](ROADMAP.md).

## Architecture

```text
SHINO-OS repo (may live in OneDrive/GitHub)
├─ shino.bat / shino.ps1        Windows launcher
├─ UPSTREAM.lock                reproducible Jarvis OS pin
├─ ROADMAP.md                   canonical project state / next steps
├─ runtime_overlay/             small SHINO runtime bridges
├─ scripts/                     runtime sync/patch scripts
└─ extensions/
   └─ views/
      └─ shino-command-center/  3440×1440 Jarvis-powered cockpit

%LOCALAPPDATA%\SHINO-OS\runtime\
└─ jarvis-OS\                   cloned upstream runtime + bundle + .env
```

Jarvis OS supplies the engine: FastAPI, memory kernel, missions, tools, proactive engine, permissions/governance, WebSocket, vision, TTS and extension framework.

SHINO-OS supplies the ultrawide shell, identity, local voice bridge, domain skills and local/LAN hardware integration.

The runtime location can be overridden with `SHINO_RUNTIME_ROOT`, but the launcher refuses a runtime path under OneDrive because Jarvis' embedded Python/venv bundle relies on filesystem behavior OneDrive can break.

## Current upstream pin

See [`UPSTREAM.lock`](UPSTREAM.lock).

Initial integration pin:

`570200276bad54dd4dba49843deb785c000bc19f`

Fresh installs and `shino.bat update` use `UPSTREAM.lock`. Running a different runtime commit is refused; advancing Jarvis requires a reviewed lock change.

## Windows — first run

From the SHINO-OS repository folder:

```powershell
.\shino.bat status
.\shino.bat setup
```

The first command reports the external Jarvis runtime path. `setup` clones Jarvis OS into `%LOCALAPPDATA%\SHINO-OS\runtime\jarvis-OS` if required and then starts the standard Jarvis setup flow.

## Run

```powershell
.\shino.bat run
```

Other passthrough commands:

```powershell
.\shino.bat api
.\shino.bat doctor
.\shino.bat status
.\shino.bat update
```

## Runtime requirements — current V0.2

- **Jarvis OS:** started by `shino.bat run`.
- **Ollama:** must currently be running on `http://localhost:11434`.
- **Qwen3 8B:** served by Ollama.
- **Handy:** must be installed, but its GUI does **not** need to remain open.
- **Whisper Large V3 Turbo:** downloaded in Handy; SHINO invokes Handy headlessly for STT.
- **Piper:** used inside Jarvis; no separate app/process to launch.
- **Chatterbox Multilingual V3:** primary TTS worker on `http://127.0.0.1:18765`, started and warmed by SHINO. Piper is fallback only when synthesis fails.
- **Chrome:** hosts the cockpit, microphone capture and future MediaPipe vision UI.

The detailed matrix is maintained in [`ROADMAP.md`](ROADMAP.md).

## SHINO Command Center

Current V0.2 integration features:

- physical 3440×1440-first cockpit
- **native Jarvis Three.js orb** reused in SHINO
- orb states: `idle`, `listening`, `thinking`, `speaking`, `error`
- real CPU/RAM/disk polling via Jarvis `/api/system/perf`
- LLM backend status via `/api/config/llm-status`
- real Jarvis/Qwen chat with session continuity
- RISO / MUSIC / DEV / FILES / PC / SETTINGS context dock
- single Jarvis shell + internal iframe navigation
- local microphone bridge
- Handy / Whisper Large V3 Turbo STT target on RTX 3060 Vulkan
- Chatterbox V3 phrase streaming, with diagnosed Piper fallback

Jarvis uses the stable OAuth origin `http://localhost:18777` by default. An unknown listener blocks startup rather than being killed. `SHINO_JARVIS_PORT` can select another non-reserved port; update OAuth redirect configuration accordingly.

The warm single-turn physical voice gate passed on 19 September 2026 (user-confirmed microphone/playback, Chatterbox, zero fallbacks). Five-/20-turn stability remains unvalidated. See [the audit and voice gate procedure](docs/VOICE-GATE-AUDIT.md).

### Warm voice and diagnostics

In SHINO mode, `SHINO_OLLAMA_KEEP_ALIVE` defaults to `15m` for Jarvis's configured Ollama model and URL. Set it in the launching shell or the external runtime `.env`; the shell takes precedence. Examples: `30m`, `1h`, `0` (allow immediate unload), `-1` (retain indefinitely). Invalid values fall back to `15m`. Normal non-SHINO Jarvis requests are unchanged. This is an idle residency preference, not a guarantee against eviction under memory pressure.

After Jarvis initialization, one background warmup sends a one-token request directly to that configured Ollama model. It never enters sessions, history, memory consolidation or TTS. It is bounded to 90 seconds, reports `SHINO Ollama warmup ready` or a concise failure, and never gates API startup. No second Ollama service is launched. Wait for warmup success and confirm `/api/ps` residency before a physical test.

The voice UI distinguishes total STT request time from Handy inference. `/api/shino/voice/status` exposes `stt_metrics` and the last 20 `tts_recent_metrics` (no transcript/audio). Browser console entries `[SHINO-OS] STT stages`, `TTS segment` and `Voice turn` capture timings; the last ten turns are also in `window.SHINOVoiceDiagnostics` in the cockpit frame. Keep DevTools open with Preserve log during physical tests.

STT metrics separate request body read, lock wait, WAV preparation, Handy process lifetime, model load, inference and output parsing. `process_other_ms` is a residual (startup/exit/other work), not isolated startup time. Browser transport/response overhead is also a residual, not a network-only measurement. TTS records queue/request/response/decode/source-start/end per segment, worker synthesis time when supplied, actual response backend, fallback and first eligible text-to-playback delay. WebAudio source start approximates playback scheduling; it does **not** measure sound reaching the listener. Metrics from a failed or cancelled turn may be incomplete.

## Local checks

Use Python 3.12 with `fastapi`, `httpx`, `numpy`, `loguru`, `pyyaml`, plus Node and Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run_local_checks.ps1 -Python "C:\Users\jerry\AppData\Local\SHINO-OS\runtime\jarvis-OS\bundle\.venv\Scripts\python.exe" -PinnedRuntime "C:\Users\jerry\AppData\Local\SHINO-OS\runtime\jarvis-OS"
```

These tests use mocks and temporary fixtures; they do not start the real launcher, microphone or GPU worker. CI runs the regression suite and separately checks OAuth against the pinned upstream.

## Vision / gestures

The original Jarvis MediaPipe stack remains in the upstream runtime. It includes face detection, hand landmarks, discrete gestures, pinch volume, pan/zoom gestures and a separate YOLO object-detection daemon.

The current SHINO cockpit hides the original Jarvis camera control; restoring the camera/gesture UI inside SHINO is a high-priority roadmap item.

## Planned SHINO extensions

- RISO field-service skill + manuals/RAG workflow
- SHINOBIWAN A&R / release workflow
- GitHub/dev workflows
- RTX 3070 Ti LAN worker integration
- SHINO-specific presets and proactive routines
- vision/gesture integration in the SHINO shell

## Licensing

Jarvis OS is a separate upstream project licensed under **AGPL-3.0-or-later**. SHINO-OS references and locally clones it rather than vendoring its source. See [`NOTICE.md`](NOTICE.md).

Jarvis Skills is a separate upstream catalogue licensed under MIT.
