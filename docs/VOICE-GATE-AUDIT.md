# Voice gate audit — 2026-09-19

## Physical update and next gate

The user established the warm single-turn physical gate as PASS: correct microphone transcription, audible Chatterbox, fallback count 0 -> 0 and no worker/TTS errors. Matching Handy inference was 561 ms but total STT was 5.450 s; a subsequent total was 2.207 s. Warm Ollama requests took 0.720–2.454 s without reload. User heard speech about 2–3 s after text. `HANDY + CHATTERBOX V3` is the normal final label; `CHATTERBOX V3 · STREAM` is the playback label. The latest retained 7.35 s synthesis cannot be assigned to first-audio latency.

The residency/timing changes following that test require a new launch to stage them; they have not been applied to the currently running physical runtime. Tests remain isolated. Before the next five-turn gate: verify exact-HEAD CI, launch normally, wait for Jarvis and SHINO Ollama warmup readiness, verify the configured Ollama service's model residency/expiration and Chatterbox 18765 health, record fallback baseline, and open DevTools with Preserve log. Perform five short user-spoken turns sequentially, waiting for each playback to finish. Record transcript, backend, audible delay and per-turn diagnostics; inspect fallback/worker/GPU state afterwards. Stop on errors/fallbacks; do not begin twenty turns yet. See README for metric definitions and configuration.

The original audit below is historical; its pending single-turn status is superseded by this update.

## Established locally

Audited `integration/jarvis-upstream`, starting at `c331104`. Only pre-existing untracked content was a worker `__pycache__` directory; it was preserved and is now ignored. No AGENTS.md existed; a concise project handoff was added.

Local `main` predates ROADMAP.md. Read the canonical handoff from `origin/main` (`12092ad`), then the branch roadmap and actual source. Canonical history still describes 8765, automatic API-port selection, unfinished Chatterbox installation and unfinished camera UI. Current branch has 18765, fixed API/OAuth port 18777, and camera/gesture overlays already present; their physical status was not revalidated. No main-branch rewrite or PR merge was performed.

The installed external Jarvis runtime HEAD is exactly `570200276bad54dd4dba49843deb785c000bc19f`. Its cleanup explicitly kills listeners on 8765, 7880, 7881 and the configured API port, but not 18765. SHINO's Chatterbox module name does not match its Jarvis Python entry-point patterns. This is source evidence, not proof of survival during a real launch.

PR #2 was open/draft with all four existing checks successful. Those checks cover the previous published head, not these new local commits.

## Concrete fixes and reasons

| Finding | Small correction |
|---|---|
| Startup failure erased `SHINO_TTS_URL`, permanently bypassing a subsequently healthy worker | Keep 18765 configured; bridge also defaults blank/missing values to 18765; retry each phrase |
| 45 s synthesis timeout was shorter than the previously reported ~49 s cold direct path | 120 s read timeout, matching the existing direct doctor; 1 s connect timeout retained. This is a recovery budget, not a latency target |
| Empty timeout messages and invalid HTTP-200 audio made fallback opaque | Include exception type, validate WAV signature/nonempty payload, expose fallback header, count and last failure in status |
| 16 s nominal startup polling window, no child-exit check, any `/health` accepted | Longer polling, process-exit diagnostics, engine/schema validation; fixed 18765 enforced |
| Cleanup killed arbitrary API listeners, all named LiveKit processes and shells mentioning the runtime | Verify executable location and Jarvis entry point; fail on unknown owners; retire unused dangerous port-reclamation script |
| `update` bypassed the architectural pin | Fetch/check out UPSTREAM.lock; refuse drift at launch |
| Batch branches expanded `%ERRORLEVEL%` before child commands ran | Use labels so tts-setup/voice-doctor return the actual child exit code |
| Browser implicitly armed Handy GUI resident mode | Use the already-validated browser -> headless path by default; no STT/model rewrite |
| Browser assumed Piper before a response, changed SPEAKING state while merely prefetching | Label from response headers; change SPEAKING at playback; protect status refresh during active turns |
| Empty normalization reverted to raw technical tags; code fences split across deltas | Preserve empty normalized output; hold unfinished code blocks out of sentence splitting |
| Queue rejection could be unhandled before LLM completion; failed turns left audio/queued work alive | Handle rejection immediately, abort pending requests and stop current browser audio on turn error; release audio nodes and failed microphone setup resources |
| Reference-conditioning cache ignored exaggeration | Include exaggeration in its cache key |
| Windows PowerShell decoded BOM-less French source as ANSI | UTF-8 BOM in OAuth and voice-sync scripts; pinned OAuth fixture test verifies the actual French placeholder |

Fallback diagnostics are bounded: one console warning per failed phrase, response `X-SHINO-TTS-FALLBACK: chatterbox-failed`, and `/api/shino/voice/status` fields `tts`, `tts_url`, `tts_last_ms`, `tts_last_error`, `tts_fallback_count`, `tts_last_fallback_error`. The counter lasts for the Jarvis API process lifetime; a recovered phrase clears current error but retains fallback history. No giant toasts added.

## Local validation

Run `scripts/run_local_checks.ps1` as shown in README. Results on this machine:

