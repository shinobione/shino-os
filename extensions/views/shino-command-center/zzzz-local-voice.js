(function () {
  'use strict';

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const TARGET_RATE = 16000;
  const SILENCE_MS = 700;
  const MAX_RECORD_MS = 20000;
  const RMS_GATE = 0.014;
  const STT_TIMEOUT_MS = 60000;
  const FIRST_SPEECH_TRIGGER = 100;
  const FIRST_SPEECH_MIN = 48;
  const LONG_SPEECH_TRIGGER = 220;
  const ORB_STATE = {
    idle: 'idle', listening: 'listening', thinking: 'thinking', speaking: 'speaking', error: 'offline',
  };

  let captureActive = false;
  let processing = false;
  let stream = null;
  let captureCtx = null;
  let playbackCtx = null;
  let source = null;
  let processor = null;
  let silentGain = null;
  let chunks = [];
  let sourceRate = 48000;
  let startedAt = 0;
  let lastVoiceAt = 0;
  let speechDetected = false;
  let authoritativeCore = 'idle';
  let orbHeartbeat = null;

  function root() { return document.getElementById(ROOT_ID); }
  function q(sel) { return root()?.querySelector(sel) || null; }
  function authHeaders(extra = {}) {
    return { ...(window.Jarvis?.authHeaders ? window.Jarvis.authHeaders() : {}), ...extra };
  }
  function applyNativeOrb(state) {
    try { window.__jarvisSetOrbState?.(ORB_STATE[state] || 'idle'); } catch (_) {}
  }
  function syncOrbHeartbeat() {
    if (authoritativeCore === 'idle') {
      if (orbHeartbeat) window.clearInterval(orbHeartbeat);
      orbHeartbeat = null;
      return;
    }
    if (!orbHeartbeat) {
      orbHeartbeat = window.setInterval(() => {
        if (captureActive || processing || authoritativeCore === 'error') applyNativeOrb(authoritativeCore);
      }, 180);
    }
  }
  function setCore(state) {
    authoritativeCore = state || 'idle';
    try { window.Jarvis?.views?.dispatch(VIEW_ID, 'set_state', { state: authoritativeCore }); } catch (_) {}
    applyNativeOrb(authoritativeCore);
    syncOrbHeartbeat();
  }
  function setUi(label, sys, active) {
    const labelEl = q('#sho-voice-label');
    const sysEl = q('#sho-sys-voice');
    const btn = q('#sho-voice-btn');
    if (labelEl) labelEl.textContent = label;
    if (sysEl) sysEl.textContent = sys;
    if (btn) btn.classList.toggle('active', Boolean(active));
  }
  function notify(text, kind = 'info') {
    try { window.Jarvis?.notify?.({ kind, text }); } catch (_) {}
  }
  function handyModelLabel(status) {
    const raw = String(status?.handy_model || 'Whisper Large V3 Turbo');
    if (raw.includes('large-v3-turbo')) return 'TURBO';
    return raw.split('/').pop().replace(/-gguf$/i, '').toUpperCase();
  }
  function ttsLabel(engine) {
    const raw = String(engine || '').toLowerCase();
    if (raw.includes('chatterbox')) return 'CHATTERBOX V3';
    if (raw.includes('piper')) return 'PIPER';
    return raw ? raw.toUpperCase() : 'TTS';
  }

  function flatten() {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return out;
  }

  function resample(input, fromRate, toRate) {
    if (!input.length || fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const length = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const pos = i * ratio;
      const left = Math.floor(pos);
      const right = Math.min(input.length - 1, left + 1);
      const frac = pos - left;
      output[i] = input[left] * (1 - frac) + input[right] * frac;
    }
    return output;
  }

  async function ensurePlaybackContext() {
    if (!playbackCtx || playbackCtx.state === 'closed') {
      playbackCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (playbackCtx.state === 'suspended') await playbackCtx.resume();
    return playbackCtx;
  }

  async function fetchStatus() {
    const response = await fetch('/api/shino/voice/status', { cache: 'no-store', headers: authHeaders() });
    if (!response.ok) throw new Error(`status HTTP ${response.status}`);
    return response.json();
  }

  async function start() {
    if (captureActive || processing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Micro navigateur indisponible.', 'err');
      return;
    }
    try {
      await ensurePlaybackContext();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      captureCtx = new (window.AudioContext || window.webkitAudioContext)();
      sourceRate = captureCtx.sampleRate || 48000;
      source = captureCtx.createMediaStreamSource(stream);
      processor = captureCtx.createScriptProcessor(4096, 1, 1);
      silentGain = captureCtx.createGain();
      silentGain.gain.value = 0;
      chunks = [];
      speechDetected = false;
      startedAt = performance.now();
      lastVoiceAt = startedAt;
      captureActive = true;

      processor.onaudioprocess = (event) => {
        if (!captureActive) return;
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        chunks.push(copy);
        let power = 0;
        for (let i = 0; i < input.length; i++) power += input[i] * input[i];
        const rms = Math.sqrt(power / Math.max(1, input.length));
        const now = performance.now();
        if (rms >= RMS_GATE) { speechDetected = true; lastVoiceAt = now; }
        if ((speechDetected && now - lastVoiceAt >= SILENCE_MS) || now - startedAt >= MAX_RECORD_MS) {
          stopAndProcess();
        }
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(captureCtx.destination);
      setUi('LISTENING…', 'LOCAL MIC', true);
      setCore('listening');
    } catch (err) {
      captureActive = false;
      setUi('VOICE OFF', 'MIC ERROR', false);
      setCore('error');
      notify(`Micro impossible: ${err.message || err}`, 'err');
      setTimeout(() => setCore('idle'), 1200);
    }
  }

  async function closeCapture() {
    captureActive = false;
    if (processor) processor.onaudioprocess = null;
    try { source?.disconnect(); } catch (_) {}
    try { processor?.disconnect(); } catch (_) {}
    try { silentGain?.disconnect(); } catch (_) {}
    if (stream) stream.getTracks().forEach((track) => track.stop());
    try { await captureCtx?.close(); } catch (_) {}
    stream = captureCtx = source = processor = silentGain = null;
  }

  async function transcribe(pcm) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    const started = performance.now();
    let pollBusy = false;
    const poll = window.setInterval(async () => {
      if (pollBusy) return;
      pollBusy = true;
      try {
        const status = await fetchStatus();
        const elapsed = Math.max(1, Math.round((performance.now() - started) / 1000));
        if (status.stt_phase === 'lan') {
          setUi(`TRANSCRIBING ${elapsed}s`, 'WHISPER LAN', true);
        } else {
          const model = handyModelLabel(status);
          const backend = status.handy_bound_backend ? String(status.handy_bound_backend).toUpperCase() : 'VULKAN';
          setUi(`HANDY ${elapsed}s`, `${model} · ${backend}`, true);
        }
        setCore('thinking');
      } catch (_) {
        setUi(`HANDY ${Math.max(1, Math.round((performance.now() - started) / 1000))}s`, 'TRANSCRIBING', true);
      } finally {
        pollBusy = false;
      }
    }, 700);

    try {
      const bytes = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
      const response = await fetch('/api/shino/voice/transcribe', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
        body: bytes,
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = '';
        try {
          const payload = await response.json();
          detail = String(payload?.detail || payload?.error || payload?.message || '').trim();
        } catch (_) {}
        if (!detail) {
          try {
            const status = await fetchStatus();
            detail = String(status?.stt_last_error || '').trim();
          } catch (_) {}
        }
        throw new Error(detail ? `STT ${response.status}: ${detail}` : `STT HTTP ${response.status}`);
      }
      return response.json();
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error('Handy timeout après 60 s');
      throw err;
    } finally {
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    }
  }

  async function synthesize(text) {
    const response = await fetch('/api/shino/voice/tts', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text, language_id: 'fr' }),
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
    return {
      bytes: await response.arrayBuffer(),
      engine: response.headers.get('X-SHINO-TTS') || 'piper',
      durationMs: Number(response.headers.get('X-SHINO-TTS-MS') || 0),
    };
  }

  async function playAudio(bytes) {
    const ctx = await ensurePlaybackContext();
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    return new Promise((resolve, reject) => {
      try {
        const node = ctx.createBufferSource();
        node.buffer = decoded;
        node.connect(ctx.destination);
        node.onended = resolve;
        node.start();
      } catch (err) { reject(err); }
    });
  }

  function normalizeSpeech(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    try {
      return String(window.SHINOSpeech?.normalize?.(raw) || raw).trim();
    } catch (_) {
      return raw;
    }
  }

  function naturalCut(text, limit, minimum) {
    const windowText = String(text || '').slice(0, Math.min(limit, text.length));
    let cut = Math.max(
      windowText.lastIndexOf(', '),
      windowText.lastIndexOf('; '),
      windowText.lastIndexOf(': '),
      windowText.lastIndexOf(' — '),
      windowText.lastIndexOf(' - '),
    );
    if (cut < minimum) cut = windowText.lastIndexOf(' ');
    return cut >= minimum ? cut : -1;
  }

  function extractReadySpeech(buffer, flush = false, lowLatency = false) {
    let rest = String(buffer || '');
    const segments = [];

    while (rest.trim()) {
      const match = rest.match(/^([\s\S]*?[.!?…]+)(?=\s|$)/);
      if (!match) break;
      const segment = match[1].trim();
      if (segment) segments.push(segment);
      rest = rest.slice(match[0].length).trimStart();
    }

    if (!flush && lowLatency && segments.length === 0 && rest.length >= FIRST_SPEECH_TRIGGER) {
      const cut = naturalCut(rest, FIRST_SPEECH_TRIGGER, FIRST_SPEECH_MIN);
      if (cut >= FIRST_SPEECH_MIN) {
        segments.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trimStart();
      }
    }

    if (!flush && rest.length > LONG_SPEECH_TRIGGER) {
      const windowText = rest.slice(0, 200);
      let cut = Math.max(windowText.lastIndexOf('; '), windowText.lastIndexOf(': '), windowText.lastIndexOf(', '));
      if (cut < 90) cut = windowText.lastIndexOf(' ');
      if (cut > 80) {
        segments.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trimStart();
      }
    }

    if (flush && rest.trim()) {
      segments.push(rest.trim());
      rest = '';
    }

    return { segments, rest };
  }

  function createSpeechStreamer(turnStartedAt) {
    let pendingText = '';
    let synthChain = Promise.resolve();
    let playChain = Promise.resolve();
    let spokenSegments = 0;
    let firstSegmentQueued = false;
    let firstAudioLogged = false;
    let lastEngine = 'piper';

    function enqueue(rawSegment) {
      const spoken = normalizeSpeech(rawSegment);
      if (!spoken || spoken.length < 2) return;
      firstSegmentQueued = true;

      const audioPromise = synthChain = synthChain.then(async () => {
        setUi('SPEAKING…', ttsLabel(lastEngine), true);
        setCore('speaking');
        const audio = await synthesize(spoken);
        lastEngine = audio.engine || lastEngine;
        if (audio.durationMs > 0) {
          console.info(`[SHINO-OS] TTS ${ttsLabel(lastEngine)} ${Math.round(audio.durationMs)}ms · ${spoken.length} chars`);
        }
        return audio;
      });

      playChain = playChain.then(async () => {
        const audio = await audioPromise;
        setUi('SPEAKING…', `${ttsLabel(audio.engine || lastEngine)} · STREAM`, true);
        setCore('speaking');
        if (!firstAudioLogged) {
          firstAudioLogged = true;
          console.info(`[SHINO-OS] Voice first audio ${Math.round(performance.now() - turnStartedAt)}ms after capture close`);
        }
        await playAudio(audio.bytes);
        spokenSegments += 1;
      });
    }

    return {
      push(delta) {
        pendingText += String(delta || '');
        const ready = extractReadySpeech(pendingText, false, !firstSegmentQueued);
        pendingText = ready.rest;
        ready.segments.forEach(enqueue);
      },
      async finish() {
        const ready = extractReadySpeech(pendingText, true, false);
        pendingText = ready.rest;
        ready.segments.forEach(enqueue);
        await playChain;
        return { engine: lastEngine, segments: spokenSegments };
      },
    };
  }

  async function stopAndProcess() {
    if (!captureActive || processing) return;
    processing = true;
    const recorded = flatten();
    const recordedRate = sourceRate;
    await closeCapture();
    const turnStartedAt = performance.now();

    try {
      if (recorded.length < recordedRate * 0.2) {
        setUi('VOICE READY', 'HANDY READY', false);
        setCore('idle');
        return;
      }

      let preflight = null;
      try { preflight = await fetchStatus(); } catch (_) {}
      if (preflight && preflight.stt !== 'lan' && preflight.handy_available === false) {
        throw new Error('Handy introuvable sur ce PC');
      }
      setUi('HANDY…', preflight?.stt === 'lan' ? 'WHISPER LAN' : 'TURBO · RTX 3060', true);
      setCore('thinking');
      const pcm = resample(recorded, recordedRate, TARGET_RATE);
      const stt = await transcribe(pcm);
      const text = String(stt.text || '').trim();
      if (!text) {
        setUi('VOICE READY', 'HANDY READY', false);
        setCore('idle');
        notify('Je n’ai rien compris — retente.', 'warn');
        return;
      }

      const inferMs = Number(stt.transcribe_ms || 0);
      const loadMs = Number(stt.load_ms || 0);
      const backend = String(stt.bound_backend || stt.device || '').toUpperCase();
      const sttInfo = stt.backend === 'lan'
        ? 'WHISPER LAN'
        : `HANDY ${backend || 'VULKAN'} · ${Math.round(inferMs || Number(stt.duration_ms || 0))}ms`;
      setUi('THINKING…', sttInfo, true);
      setCore('thinking');
      if (loadMs > 0) console.info(`[SHINO-OS] Handy load ${Math.round(loadMs)}ms, infer ${Math.round(inferMs)}ms`);
      if (!window.SHINOChat?.sendText) throw new Error('chat bridge unavailable');

      const speech = createSpeechStreamer(turnStartedAt);
      const answer = await window.SHINOChat.sendText(text, {
        deferIdle: true,
        noFocus: true,
        onDelta: (delta) => speech.push(delta),
      });
      if (!answer) throw new Error('empty assistant response');

      const spoken = await speech.finish();
      const finalTts = ttsLabel(spoken.engine);
      setUi('VOICE READY', `${stt.backend === 'lan' ? 'LAN' : 'HANDY'} + ${finalTts}`, false);
      setCore('idle');
    } catch (err) {
      console.error('[SHINO-OS] Local voice turn failed:', err);
      setUi('VOICE ERROR', 'VOICE ERR', false);
      setCore('error');
      notify(`Voix locale: ${err.message || err}`, 'err');
      setTimeout(() => { setUi('VOICE READY', 'HANDY READY', false); setCore('idle'); }, 1800);
    } finally {
      processing = false;
      chunks = [];
    }
  }

  async function toggle() {
    if (processing) return;
    if (captureActive) await stopAndProcess();
    else await start();
  }

  async function refreshStatus() {
    try {
      const status = await fetchStatus();
      const tts = status.tts_url ? 'CHATTERBOX' : 'PIPER';
      if (status.stt === 'lan') setUi('VOICE READY', `LAN · ${tts}`, false);
      else if (status.handy_available) setUi('VOICE READY', `HANDY · ${tts}`, false);
      else setUi('VOICE OFF', 'HANDY MISSING', false);
    } catch (_) {}
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#sho-voice-btn');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle();
  }, true);

  window.SHINOLocalVoice = { toggle, start, stop: stopAndProcess, refreshStatus };

  function boot() {
    if (root()) refreshStatus();
    else {
      const observer = new MutationObserver(() => {
        if (root()) { observer.disconnect(); refreshStatus(); }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();