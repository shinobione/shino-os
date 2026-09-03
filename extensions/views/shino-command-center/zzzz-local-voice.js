(function () {
  'use strict';

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const TARGET_RATE = 16000;
  const SILENCE_MS = 1050;
  const MAX_RECORD_MS = 20000;
  const RMS_GATE = 0.014;

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

  function root() { return document.getElementById(ROOT_ID); }
  function q(sel) { return root()?.querySelector(sel) || null; }
  function authHeaders(extra = {}) {
    return { ...(window.Jarvis?.authHeaders ? window.Jarvis.authHeaders() : {}), ...extra };
  }
  function setCore(state) {
    try { window.Jarvis?.views?.dispatch(VIEW_ID, 'set_state', { state }); } catch (_) {}
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

  function flatten() {
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
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

  async function start() {
    if (captureActive || processing) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      notify('Micro navigateur indisponible.', 'err');
      return;
    }

    try {
      await ensurePlaybackContext();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
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
        if (rms >= RMS_GATE) {
          speechDetected = true;
          lastVoiceAt = now;
        }
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
      setUi('VOICE OFF', 'LOCAL ERR', false);
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
    stream = null;
    captureCtx = null;
    source = null;
    processor = null;
    silentGain = null;
  }

  async function transcribe(pcm) {
    const response = await fetch('/api/shino/voice/transcribe', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/octet-stream' }),
      body: pcm.buffer,
    });
    if (!response.ok) throw new Error(`STT HTTP ${response.status}`);
    return response.json();
  }

  async function synthesize(text) {
    const response = await fetch('/api/shino/voice/tts', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
    return response.arrayBuffer();
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
      } catch (err) {
        reject(err);
      }
    });
  }

  async function stopAndProcess() {
    if (!captureActive || processing) return;
    processing = true;
    const recorded = flatten();
    const recordedRate = sourceRate;
    await closeCapture();

    try {
      if (recorded.length < recordedRate * 0.2) {
        setUi('VOICE OFF', 'LOCAL', false);
        setCore('idle');
        return;
      }

      setUi('TRANSCRIBING…', 'WHISPER', true);
      setCore('thinking');
      const pcm = resample(recorded, recordedRate, TARGET_RATE);
      const stt = await transcribe(pcm);
      const text = String(stt.text || '').trim();
      if (!text) {
        setUi('VOICE OFF', 'LOCAL', false);
        setCore('idle');
        notify('Je n’ai rien compris — retente.', 'warn');
        return;
      }

      setUi('THINKING…', stt.backend === 'lan' ? 'WHISPER LAN' : 'WHISPER LOCAL', true);
      setCore('thinking');
      if (!window.SHINOChat?.sendText) throw new Error('chat bridge unavailable');
      const answer = await window.SHINOChat.sendText(text, { deferIdle: true, noFocus: true });
      if (!answer) throw new Error('empty assistant response');

      setUi('SPEAKING…', 'PIPER', true);
      setCore('speaking');
      const audio = await synthesize(answer);
      await playAudio(audio);
      setUi('VOICE READY', stt.backend === 'lan' ? 'LAN + PIPER' : 'LOCAL + PIPER', false);
      setCore('idle');
    } catch (err) {
      console.error('[SHINO-OS] Local voice turn failed:', err);
      setUi('VOICE ERROR', 'LOCAL ERR', false);
      setCore('error');
      notify(`Voix locale: ${err.message || err}`, 'err');
      setTimeout(() => {
        setUi('VOICE READY', 'LOCAL', false);
        setCore('idle');
      }, 1800);
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
      const response = await fetch('/api/shino/voice/status', { headers: authHeaders() });
      if (!response.ok) return;
      const status = await response.json();
      const mode = status.stt === 'lan' ? 'LAN READY' : 'LOCAL READY';
      setUi('VOICE READY', mode, false);
    } catch (_) {}
  }

  // Capture phase intentionally wins over the legacy native LiveKit click handler.
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
        if (root()) {
          observer.disconnect();
          refreshStatus();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();