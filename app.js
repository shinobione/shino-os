const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  brain: 'LOCAL',
  mode: 'RISO',
  listening: false,
  sleeping: false,
  phase: 0,
  gpu3070: 62,
  gpu3060: 18,
  core: 'idle',
  coreTimer: null,
};

const coreStates = ['idle', 'listening', 'thinking', 'speaking', 'working', 'error'];
const coreCopy = {
  idle: ['IDLE', 'À VOTRE SERVICE.'],
  listening: ['LISTENING', 'JE VOUS ÉCOUTE.'],
  thinking: ['THINKING', 'ANALYSE EN COURS.'],
  speaking: ['SPEAKING', 'RÉPONSE EN COURS.'],
  working: ['WORKING', 'EXÉCUTION.'],
  error: ['ERROR', 'ANOMALIE DÉTECTÉE.'],
};
const wavePalette = {
  idle: ['rgba(56,217,255,.58)', 'rgba(191,245,255,.96)'],
  listening: ['rgba(86,255,209,.62)', 'rgba(208,255,244,1)'],
  thinking: ['rgba(157,131,255,.65)', 'rgba(225,219,255,1)'],
  speaking: ['rgba(72,221,255,.76)', 'rgba(235,253,255,1)'],
  working: ['rgba(255,199,106,.60)', 'rgba(255,240,208,1)'],
  error: ['rgba(255,91,113,.72)', 'rgba(255,216,222,1)'],
};

