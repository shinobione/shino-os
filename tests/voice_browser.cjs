const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = 'extensions/views/shino-command-center/';
const events = [];
const context = vm.createContext({
  window: { fetch: async () => {} },
  document: { readyState: 'loading', addEventListener() {} },
  console, AbortController, performance, setTimeout, fetch: async () => {},
});
vm.runInContext(fs.readFileSync(base + 'zzzzz-speech-normalizer.js', 'utf8'), context);
let code = fs.readFileSync(base + 'zzzz-local-voice.js', 'utf8');
// Expose lexical helpers in the test VM only; production has no test API.
code = code.replace('  function boot() {', `
  window.test = { createSpeechStreamer, extractReadySpeech, normalizeSpeech, sttSummary,
    realSynthesize: synthesize, realPlay: playAudio,
    audio(ctx) { playbackCtx = ctx; },
    mocks(synth, play, ui) { synthesize = synth; playAudio = play; setUi = ui; setCore = () => {}; }
  };
  function boot() {`);
vm.runInContext(code, context);
const api = context.window.test;
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  assert.match(api.sttSummary({ client_total_ms: 5450, transcribe_ms: 561 }, 'VULKAN0'), /total 5.45s \/ infer 561ms/);
  // Exercise real header parsing and WebAudio instrumentation with controlled
  // response/decode/playback boundaries; no actual sound or browser is used.
  const buffers = [], diagnostics = { start: performance.now(), segments: [] };
  let endNode;
  api.audio({ state: 'running', currentTime: 12, outputLatency: .03, destination: {},
    async decodeAudioData() { await tick(); return {}; },
    createBufferSource() { const node = { connect() {}, disconnect() {}, stop() {},
      start() { buffers.push('start'); endNode = () => node.onended(); } }; return node; }
  });
  context.fetch = async () => ({ ok: true, headers: { get(key) {
    return { 'X-SHINO-TTS': 'chatterbox-v3', 'X-SHINO-TTS-MS': '2300', 'X-SHINO-SYNTH-MS': '2200' }[key] || null;
  } }, async arrayBuffer() { await tick(); return new ArrayBuffer(4); } });
  api.mocks(api.realSynthesize, api.realPlay, (...args) => events.push(args));
  const real = api.createSpeechStreamer(diagnostics.start, diagnostics);
  real.push('Bonjour.');
  await tick(); await tick(); await tick();
  assert.equal(buffers.length, 1);
  const first = diagnostics.segments[0];
  assert.equal(first.backend, 'chatterbox-v3');
  assert.equal(first.server_request_ms, 2300);
  assert.equal(first.worker_synthesis_ms, 2200);
  assert.ok(first.queued_ms <= first.synth_request_start_ms);
  assert.ok(first.synth_request_start_ms <= first.synth_response_received_ms);
  assert.ok(first.synth_response_received_ms <= first.decode_complete_ms);
  assert.ok(first.decode_complete_ms <= first.source_start_ms);
  assert.equal(diagnostics.first_playback_start_ms, first.source_start_ms);
  assert.equal(diagnostics.first_eligible_to_playback_ms, first.source_start_ms - first.queued_ms);
  assert.equal(first.end_ms, undefined, 'end must await WebAudio ended');
  endNode(); await real.finish();
  assert.ok(first.end_ms >= first.source_start_ms);
  assert.equal(diagnostics.any_fallback, false);
  context.fetch = async () => ({ ok: true, headers: { get(key) {
    return { 'X-SHINO-TTS': 'piper', 'X-SHINO-TTS-FALLBACK': 'chatterbox-failed' }[key] || null;
  } }, async arrayBuffer() { return new ArrayBuffer(4); } });
  const fallbackTurn = { start: performance.now(), segments: [] };
  const fallbackStream = api.createSpeechStreamer(fallbackTurn.start, fallbackTurn);
  fallbackStream.push('Repli.');
  await tick(); await tick();
  endNode(); await fallbackStream.finish();
  assert.equal(fallbackTurn.any_fallback, true);
  assert.equal(fallbackTurn.segments[0].backend, 'piper');
  events.length = 0;
  assert.equal(api.normalizeSpeech('[tool]'), '');
  assert.equal(api.normalizeSpeech('**Bonjour** 😊 [BG:PROJECT]'), 'Bonjour.');
  let cut = api.extractReadySpeech('Salut. ```js\nsecret.call(); ', false, false);
  assert.deepEqual(Array.from(cut.segments), ['Salut.']);
  assert.ok(cut.rest.startsWith('```'));
  cut = api.extractReadySpeech(cut.rest + '``` Fini.', true, false);
  assert.ok(!cut.segments.join(' ').includes('secret'));

  const synthesized = [], played = [];
  let finishFirst;
  api.mocks(async text => { synthesized.push(text); return { bytes: text, engine: 'chatterbox-v3' }; },
    async bytes => { played.push(bytes); if (played.length === 1) await new Promise(r => { finishFirst = r; }); },
    (...args) => events.push(args));
  const stream = api.createSpeechStreamer(performance.now());
  stream.push('Un. Deux.');
  await tick();
  assert.equal(synthesized.length, 2, 'prefetch while first audio plays');
  assert.equal(played.length, 1, 'ordered playback');
  finishFirst();
  assert.equal((await stream.finish()).segments, 2);
  assert.ok(events.every(e => !e.join(' ').includes('PIPER')));
  assert.ok(events.some(e => e[1] === 'CHATTERBOX V3 · STREAM'));

  let calls = 0;
  api.mocks(async () => { calls++; throw Error('synthesis failed'); }, async () => assert.fail('must not play'), () => {});
  const broken = api.createSpeechStreamer(performance.now());
  broken.push('Un. Deux.');
  await tick(); // rejection must already be handled before generation finishes
  await assert.rejects(broken.finish(), /synthesis failed/);
  assert.equal(calls, 1);

  let signalSeen;
  api.mocks(async (text, signal) => { signalSeen = signal; await tick(); return { bytes: text }; },
    async () => assert.fail('cancelled turn must not play'), () => {});
  const cancelled = api.createSpeechStreamer(performance.now());
  cancelled.push('Un. Deux.');
  await Promise.resolve();
  cancelled.cancel();
  await cancelled.finish();
  assert.ok(signalSeen.aborted);
  console.log('Browser voice: normalization, code fences, order, prefetch, labels, failure and cancellation OK');
})().catch(err => { console.error(err); process.exitCode = 1; });
