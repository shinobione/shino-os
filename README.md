# SHINO-OS

Personal AI command center built as a **local overlay on top of Jarvis OS**.

SHINO-OS does **not** vendor/copy the Jarvis OS codebase. The launcher clones a pinned Jarvis OS runtime into `.runtime/jarvis-OS` on the local machine, then exposes SHINO-specific views/skills through Jarvis' native `JARVIS_DEV_EXTENSIONS_DIR` mechanism.

## Architecture

```text
SHINO-OS repo
├─ shino.bat / shino.ps1        Windows launcher
├─ UPSTREAM.lock                reproducible Jarvis OS pin
├─ extensions/
│  ├─ views/
│  │  └─ shino-command-center/  3440×1440 Jarvis-native UI
│  ├─ skills/                   future RISO / SHINOBIWAN skills
│  └─ presets/                  future SHINO automations
└─ .runtime/                    local only, ignored by git
   └─ jarvis-OS/                cloned upstream runtime
```

Jarvis OS supplies the engine: voice/LiveKit, memory kernel, mission engine, tools, proactive engine, permissions/governance, LLM providers and extension framework.

SHINO-OS supplies the personality, ultrawide interface, domain skills and local hardware integration.

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

The first command reports whether the Jarvis runtime exists. `setup` clones Jarvis OS into `.runtime/` if required and opens/starts the standard Jarvis setup flow.

Jarvis may then download its Windows bundle during its own setup. That bundle remains inside `.runtime/jarvis-OS` and is not committed to SHINO-OS.

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

## SHINO Command Center

`extensions/views/shino-command-center` is a native Jarvis full-screen view using `Jarvis.views.register()`.

Current V0.2 integration features:

- 3440×1440-first cockpit
- Canvas Living Core
- core states: `idle`, `listening`, `thinking`, `speaking`, `working`, `error`
- real CPU/RAM/disk polling via Jarvis `/api/system/perf`
- LLM backend detection via `/api/config/llm-status`
- RISO / MUSIC / DEV / FILES / PC / SETTINGS context dock
- backend tool for `show`, `hide`, `set_state`, `set_mode`, `refresh`

This replaces the standalone mock dashboard direction: the UI is now designed to run **inside the real Jarvis runtime**.

## Planned SHINO extensions

- RISO field-service skill + manuals/RAG workflow
- SHINOBIWAN A&R / release workflow
- GitHub/dev workflows
- RTX 3070 Ti LAN worker integration
- SHINO-specific presets and proactive routines
- voice-driven state synchronization for the Living Core

## Licensing

Jarvis OS is a separate upstream project licensed under **AGPL-3.0-or-later**. SHINO-OS currently references and locally clones it rather than vendoring its source. See [`NOTICE.md`](NOTICE.md).

Jarvis Skills is a separate upstream catalogue licensed under MIT.
