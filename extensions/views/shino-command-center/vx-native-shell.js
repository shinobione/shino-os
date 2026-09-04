(function () {
  'use strict';

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const STATES = ['idle', 'listening', 'thinking', 'speaking', 'working', 'error'];
  const STATE_COPY = {
    idle: ['IDLE', 'À VOTRE SERVICE.'],
    listening: ['LISTENING', 'JE VOUS ÉCOUTE.'],
    thinking: ['THINKING', 'ANALYSE EN COURS.'],
    speaking: ['SPEAKING', 'RÉPONSE EN COURS.'],
    working: ['WORKING', 'EXÉCUTION.'],
    error: ['ERROR', 'ANOMALIE DÉTECTÉE.'],
  };
  const ORB_STATE = {
    idle: 'idle',
    listening: 'listening',
    thinking: 'thinking',
    speaking: 'speaking',
    working: 'thinking',
    error: 'offline',
  };

  if (!window.Jarvis || !window.Jarvis.views) return;

  let container = null;
  let state = 'idle';
  let mode = 'RISO';
  let visible = false;
  let clockTimer = null;
  let perfTimer = null;
  let brainTimer = null;
  let micObserver = null;

  function q(sel) {
    return container ? container.querySelector(sel) : null;
  }

  function qa(sel) {
    return container ? Array.from(container.querySelectorAll(sel)) : [];
  }

  function setText(sel, value) {
    const el = q(sel);
    if (el) el.textContent = value;
  }

  function pct(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function markup() {
    return `
      <div class="sho-shell sho-native-shell">
        <header class="sho-top">
          <div class="sho-brand">
            <div class="sho-mark"></div>
            <div>
              <strong>SHINO-OS</strong>
              <small>JARVIS NATIVE CORE</small>
            </div>
          </div>
          <div class="sho-time"><span id="sho-date">--</span><b id="sho-clock">--:--:--</b></div>
          <div class="sho-topstats">
            <button class="sho-native-action" id="sho-mission-btn" type="button"><span>MC</span><b>MISSION CONTROL</b></button>
            <button class="sho-native-action sho-voice-btn" id="sho-voice-btn" type="button"><span>MIC</span><b id="sho-voice-label">VOICE OFF</b></button>
            <div class="sho-topstat"><span>CPU</span><b id="sho-top-cpu">--%</b></div>
            <div class="sho-topstat"><span>RAM</span><b id="sho-top-ram">--%</b></div>
            <div class="sho-topstat"><span>DISK</span><b id="sho-top-disk">--%</b></div>
            <div class="sho-topstat"><span>BACKEND</span><b class="sho-online" id="sho-backend">ONLINE</b></div>
          </div>
        </header>

        <aside class="sho-rail">
          <button class="active" title="Accueil" data-sho-nav="home">⌂</button>
          <button title="Mission Control" data-sho-nav="mission">◎</button>
          <button title="Conversation" data-sho-nav="chat">◌</button>
          <button title="Réglages" data-sho-nav="settings">⚙</button>
          <div class="sho-build">SHINO v0.2.3<br>NATIVE ORB</div>
        </aside>

        <main class="sho-main">
          <section class="sho-panel sho-chat">
            <div class="sho-title"><span>CONVERSATION</span><small>JARVIS SESSION</small></div>
            <div class="sho-chatlog">
              <div class="sho-msg ai"><b>Shino</b><p>SHINO-OS utilise désormais la vraie sphère Jarvis et son moteur natif.</p></div>
            </div>
            <div class="sho-input">Connexion au chat Jarvis…</div>
          </section>

          <section class="sho-stack">
            <div class="sho-panel"><div class="sho-title"><span>ÉTAT</span><small>LIVE</small></div><ul class="sho-list"><li><span>Jarvis runtime</span><em>ONLINE</em></li><li><span>SHINO skin</span><em>ACTIVE</em></li><li><span>Native orb</span><em>CONNECTED</em></li><li><span>Memory kernel</span><em>JARVIS</em></li></ul></div>
            <div class="sho-panel"><div class="sho-title"><span>CHARGE SYSTÈME</span><small>REAL API</small></div><div class="sho-gpu"><div class="sho-gpurow"><span>CPU</span><div class="sho-bar"><i id="sho-cpu-bar"></i></div><strong id="sho-cpu">--%</strong></div><div class="sho-gpurow"><span>RAM</span><div class="sho-bar"><i id="sho-ram-bar"></i></div><strong id="sho-ram">--%</strong></div><div class="sho-gpurow"><span>DISK</span><div class="sho-bar"><i id="sho-disk-bar"></i></div><strong id="sho-disk">--%</strong></div></div></div>
            <div class="sho-panel sho-modecard"><div class="sho-title"><span>MODE ACTUEL</span></div><b id="sho-mode">RISO</b><span>Contexte SHINO actif</span></div>
          </section>

          <section class="sho-corezone sho-native-corezone">
            <div class="sho-native-core-aura"></div>
            <div class="sho-corelabel"><span>NATIVE JARVIS ORB</span><strong id="sho-core-state">IDLE</strong></div>
            <div class="sho-native-orb-caption">THREE.JS · JARVIS ORB ENGINE</div>
            <div class="sho-service" id="sho-service">À VOTRE SERVICE.</div>
          </section>

          <section class="sho-stack" style="grid-template-rows:.9fr 1.1fr">
            <div class="sho-panel sho-brain"><div class="sho-title"><span>BRAIN MODE</span><small id="sho-brain-label">DETECTING</small></div><div class="sho-brainopt" data-brain="OPENAI"><div><b>CHATGPT / OPENAI</b><small>Cloud brain path</small></div><span>○</span></div><div class="sho-brainopt" data-brain="LOCAL"><div><b>LOCAL</b><small>Ollama / LAN</small></div><span>○</span></div><div class="sho-brainopt" data-brain="OTHER"><div><b>OTHER CLOUD</b><small>Claude / Gemini / Mistral</small></div><span>○</span></div></div>
            <div class="sho-panel sho-skills"><div class="sho-title"><span>SHINO SKILLS</span><small>OVERLAY</small></div><ul class="sho-list"><li><span>RISO ASSISTANT</span><em>PLANNED</em></li><li><span>SHINOBIWAN A&R</span><em>PLANNED</em></li><li><span>DEV HELPER</span><em>JARVIS</em></li><li><span>FILES / CLI</span><em>JARVIS</em></li><li><span>PROACTIVE ENGINE</span><em>JARVIS</em></li></ul></div>
          </section>

          <section class="sho-panel sho-system"><div class="sho-title"><span>SYSTÈME</span><small>JARVIS API</small></div><div class="sho-sysrow"><div><b>CPU</b><span>REALTIME</span></div><strong id="sho-sys-cpu">--%</strong></div><div class="sho-sysrow"><div><b>MEMORY</b><span>REALTIME</span></div><strong id="sho-sys-ram">--%</strong></div><div class="sho-sysrow"><div><b>STORAGE</b><span>REALTIME</span></div><strong id="sho-sys-disk">--%</strong></div><div class="sho-sysrow"><div><b>VOICE</b><span>JARVIS LIVEKIT UI</span></div><strong id="sho-sys-voice">OFF</strong></div><div class="sho-sysrow"><div><b>ORB</b><span>NATIVE THREE.JS</span></div><strong>ON</strong></div></section>
        </main>

        <nav class="sho-dock" id="sho-dock"><button class="active" data-mode="RISO"><b>RISO</b><small>OPERATIONS</small></button><button data-mode="MUSIC"><b>MUSIC</b><small>SHINOBIWAN</small></button><button data-mode="DEV"><b>DEV</b><small>DEVELOPMENT</small></button><button data-mode="FILES"><b>FILES</b><small>DOCUMENTS</small></button><button data-mode="PC"><b>PC</b><small>SYSTEM</small></button><button data-mode="SETTINGS"><b>SETTINGS</b><small>CONFIG</small></button><button class="sho-home-lock" title="SHINO Home est la Home par défaut">SHINO</button></nav>
      </div>`;
  }

  function mirrorNativeOrb(next) {
    const orbState = ORB_STATE[next] || 'idle';
    if (typeof window.__jarvisSetOrbState === 'function') {
      try { window.__jarvisSetOrbState(orbState); } catch (_) {}
    }
  }

  function setState(next) {
    next = String(next || 'idle').toLowerCase();
    if (!STATES.includes(next)) next = 'idle';
    state = next;
    if (container) {
      container.dataset.state = next;
      setText('#sho-core-state', STATE_COPY[next][0]);
      setText('#sho-service', STATE_COPY[next][1]);
    }
    mirrorNativeOrb(next);
  }

  function setMode(next) {
    mode = String(next || 'RISO').toUpperCase();
    setText('#sho-mode', mode);
    qa('#sho-dock [data-mode]').forEach((btn) => btn.classList.toggle('active', btn.dataset.mode === mode));
    if (mode === 'SETTINGS') {
      window.Jarvis.navigate('/settings');
      return;
    }
    setState('working');
    window.setTimeout(() => { if (visible) setState('idle'); }, 650);
  }

  function syncVoiceUi() {
    if (!container) return;
    const nativeMic = document.getElementById('hc-mic');
    const active = Boolean(nativeMic && nativeMic.classList.contains('active'));
    const label = q('#sho-voice-label');
    const sys = q('#sho-sys-voice');
    const button = q('#sho-voice-btn');
    if (label) label.textContent = active ? 'VOICE ON' : 'VOICE OFF';
    if (sys) sys.textContent = active ? 'ON' : 'OFF';
    if (button) button.classList.toggle('active', active);
  }

  function toggleVoice() {
    const nativeMic = document.getElementById('hc-mic');
    if (!nativeMic) {
      window.Jarvis.notify?.({ kind: 'err', text: 'Client vocal Jarvis introuvable sur cette page.' });
      return;
    }
    nativeMic.click();
    window.setTimeout(syncVoiceUi, 80);
  }

  function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = ROOT_ID;
    container.dataset.state = state;
    container.style.display = 'none';
    container.style.opacity = '0';
    container.innerHTML = markup();
    document.body.appendChild(container);

    qa('#sho-dock [data-mode]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
    q('#sho-mission-btn')?.addEventListener('click', () => window.Jarvis.openMissionControl?.());
    q('#sho-voice-btn')?.addEventListener('click', toggleVoice);
    qa('[data-sho-nav]').forEach((btn) => btn.addEventListener('click', () => {
      const action = btn.dataset.shoNav;
      if (action === 'mission') window.Jarvis.openMissionControl?.();
      if (action === 'settings') window.Jarvis.navigate('/settings');
      if (action === 'chat') q('#sho-chat-input')?.focus();
    }));

    const nativeMic = document.getElementById('hc-mic');
    if (nativeMic && !micObserver) {
      micObserver = new MutationObserver(syncVoiceUi);
      micObserver.observe(nativeMic, { attributes: true, attributeFilter: ['class', 'data-state'] });
    }
    syncVoiceUi();
    return container;
  }

  function updateClock() {
    if (!container) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    setText('#sho-clock', `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    setText('#sho-date', now.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase());
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-store', headers: window.Jarvis?.authHeaders ? window.Jarvis.authHeaders() : {} });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  async function refreshPerf() {
    try {
      const data = await fetchJson('/api/system/perf');
      const cpu = pct(data.cpu_pct);
      const ram = pct(data.ram_pct);
      const disk = pct(data.disk_pct ?? data.disk_used_pct);
      [['cpu', cpu], ['ram', ram], ['disk', disk]].forEach(([key, value]) => {
        const rounded = `${Math.round(value)}%`;
        setText(`#sho-${key}`, rounded);
        setText(`#sho-sys-${key}`, rounded);
        setText(`#sho-top-${key}`, rounded);
        const bar = q(`#sho-${key}-bar`);
        if (bar) bar.style.width = `${value}%`;
      });
    } catch (_) {
      setText('#sho-backend', 'API WAIT');
    }
  }

  async function refreshBrain() {
    try {
      const data = await fetchJson('/api/config/llm-status');
      const raw = String(data.backend || data.provider || data.api_backend || data.active_backend || data.model || 'ONLINE');
      const upper = raw.toUpperCase();
      setText('#sho-brain-label', upper);
      setText('#sho-backend', 'ONLINE');
      qa('.sho-brainopt').forEach((el) => {
        const key = el.dataset.brain;
        const local = upper.includes('OLLAMA') || upper.includes('LOCAL');
        const openai = upper.includes('OPENAI');
        const match = key === 'LOCAL' ? local : key === 'OPENAI' ? openai : (!local && !openai);
        el.classList.toggle('active', match);
      });
    } catch (_) {
      setText('#sho-brain-label', 'UNKNOWN');
    }
  }

  function start() {
    visible = true;
    updateClock();
    refreshPerf();
    refreshBrain();
    syncVoiceUi();
    clockTimer = window.setInterval(updateClock, 1000);
    perfTimer = window.setInterval(refreshPerf, 2500);
    brainTimer = window.setInterval(refreshBrain, 8000);
  }

  function stop() {
    visible = false;
    window.clearInterval(clockTimer);
    window.clearInterval(perfTimer);
    window.clearInterval(brainTimer);
    clockTimer = perfTimer = brainTimer = null;
  }

  function show(params = {}) {
    ensureContainer();
    document.body.classList.add('shino-home-active');
    container.style.display = 'block';
    container.getBoundingClientRect();
    container.style.opacity = '1';
    if (params.mode) mode = String(params.mode).toUpperCase();
    setMode(mode);
    setState(params.state || 'idle');
    if (!visible) start();
    try { localStorage.setItem('shino_home_skin', '1'); } catch (_) {}
  }

  function hide() {
    if (!container) return;
    stop();
    container.style.opacity = '0';
    document.body.classList.remove('shino-home-active');
    window.setTimeout(() => { if (container && !visible) container.style.display = 'none'; }, 220);
  }

  // Override the prototype view registered by view.js before autostart executes.
  window.Jarvis.views.register(VIEW_ID, {
    meta: {
      name: 'SHINO Command Center',
      desc: 'Persistent SHINO Home using the native Jarvis Three.js orb',
      glyph: 'SHO',
      tags: ['shino', 'home', 'native-orb', 'ultrawide'],
    },
    show,
    hide,
    command(cmd, params = {}) {
      if (cmd === 'set_state') setState(params.state || 'idle');
      else if (cmd === 'set_mode') setMode(params.mode || 'RISO');
      else if (cmd === 'refresh') { refreshPerf(); refreshBrain(); }
    },
  });

  function restoreHomeSkin() {
    if (location.pathname !== '/' && !location.pathname.endsWith('/home.html')) return;
    const views = window.Jarvis?.views;
    if (!views?._registry?.[VIEW_ID]) return;
    if (views._active && views._active !== VIEW_ID) return;
    if (views._active !== VIEW_ID) views.activate(VIEW_ID, { mode, state: 'idle' });
    else document.body.classList.add('shino-home-active');
  }

  // BFCache / retour Mission Control / onglet réactivé : SHINO reste la Home.
  window.addEventListener('pageshow', () => window.setTimeout(restoreHomeSkin, 0));
  window.addEventListener('focus', () => window.setTimeout(restoreHomeSkin, 0));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) window.setTimeout(restoreHomeSkin, 0);
  });
})();