const months = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const days = ['DIMANCHE','LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function updateClock() {
  const now = new Date();
  $('#clockLabel').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  $('#dateLabel').textContent = `${days[now.getDay()]} ${pad(now.getDate())} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

function setCoreState(name, message = null, duration = 0) {
  if (!coreStates.includes(name)) return;
  window.clearTimeout(state.coreTimer);
  state.core = name;
  document.body.dataset.coreState = name;
  $('#coreState').textContent = coreCopy[name][0];
  $('#serviceLine').textContent = message || coreCopy[name][1];

  if (duration > 0) {
    state.coreTimer = window.setTimeout(() => {
      setCoreState(state.listening ? 'listening' : 'idle');
    }, duration);
  }
}

function drawGraph(canvas, base, amplitude, phaseOffset = 0) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const cssWidth = canvas.clientWidth || canvas.width;
  const cssHeight = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = 'rgba(56,217,255,.86)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = 0; x <= cssWidth; x += 4) {
    const t = x / cssWidth;
    const jitter = Math.sin((t * 34) + state.phase + phaseOffset) * amplitude * .22;
    const ripple = Math.sin((t * 9) - state.phase * .62 + phaseOffset) * amplitude * .35;
    const detail = Math.sin((t * 73) + state.phase * 1.4) * amplitude * .10;
    const y = cssHeight * .62 - (base * .08) - jitter - ripple - detail;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(56,217,255,.12)';
  ctx.beginPath();
  ctx.moveTo(0, cssHeight - 4);
  ctx.lineTo(cssWidth, cssHeight - 4);
  ctx.stroke();
}

function drawVoiceWave() {
  const canvas = $('#voiceWave');
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const center = height / 2;
  const multipliers = { idle: .72, listening: 2.05, thinking: 1.45, speaking: 1.85, working: 1.15, error: 2.3 };
  const active = multipliers[state.core] || 1;
  const palette = wavePalette[state.core] || wavePalette.idle;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(38,113,255,0)');
  gradient.addColorStop(.18, palette[0]);
  gradient.addColorStop(.5, palette[1]);
  gradient.addColorStop(.82, palette[0]);
  gradient.addColorStop(1, 'rgba(38,113,255,0)');

  ctx.strokeStyle = gradient;
  ctx.lineWidth = state.core === 'speaking' ? 1.65 : 1.25;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 3) {
    const dist = Math.abs(x - width / 2) / (width / 2);
    const envelope = Math.pow(1 - Math.min(1, dist), 2.05);
    const complexity = state.core === 'thinking' ? 1.75 : state.core === 'error' ? 2.25 : 1;
    const signal = Math.sin(x * .11 * complexity + state.phase * 2.15) * 10 + Math.sin(x * .29 - state.phase * 1.55) * 4.5;
    const y = center + signal * envelope * active;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(61,181,255,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, center);
  ctx.lineTo(width, center);
  ctx.stroke();
}

function updateTelemetry() {
  const time = Date.now() / 1000;
  const noiseA = Math.sin(time * .43) * 7 + Math.sin(time * 1.17) * 3;
  const noiseB = Math.sin(time * .31 + 2) * 5 + Math.sin(time * .92) * 2;
  state.gpu3070 = Math.max(18, Math.min(88, Math.round(54 + noiseA)));
  state.gpu3060 = Math.max(8, Math.min(58, Math.round(20 + noiseB)));

  $('#gpu3070Value').textContent = `${state.gpu3070}%`;
  $('#gpu3060Value').textContent = `${state.gpu3060}%`;
  $('#load3070').textContent = `${state.gpu3070}%`;
  $('#load3060').textContent = `${state.gpu3060}%`;
  $('#bar3070').style.width = `${state.gpu3070}%`;
  $('#bar3060').style.width = `${state.gpu3060}%`;
  $('#temp3070').textContent = `${Math.round(47 + state.gpu3070 * .22)}°C`;
  $('#temp3060').textContent = `${Math.round(43 + state.gpu3060 * .2)}°C`;
  $('#cpuTop').textContent = `${Math.max(3, Math.round(9 + Math.sin(time * .7) * 5))}%`;
}

function tick() {
  const speed = state.core === 'thinking' ? .045 : state.core === 'error' ? .07 : state.core === 'speaking' ? .038 : .025;
  state.phase += speed;
  drawGraph($('#gpu3070'), state.gpu3070, 17, 0);
  drawGraph($('#gpu3060'), state.gpu3060, 11, 1.7);
  drawVoiceWave();
  requestAnimationFrame(tick);
}

function timestamp() {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function appendMessage(role, text) {
  const article = document.createElement('article');
  article.className = `bubble ${role === 'Shino' ? 'assistant' : 'user'}`;
  article.innerHTML = `<div><b>${role}</b><time>${timestamp()}</time></div><p></p>`;
  article.querySelector('p').textContent = text;
  $('#chatLog').append(article);
  $('#chatLog').scrollTop = $('#chatLog').scrollHeight;
}

function chooseDemoReply(text) {
  const lower = text.toLowerCase();
  if (lower.includes('riso')) return 'Mode RISO actif. Les connecteurs manuels, stock et tournée seront branchés ici.';
  if (lower.includes('music') || lower.includes('suno')) return 'Mode MUSIC prêt. Le skill SHINOBIWAN prendra la main depuis ce panneau.';
  if (lower.includes('gpu') || lower.includes('3070')) return 'Les jauges sont encore simulées. La télémétrie LAN 3060 / 3070 Ti arrive au prochain branchement système.';
  if (lower.includes('bonjour') || lower.includes('salut')) return 'À votre service. SHINO-OS V0.1.1 est en ligne.';
  return 'Reçu. Le shell V0.1.1 est en démonstration : le moteur IA sera branché après validation visuelle.';
}

function demoReply(text) {
  setCoreState('thinking');
  window.setTimeout(() => {
    appendMessage('Shino', chooseDemoReply(text));
    setCoreState('speaking');
    window.setTimeout(() => setCoreState(state.listening ? 'listening' : 'idle'), 1050);
  }, 680);
}

$('#chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#chatInput');
  const text = input.value.trim();
  if (!text) return;
  appendMessage('Toi', text);
  input.value = '';
  demoReply(text);
});

$('#voiceButton').addEventListener('click', () => {
  state.listening = !state.listening;
  $('#voiceButton').classList.toggle('listening', state.listening);
  $('#voiceStatus').textContent = state.listening ? 'LISTENING' : 'ACTIVE';
  setCoreState(state.listening ? 'listening' : 'idle');
});

$('#coreWrap').addEventListener('click', () => {
  const current = coreStates.indexOf(state.core);
  const next = coreStates[(current + 1) % coreStates.length];
  state.listening = next === 'listening';
  $('#voiceButton').classList.toggle('listening', state.listening);
  $('#voiceStatus').textContent = state.listening ? 'LISTENING' : 'ACTIVE';
  setCoreState(next);
});

$$('.brain-option').forEach((button) => {
  button.addEventListener('click', () => {
    state.brain = button.dataset.brain;
    $$('.brain-option').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('#brainStatus').textContent = state.brain;
    setCoreState('working', `${state.brain} SÉLECTIONNÉ.`, 1050);
  });
});

$$('.dock-item').forEach((button) => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    $$('.dock-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    setCoreState('working', `MODE ${state.mode}.`, 900);
  });
});

$$('.rail-btn').forEach((button) => {
  button.addEventListener('click', () => {
    $$('.rail-btn').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    setCoreState('working', button.title.toUpperCase(), 750);
  });
});

$('#powerButton').addEventListener('click', () => {
  state.sleeping = !state.sleeping;
  document.body.classList.toggle('sleeping', state.sleeping);
  if (state.sleeping) {
    state.listening = false;
    $('#voiceButton').classList.remove('listening');
    $('#voiceStatus').textContent = 'STANDBY';
    setCoreState('idle', 'MODE VEILLE.');
  } else {
    $('#voiceStatus').textContent = 'ACTIVE';
    setCoreState('idle');
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== $('#chatInput')) {
    event.preventDefault();
    $('#chatInput').focus();
  }
  if (event.code === 'Space' && event.ctrlKey) {
    event.preventDefault();
    $('#voiceButton').click();
  }
  if (event.key >= '1' && event.key <= '6' && document.activeElement !== $('#chatInput')) {
    setCoreState(coreStates[Number(event.key) - 1]);
  }
});

updateClock();
updateTelemetry();
setCoreState('idle');
setInterval(updateClock, 1000);
setInterval(updateTelemetry, 1800);
requestAnimationFrame(tick);
