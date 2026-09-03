# SHINO-OS

Local-first personal AI command center designed for an ultrawide **3440×1440** workstation.

## V0.1.1 — 3440 Native Visual Pass

The first milestone is deliberately visual and dependency-free: a real HTML/CSS/JS dashboard that can be previewed before AI, voice and machine integrations are connected.

Current shell features:

- 3440×1440-first dashboard layout with larger typography and controls
- substantially enlarged multi-layer central AI core
- animated halos, four orbital layers, dual tick rings and internal energy filaments
- visual core states: `IDLE / LISTENING / THINKING / SPEAKING / WORKING / ERROR`
- state-aware waveform, colors and animation speeds
- conversation panel with demo think/speak transitions
- switchable `CHATGPT / LOCAL / CLOUD` brain modes
- RISO / MUSIC / DEV / FILES / PC / SETTINGS modules
- simulated RTX 3060 + RTX 3070 Ti telemetry
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

For the intended look, use browser fullscreen mode (`F11`) on the 3440×1440 monitor.

## Controls

- `/` focuses the chat input
- `Ctrl + Space` toggles the demo voice-listening state
- click the central core to cycle all six visual states
- keys `1` through `6` trigger `IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `WORKING`, `ERROR`
- Brain mode, dock modules, left rail and power/standby controls are clickable

## Architecture direction

SHINO-OS will remain local-first:

- **UI shell:** desktop command center
- **ChatGPT:** high-capability brain path where available
- **Local brain:** LAN/local model path
- **RTX 3060 12 GB:** local model / memory / RAG workloads
- **RTX 3070 Ti LAN node:** voice, transcription, vision and GPU worker workloads
- **Skills:** RISO, SHINOBIWAN/MUSIC, DEV, FILES, PC and future integrations

The next technical milestone replaces simulated data with a small local bridge API for real system telemetry, then adds voice and AI routing — after the visual shell is validated on the target 3440×1440 display.
