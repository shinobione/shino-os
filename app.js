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
const livingPalette = {
  idle: [[43,189,255],[122,229,255],[76,112,255]],
  listening: [[65,255,201],[104,231,255],[28,173,235]],
  thinking: [[170,139,255],[113,157,255],[59,104,255]],
  speaking: [[116,240,255],[225,252,255],[45,184,255]],
  working: [[255,203,105],[84,211,255],[43,135,255]],
  error: [[255,86,112],[255,147,160],[157,37,76]],
};

const months = ['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const days = ['DIMANCHE','LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI'];

const living = {
  nodes: [],
  wisps: [],
  lastWidth: 0,
  lastHeight: 0,
};

function randomSpherePoint() {
  const z = Math.random() * 2 - 1;
  const angle = Math.random() * Math.PI * 2;
  const radius = .28 + Math.pow(Math.random(), .52) * .72;
  const s = Math.sqrt(1 - z * z);
  return {
    x: Math.cos(angle) * s * radius,
    y: Math.sin(angle) * s * radius,
    z: z * radius,
    radius,
    seed: Math.random() * Math.PI * 2,
    speed: .35 + Math.random() * .85,
    size: .65 + Math.random() * 1.65,
  };
}

function setupLivingCore() {
  living.nodes = Array.from({ length: 86 }, randomSpherePoint);
  living.wisps = Array.from({ length: 18 }, (_, index) => ({
    angle: Math.random() * Math.PI * 2,
    drift: .2 + Math.random() * .7,
    bend: .18 + Math.random() * .42,
    phase: Math.random() * Math.PI * 2,
    index,
  }));
}

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

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function rotatePoint(point, ax, ay) {
  const cosy = Math.cos(ay);
  const siny = Math.sin(ay);
  const cosx = Math.cos(ax);
  const sinx = Math.sin(ax);
  const x1 = point.x * cosy - point.z * siny;
  const z1 = point.x * siny + point.z * cosy;
  const y1 = point.y * cosx - z1 * sinx;
  const z2 = point.y * sinx + z1 * cosx;
  return { x: x1, y: y1, z: z2 };
}

function drawLivingCore() {
  const canvas = $('#livingCore');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, Math.min(1.55, window.devicePixelRatio || 1));
  const width = canvas.clientWidth || 420;
  const height = canvas.clientHeight || 420;
  const pixelW = Math.round(width * dpr);
  const pixelH = Math.round(height * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
    living.lastWidth = width;
    living.lastHeight = height;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';

  const palette = livingPalette[state.core] || livingPalette.idle;
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * .43;
  const pulseMap = { idle:.025, listening:.075, thinking:.04, speaking:.085, working:.045, error:.095 };
  const pulse = 1 + Math.sin(state.phase * 2.7) * (pulseMap[state.core] || .03);
  const convergence = state.core === 'thinking' ? .82 + Math.sin(state.phase * 1.8) * .08 : 1;
  const errorJitter = state.core === 'error' ? Math.sin(state.phase * 31) * 3.2 : 0;
  const sphereRadius = baseRadius * pulse * convergence;

  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.05);
  halo.addColorStop(0, rgba(palette[1], state.core === 'speaking' ? .34 : .23));
  halo.addColorStop(.28, rgba(palette[0], .14));
  halo.addColorStop(.68, rgba(palette[2], .045));
  halo.addColorStop(1, rgba(palette[2], 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, baseRadius * 1.07, 0, Math.PI * 2);
  ctx.fill();

  const rotY = state.phase * (state.core === 'thinking' ? .55 : state.core === 'error' ? 1.05 : .25);
  const rotX = Math.sin(state.phase * .17) * .34;
  const projected = living.nodes.map((node, index) => {
    const organic = 1 + Math.sin(state.phase * node.speed + node.seed) * .055;
    const point = {
      x: node.x * organic,
      y: node.y * organic,
      z: node.z * organic,
    };
    const rotated = rotatePoint(point, rotX, rotY + node.seed * .025);
    const perspective = 1 / (1.72 - rotated.z * .42);
    const audioKick = state.core === 'listening' || state.core === 'speaking'
      ? 1 + Math.sin(state.phase * 7 + node.seed) * .035
      : 1;
    const r = sphereRadius * perspective * 1.42 * audioKick;
    return {
      x: cx + rotated.x * r + errorJitter * Math.sin(index * 2.17),
      y: cy + rotated.y * r + errorJitter * Math.cos(index * 1.91),
      z: rotated.z,
      size: node.size * (.72 + perspective * .72),
      depth: Math.max(0, Math.min(1, (rotated.z + 1) / 2)),
      node,
    };
  });

  ctx.lineCap = 'round';
  for (let i = 0; i < projected.length; i += 1) {
    const a = projected[i];
    for (let j = i + 1; j < projected.length; j += 1) {
      const b = projected[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      const maxDist = baseRadius * (state.core === 'thinking' ? .27 : .22);
      if (dist > maxDist) continue;
      const depth = (a.depth + b.depth) * .5;
      const alpha = (1 - dist / maxDist) * (.035 + depth * .115);
      ctx.strokeStyle = rgba(depth > .62 ? palette[1] : palette[0], alpha);
      ctx.lineWidth = .38 + depth * .72;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const bend = Math.sin((i + j) * .73 + state.phase) * dist * .08;
      ctx.quadraticCurveTo((a.x + b.x) / 2 + bend, (a.y + b.y) / 2 - bend, b.x, b.y);
      ctx.stroke();
    }
  }

  living.wisps.forEach((wisp) => {
    const t = state.phase * wisp.drift + wisp.phase;
    const angle = wisp.angle + t * .18;
    const inner = sphereRadius * (.08 + (wisp.index % 5) * .018);
    const outer = sphereRadius * (.68 + Math.sin(t) * .12);
    const sx = cx + Math.cos(angle + Math.sin(t) * .6) * inner;
    const sy = cy + Math.sin(angle - Math.cos(t) * .5) * inner;
    const ex = cx + Math.cos(angle + wisp.bend + Math.sin(t * .7) * .25) * outer;
    const ey = cy + Math.sin(angle + wisp.bend - Math.cos(t * .6) * .28) * outer;
    const c1x = cx + Math.cos(angle + .9) * sphereRadius * .35;
    const c1y = cy + Math.sin(angle + .55) * sphereRadius * .35;
    const c2x = cx + Math.cos(angle - .75) * sphereRadius * .52;
    const c2y = cy + Math.sin(angle - .45) * sphereRadius * .52;
    const grad = ctx.createLinearGradient(sx, sy, ex, ey);
    grad.addColorStop(0, rgba(palette[1], .04));
    grad.addColorStop(.45, rgba(palette[0], state.core === 'speaking' ? .30 : .20));
    grad.addColorStop(1, rgba(palette[2], .015));
    ctx.strokeStyle = grad;
    ctx.lineWidth = state.core === 'thinking' ? 1.35 : .82;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, ex, ey);
    ctx.stroke();
  });

  projected.sort((a, b) => a.z - b.z).forEach((point) => {
    const alpha = .18 + point.depth * .68;
    ctx.shadowBlur = 9 + point.depth * 12;
    ctx.shadowColor = rgba(palette[0], .72);
    ctx.fillStyle = rgba(point.depth > .72 ? palette[1] : palette[0], alpha);
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.size * (.6 + point.depth * .9), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  const nucleusPulse = 1 + Math.sin(state.phase * (state.core === 'speaking' ? 6.2 : 3.1)) * .14;
  const nucleusRadius = baseRadius * .12 * nucleusPulse;
  const nucleus = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucleusRadius * 2.4);
  nucleus.addColorStop(0, 'rgba(255,255,255,.98)');
  nucleus.addColorStop(.14, rgba(palette[1], .96));
  nucleus.addColorStop(.48, rgba(palette[0], .34));
  nucleus.addColorStop(1, rgba(palette[2], 0));
  ctx.fillStyle = nucleus;
  ctx.beginPath();
  ctx.arc(cx, cy, nucleusRadius * 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
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
  drawLivingCore();
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
  if (lower.includes('bonjour') || lower.includes('salut')) return 'À votre service. SHINO-OS V0.1.2 Living Core est en ligne.';
  return 'Reçu. Le Living Core tourne en temps réel : le moteur IA sera branché après validation visuelle.';
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
    const next = coreStates[Number(event.key) - 1];
    state.listening = next === 'listening';
    $('#voiceButton').classList.toggle('listening', state.listening);
    $('#voiceStatus').textContent = state.listening ? 'LISTENING' : 'ACTIVE';
    setCoreState(next);
  }
});

setupLivingCore();
updateClock();
updateTelemetry();
setCoreState('idle');
setInterval(updateClock, 1000);
setInterval(updateTelemetry, 1800);
requestAnimationFrame(tick);
