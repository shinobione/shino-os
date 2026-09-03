# SHINO-OS

Local-first personal AI command center designed for an ultrawide **3440×1440** workstation.

## V0.1 — Ultrawide Shell

The first milestone is deliberately visual and dependency-free: a real HTML/CSS/JS dashboard that can be previewed before AI, voice and machine integrations are connected.

Current shell features:

- 3440×1440-first dashboard layout
- animated central AI core and HUD rings
- conversation panel with demo replies
- switchable `CHATGPT / LOCAL / CLOUD` brain modes
- RISO / MUSIC / DEV / FILES / PC / SETTINGS modules
- simulated RTX 3060 + RTX 3070 Ti telemetry
- animated voice waveform and listening state
- recent actions, skills and system panels
- responsive fallback for narrower desktop ratios

## Preview

No install is required.

### Easiest

Open `index.html` directly in Chrome or Edge.

### Local web server

From the repository folder:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`.

For the intended look, use the browser fullscreen mode on the 3440×1440 monitor.

## Controls

- `/` focuses the chat input
- `Ctrl + Space` toggles the demo voice-listening state
- Brain mode, dock modules, left rail and power/standby controls are clickable

## Architecture direction

SHINO-OS will remain local-first:

- **UI shell:** desktop command center
- **ChatGPT:** high-capability brain path where available
- **Local brain:** LAN/local model path
- **RTX 3060 12 GB:** local model / memory / RAG workloads
- **RTX 3070 Ti LAN node:** voice, transcription, vision and GPU worker workloads
- **Skills:** RISO, SHINOBIWAN/MUSIC, DEV, FILES, PC and future integrations

The next milestone replaces simulated data with a small local bridge API for real system telemetry, then adds voice and AI routing.
