(function () {
  const VIEW_ID = 'shino-command-center';
  const SESSION_KEY = 'jarvis_voice_session';
  const ROOT_ID = `${VIEW_ID}-container`;
  let mounted = false;
  let sending = false;

  function authHeaders() {
    return window.Jarvis?.authHeaders ? Jarvis.authHeaders() : {};
  }

  function setCore(state) {
    try { window.Jarvis?.views?.dispatch(VIEW_ID, 'set_state', { state }); } catch (_) {}
  }

  function addStyles() {
    if (document.getElementById('sho-chat-bridge-css')) return;
    const style = document.createElement('style');
    style.id = 'sho-chat-bridge-css';
    style.textContent = `
      #${ROOT_ID} .sho-chatlog{overflow:auto;scrollbar-width:thin;padding-right:6px}
      #${ROOT_ID} .sho-chat-entry{display:flex;align-items:center;gap:8px;padding:10px 12px!important}
      #${ROOT_ID} .sho-chat-entry input{min-width:0;flex:1;background:transparent;border:0;outline:0;color:var(--sho-fg,#dcecff);font:500 13px/1.3 "Geist Mono",monospace;letter-spacing:.02em}
      #${ROOT_ID} .sho-chat-entry input::placeholder{color:rgba(205,226,255,.35)}
      #${ROOT_ID} .sho-chat-entry button{height:32px;padding:0 12px;border:1px solid rgba(83,212,255,.28);border-radius:8px;background:rgba(30,172,224,.09);color:#8cecff;font:600 10px "Geist Mono",monospace;letter-spacing:.13em;cursor:pointer}
      #${ROOT_ID} .sho-chat-entry button:hover{background:rgba(30,172,224,.16)}
      #${ROOT_ID} .sho-chat-entry button:disabled{opacity:.35;cursor:wait}
      #${ROOT_ID} .sho-chat-tools{display:flex;gap:6px}
      #${ROOT_ID} .sho-chat-tools .sho-new{padding:0 9px;color:rgba(205,226,255,.62)}
      #${ROOT_ID} .sho-msg p{white-space:pre-wrap;word-break:break-word}
      #${ROOT_ID} .sho-msg.streaming p::after{content:"";display:inline-block;width:5px;height:11px;margin-left:4px;background:#7ee8ff;opacity:.7;animation:sho-chat-caret .7s steps(1) infinite}
      @keyframes sho-chat-caret{50%{opacity:.15}}
    `;
    document.head.appendChild(style);
  }

  function addMessage(log, role, text, streaming = false) {
    const wrap = document.createElement('div');
    wrap.className = `sho-msg${role === 'assistant' ? ' ai' : ''}${streaming ? ' streaming' : ''}`;
    const label = document.createElement('b');
    label.textContent = role === 'assistant' ? (window.JARVIS_ASSISTANT_NAME || 'Shino') : 'Toi';
    const body = document.createElement('p');
    body.textContent = text || '';
    wrap.append(label, body);
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return { wrap, body };
  }

  async function loadHistory(log) {
    try {
      const sessions = await Jarvis.api.get('/api/sessions');
      if (!Array.isArray(sessions) || !sessions.length) return;
      const messages = await Jarvis.api.get(`/api/sessions/${sessions[0].id}/messages?limit=24`);
      if (!Array.isArray(messages)) return;
      log.innerHTML = '';
      messages.slice(-12).forEach((m) => {
        const text = m.content || m.text || '';
        if (text) addMessage(log, m.role === 'assistant' ? 'assistant' : 'user', text);
      });
    } catch (_) {
      // Keep the boot messages if session history is unavailable.
    }
  }

  async function send(root) {
    if (sending) return;
    const input = root.querySelector('#sho-chat-input');
    const sendBtn = root.querySelector('#sho-chat-send');
    const log = root.querySelector('.sho-chatlog');
    const text = (input?.value || '').trim();
    if (!text || !log) return;

    sending = true;
    if (sendBtn) sendBtn.disabled = true;
    input.value = '';
    addMessage(log, 'user', text);
    const target = addMessage(log, 'assistant', '', true);
    setCore('thinking');

    try {
      const sessionId = localStorage.getItem(SESSION_KEY) || null;
      const resp = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });
      const returnedSid = resp.headers.get('x-session-id');
      if (returnedSid) localStorage.setItem(SESSION_KEY, returnedSid);
      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      setCore('speaking');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        target.body.textContent = full;
        log.scrollTop = log.scrollHeight;
      }
      target.wrap.classList.remove('streaming');
    } catch (err) {
      target.wrap.classList.remove('streaming');
      target.body.textContent = `Erreur de communication avec Jarvis (${err.message || err}).`;
      setCore('error');
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
      setTimeout(() => setCore('idle'), 1000);
      input?.focus();
    }
  }

  function mount(root) {
    if (mounted || !root) return;
    const inputHost = root.querySelector('.sho-input');
    const log = root.querySelector('.sho-chatlog');
    if (!inputHost || !log) return;
    mounted = true;
    addStyles();

    inputHost.classList.add('sho-chat-entry');
    inputHost.innerHTML = `
      <input id="sho-chat-input" type="text" autocomplete="off" placeholder="Parle à Shino…" />
      <div class="sho-chat-tools">
        <button class="sho-new" id="sho-chat-new" title="Nouvelle conversation">NEW</button>
        <button id="sho-chat-send">ENVOYER</button>
      </div>`;

    root.querySelector('#sho-chat-send')?.addEventListener('click', () => send(root));
    root.querySelector('#sho-chat-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(root);
      }
    });
    root.querySelector('#sho-chat-new')?.addEventListener('click', () => {
      localStorage.removeItem(SESSION_KEY);
      log.innerHTML = '';
      addMessage(log, 'assistant', 'Nouvelle session prête.');
      root.querySelector('#sho-chat-input')?.focus();
    });

    loadHistory(log);
  }

  function tryMount() {
    const root = document.getElementById(ROOT_ID);
    if (root) {
      mount(root);
      return true;
    }
    return false;
  }

  if (!tryMount()) {
    const observer = new MutationObserver(() => {
      if (tryMount()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const voiceMap = {
    vad_start: 'listening',
    stt_done: 'thinking',
    llm_start: 'thinking',
    tts_start: 'speaking',
    tts_done: 'idle',
    interrupted: 'listening',
  };
  window.addEventListener('jarvis:ws', (event) => {
    const state = voiceMap[event.detail?.type];
    if (state) setCore(state);
  });
})();
