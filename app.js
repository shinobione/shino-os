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
  ctx.strokeStyle = 'rgba(56,217,255,.85)';
  ctx.lineWidth = 1.15;
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
  const active = state.listening ? 1.9 : 1;
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, 'rgba(38,113,255,0)');
  gradient.addColorStop(.2, 'rgba(56,217,255,.55)');
  gradient.addColorStop(.5, 'rgba(191,245,255,.95)');
  gradient.addColorStop(.8, 'rgba(56,217,255,.55)');
  gradient.addColorStop(1, 'rgba(38,113,255,0)');
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = 0; x <= width; x += 3) {
    const dist = Math.abs(x - width / 2) / (width / 2);
    const envelope = Math.pow(1 - Math.min(1, dist), 2.2);
    const signal = Math.sin(x * .12 + state.phase * 2.1) * 9 + Math.sin(x * .31 - state.phase * 1.4) * 4;
    const y = center + signal * envelope * active;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(61,181,255,.22)';
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
  state.phase += .025;
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

function demoReply(text) {
  const lower = text.toLowerCase();
  let reply = 'Reçu. Le shell V0.1 est en mode démonstration : le moteur IA sera branché à l’étape suivante.';
  if (lower.includes('riso')) reply = 'Mode RISO actif. Les connecteurs manuels, stock et tournée seront branchés ici.';
  if (lower.includes('music') || lower.includes('suno')) reply = 'Mode MUSIC prêt. Le skill SHINOBIWAN prendra la main depuis ce panneau.';
  if (lower.includes('gpu') || lower.includes('3070')) reply = 'Les jauges sont actuellement simulées. La télémétrie LAN 3060 / 3070 Ti est prévue au prochain branchement système.';
  if (lower.includes('bonjour') || lower.includes('salut')) reply = 'À votre service. SHINO-OS V0.1 est en ligne.';
  window.setTimeout(() => appendMessage('Shino', reply), 420);
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
  $('#serviceLine').textContent = state.listening ? 'JE VOUS ÉCOUTE.' : 'À VOTRE SERVICE.';
  $('#coreWrap').style.transform = state.listening ? 'scale(1.035)' : 'scale(1)';
});

$$('.brain-option').forEach((button) => {
  button.addEventListener('click', () => {
    state.brain = button.dataset.brain;
    $$('.brain-option').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('#serviceLine').textContent = `${state.brain} SÉLECTIONNÉ.`;
    window.setTimeout(() => $('#serviceLine').textContent = state.listening ? 'JE VOUS ÉCOUTE.' : 'À VOTRE SERVICE.', 1200);
  });
});

$$('.dock-item').forEach((button) => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    $$('.dock-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('#serviceLine').textContent = `MODE ${state.mode}.`;
    window.setTimeout(() => $('#serviceLine').textContent = state.listening ? 'JE VOUS ÉCOUTE.' : 'À VOTRE SERVICE.', 1000);
  });
});

$$('.rail-btn').forEach((button) => {
  button.addEventListener('click', () => {
    $$('.rail-btn').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    $('#serviceLine').textContent = button.title.toUpperCase();
  });
});

$('#powerButton').addEventListener('click', () => {
  state.sleeping = !state.sleeping;
  document.body.classList.toggle('sleeping', state.sleeping);
  $('#serviceLine').textContent = state.sleeping ? 'MODE VEILLE.' : 'À VOTRE SERVICE.';
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
});

updateClock();
updateTelemetry();
setInterval(updateClock, 1000);
setInterval(updateTelemetry, 1800);
requestAnimationFrame(tick);
