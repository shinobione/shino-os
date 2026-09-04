(function () {
  'use strict';

  if (window.__SHINO_GESTURE_BRIDGE__) return;
  window.__SHINO_GESTURE_BRIDGE__ = true;

  const VIEW_ID = 'shino-command-center';
  const STYLE_ID = 'shino-gesture-css';
  const ROOT_ID = `${VIEW_ID}-container`;
  const LABELS = {
    Open_Palm: 'PLAY / PAUSE',
    Victory: 'NEXT TRACK',
    Thumb_Up: 'THUMB UP',
    Thumb_Down: 'THUMB DOWN',
    Pointing_Up: 'POINTER',
    pinch_y: 'VOLUME',
    fist_pan: 'ORB PAN',
    two_hand_zoom: 'ORB ZOOM',
  };

  let panX = 0;
  let panY = 0;
  let scale = 1;
  let toastTimer = null;
  let lastToastAt = 0;
  let installTimer = null;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `/static/skills/${VIEW_ID}/zzzzzzz-gestures.css`;
    document.head.appendChild(link);
  }

  function shinoRoot() { return document.getElementById(ROOT_ID); }
  function shinoActive() { return Boolean(shinoRoot() && document.body.classList.contains('shino-home-active')); }

  function applyOrbTransform() {
    document.documentElement.style.setProperty('--sho-orb-pan-x', `${panX.toFixed(1)}px`);
    document.documentElement.style.setProperty('--sho-orb-pan-y', `${panY.toFixed(1)}px`);
    document.documentElement.style.setProperty('--sho-orb-scale', scale.toFixed(3));
    document.body.classList.add('shino-gesture-orb');

    const badge = document.getElementById('sho-gesture-orb-state');
    if (badge) badge.textContent = `X ${Math.round(panX)} · Y ${Math.round(panY)} · ${Math.round(scale * 100)}%`;
  }

  function resetOrbTransform() {
    panX = 0;
    panY = 0;
    scale = 1;
    applyOrbTransform();
  }

  function ensureHud() {
    const root = shinoRoot();
    if (!root) return null;
    let hud = root.querySelector('#sho-gesture-hud');
    if (hud) return hud;

    hud = document.createElement('div');
    hud.id = 'sho-gesture-hud';
    hud.className = 'sho-gesture-hud';
    hud.innerHTML = `
      <span class="sho-gesture-kicker">GESTURE CONTROL</span>
      <b id="sho-gesture-action">READY</b>
      <small id="sho-gesture-orb-state">X 0 · Y 0 · 100%</small>`;

    const slot = root.querySelector('#sho-vision-slot');
    if (slot) slot.appendChild(hud);
    else root.appendChild(hud);
    return hud;
  }

  function showGesture(ev, suffix) {
    if (!shinoActive()) return;
    const now = performance.now();
    const continuous = ev?.phase === 'continuous';
    if (continuous && now - lastToastAt < 90) return;
    lastToastAt = now;

    const hud = ensureHud();
    if (!hud) return;
    const action = hud.querySelector('#sho-gesture-action');
    if (action) {
      const base = LABELS[ev?.name] || String(ev?.name || 'GESTURE').replaceAll('_', ' ').toUpperCase();
      action.textContent = suffix ? `${base} · ${suffix}` : base;
    }
    hud.classList.add('is-live');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => hud.classList.remove('is-live'), continuous ? 420 : 1450);
  }

  function handleLocal(ev) {
    if (!shinoActive() || !ev || ev.source !== 'mediapipe') return false;

    if (ev.name === 'fist_pan') {
      const dx = Number(ev.dx) || 0;
      const dy = Number(ev.dy) || 0;
      panX = clamp(panX - dx * 0.42, -105, 105);
      panY = clamp(panY + dy * 0.42, -75, 75);
      applyOrbTransform();
      showGesture(ev, `${Math.round(panX)}, ${Math.round(panY)}`);
      return true;
    }

    if (ev.name === 'two_hand_zoom') {
      const delta = Number(ev.delta) || 0;
      scale = clamp(scale + delta * 0.0025, 0.78, 1.34);
      applyOrbTransform();
      showGesture(ev, `${Math.round(scale * 100)}%`);
      return true;
    }

    if (ev.name === 'pinch_y') {
      const delta = Number(ev.delta) || 0;
      showGesture(ev, delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'HOLD');
      return false;
    }

    if (ev.phase === 'confirmed') {
      showGesture(ev);
      return false;
    }

    return false;
  }

  function wrapRouter() {
    const router = window.Jarvis?.gestures;
    if (!router || typeof router.route !== 'function') return false;
    if (router.__shinoWrapped) return true;

    const original = router.route;
    router.route = function (ev) {
      let handled = false;
      try { handled = Boolean(original.call(router, ev)); }
      catch (err) { console.warn('[SHINO-OS] Gesture router upstream error:', err); }

      let localHandled = false;
      try { localHandled = Boolean(handleLocal(ev)); }
      catch (err) { console.warn('[SHINO-OS] Gesture bridge error:', err); }
      return handled || localHandled;
    };
    router.__shinoWrapped = true;
    console.info('[SHINO-OS] Gesture Router bridged to SHINO cockpit.');
    return true;
  }

  function bindResetOnVisionOff() {
    const root = shinoRoot();
    if (!root || root.dataset.shinoGestureResetBound === '1') return;
    root.dataset.shinoGestureResetBound = '1';
    root.addEventListener('click', (event) => {
      const target = event.target?.closest?.('#sho-vision-btn, [data-sho-nav="vision"], #sho-vision-close');
      if (!target) return;
      window.setTimeout(() => {
        const status = window.SHINOVision?.status?.();
        if (!status?.active) resetOrbTransform();
      }, 650);
    });
  }

  function install() {
    ensureStyle();
    ensureHud();
    bindResetOnVisionOff();
    if (wrapRouter()) {
      clearInterval(installTimer);
      installTimer = null;
      applyOrbTransform();
      return true;
    }
    return false;
  }

  window.SHINOGestures = {
    reset: resetOrbTransform,
    state: () => ({ panX, panY, scale }),
  };

  function boot() {
    install();
    if (!installTimer) installTimer = window.setInterval(install, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
