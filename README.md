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

Fresh installs start at that commit. `shino.bat update` intentionally advances the local runtime to current `origin/main`; subsequent runs keep that updated local commit.

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
- Piper local TTS

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
