# SHINO-OS handoff

- Work on `integration/jarvis-upstream`; do not merge PR #2.
- Read README.md, `origin/main:ROADMAP.md` (local main may be stale), branch ROADMAP.md and UPSTREAM.lock. Inspect actual code; older roadmap port/launcher claims are stale.
- Jarvis OS is the external engine/runtime, pinned by UPSTREAM.lock. SHINO is the local-first identity/UI/voice/skills overlay. Never vendor Jarvis or rebuild the cockpit/assistant.
- Runtime: `%LOCALAPPDATA%\SHINO-OS\runtime\jarvis-OS`, outside OneDrive. Chatterbox venv/logs: sibling `workers\chatterbox`. Reference: `%LOCALAPPDATA%\SHINO-OS\voice\reference.wav`.
- Chatterbox MUST use `127.0.0.1:18765`; upstream cleanup kills 8765. Jarvis defaults to 18777 (stable OAuth origin); Ollama uses 11434.
- STT is validated: browser mic -> Handy headless -> Whisper Large V3 Turbo Q8_0 -> RTX 3060 Vulkan device 0. No faster-whisper redesign or Handy GUI requirement.
- Chatterbox V3 is primary; Piper is fallback only with diagnostic evidence. Physical end-to-end voice gate remains open. Do not infer it from direct synthesis/static checks.
- Before physical launcher testing, run `scripts/run_local_checks.ps1` on the exact code. Tests must use temporary runtimes and mocks, never kill processes or modify the real runtime. Check CI for the exact published commit before requesting physical validation.
- Keep changes small, add regression coverage for concrete bugs. Do not read secrets into logs. Preserve unrelated working-tree changes.
- Barge-in follows stable Chatterbox; camera is P1 and must reuse upstream MediaPipe/Gesture Router. LAN GPU and disk cleanup are not current priorities.
- Ignore the known Anthropic preflight false positive in Ollama mode; LiveKit failures are not automatically SHINO voice failures. Never delete active runtime/models during cleanup.