- Overlay metadata and lock validation: PASS.
- All overlay JavaScript syntax, PowerShell parse, Python source syntax: PASS.
- Eight Python tests: primary selection with blank URL, failure/recovery, timeout reason, invalid audio, cancellation without Piper, worker WAV/label, cold health, reference cache: PASS.
- Browser VM: normalization, split code fences, synthesis prefetch, ordered playback, actual engine labels, handled queue failure, cancellation: PASS.
- Mocked PowerShell: reserved ports, ownership boundaries, protecting runtime test processes/Chatterbox, slow worker startup, early worker exit: PASS.
- Existing Windows smoke steps: navigation cleanup twice, voice sync/prompt patch twice, detached HEAD status: PASS.
- OAuth clean pinned fixture: patch twice, JS/Python syntax and existing assertions: PASS. No credentials were read and the live runtime was not patched.

No model inference, microphone capture, GPU stress, browser autoplay validation or full Jarvis startup was executed. CI was extended to run these regressions. Verify CI for the exact new published commit before asking for a physical launcher test.

## Physical test procedure (pending)

After local checks and exact-commit CI are green:

1. Run `./shino.bat run` normally on the target machine. Keep Ollama running. Handy GUI is unnecessary. Do not change STT/model/device.
2. After Jarvis reports ready, query `Invoke-RestMethod http://127.0.0.1:18765/health`. Require `engine=chatterbox-multilingual-v3`, `ready=true`, `device=cuda`. Repeat after the voice turn and after several minutes to verify survival.
3. Open the actual displayed SHINO URL (normally `http://localhost:18777/admin`). Speak a short French request. Verify transcript, Qwen response, first phrase playback before generation finishes when the response is long enough, and **CHATTERBOX V3 · STREAM** while playing.
4. Inspect authenticated `/api/shino/voice/status` in the browser if needed. Compare `tts_fallback_count` before/after; require zero increase for the successful gate. If Piper appears, capture its latest failure reason plus worker `/health.last_error`, not the entire log.
5. Worker logs: `%LOCALAPPDATA%\SHINO-OS\runtime\workers\chatterbox\logs\worker.err.log` and `worker.out.log`. `shino.bat voice-doctor` runs direct synthesis and may start the worker; it is a separate diagnostic, never proof of the full gate.
6. Measure 20 consecutive turns, time from capture close to first audio (browser console), subjective timbre/prosody, VRAM with Qwen + Chatterbox, and any OOM/fallbacks. The logged first-audio time currently precedes browser decoding/start by a small amount; use audible timing for acceptance.

## Remaining limits

- Chatterbox is intentionally resident beyond Jarvis exit. No new `stop` lifecycle was introduced. Existing ready workers are reused and do not hot-reload edited Python; apply worker changes after a controlled worker restart. Schema checks cannot prove source freshness.
- Ownership checks may refuse a process launched through an unrecognized interpreter. This is intentional; inspect the owner instead of force-killing a port. Upstream's own broad cleanup remains external and unchanged.
- Concurrent launches are not serialized. Avoid two simultaneous `run` commands; worker/log collision and upstream process cleanup still need a dedicated lifecycle design if concurrent launches become a requirement.
- `/health.ready` means loaded/reference-conditioned, not that Qwen + STT + TTS fit in VRAM or inference will succeed. Warmup does not synthesize a phrase.
- Timed-out/disconnected HTTP requests cannot preempt an already-running synchronous GPU `generate`; it may finish in the worker. The browser discards cancelled work, but GPU cancellation is not implemented.
- Speech normalization is lightweight, not a full incremental Markdown parser; pathological long unpunctuated output can still reach the worker's 1200-character limit and produce a documented fallback. The short `[voix]` prompt reduces this risk but is not proof.
- Standalone sync/OAuth scripts remain runtime mutations, and `shino.bat status` still runs sync scripts first. Use `shino.ps1 status` for the read-only status path. No OAuth flow was exercised against Google.

## Barge-in design — deferred, not enabled

Implement only after the physical Chatterbox gate is stable. The queue cancellation added here is error cleanup, not speech interruption.

Use one monotonically increasing turn ID and AbortController shared by LLM read, TTS requests and playback. Keep an explicit current AudioBufferSourceNode. While SPEAKING, a separate echo-cancelled browser capture/VAD monitor detects sustained new speech; thresholds, pre-roll and speaker echo rejection require target hardware tuning. Do not open Handy GUI.

On confirmed speech: increment turn ID first, stop the source immediately, abort LLM/TTS fetches and cancel the reader, discard pending text/audio and queued chunks, switch to LISTENING, retain speech pre-roll, then process the new utterance through the existing headless STT path. Every asynchronous continuation checks its turn ID before changing UI, playing sound or storing output. Release the chat bridge's `sending` lock in its finally block and suppress stale callbacks/timers.

Client abort is insufficient for a running GPU job: add request/turn IDs to the worker and discard cancelled jobs before acquiring the synthesis lock and after generation. Do not claim GPU preemption unless the model API supports it. New-turn latency under an old in-flight synthesis must be measured before enabling automatic barge-in.

Required future tests: interrupt during fetch/decode/playback/prefetch, no stale audio/UI, queue clear, chat-lock release, clean next turn, server discards queued cancelled jobs, microphone denied, echo false positives and repeated interruption. Camera/MediaPipe remains P1 and reuses Jarvis's existing implementation.
