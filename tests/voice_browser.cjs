const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const base = 'extensions/views/shino-command-center/';
const events = [];
const context = vm.createContext({
  window: { fetch: async () => {} },
  document: { readyState: 'loading', addEventListener() {} },
  console, AbortController, performance, setTimeout,
});
vm.runInContext(fs.readFileSync(base + 'zzzzz-speech-normalizer.js', 'utf8'), context);
let code = fs.readFileSync(base + 'zzzz-local-voice.js', 'utf8');
// Expose lexical helpers in the test VM only; production has no test API.
code = code.replace('  function boot() {', `
  window.test = { createSpeechStreamer, extractReadySpeech, normalizeSpeech,
    mocks(synth, play, ui) { synthesize = synth; playAudio = play; setUi = ui; setCore = () => {}; }
  };
  function boot() {`);
vm.runInContext(code, context);
const api = context.window.test;
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
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
