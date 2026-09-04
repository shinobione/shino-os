(function () {
  'use strict';

  if (window.__SHINO_VISION_BRIDGE__) return;
  window.__SHINO_VISION_BRIDGE__ = true;

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const STYLE_ID = 'shino-vision-css';
  const POLL_MS = 180;

  let root = null;
  let deck = null;
  let nativeOverlay = null;
  let nativeCamButton = null;
  let statusObserver = null;
  let gestureObserver = null;
  let camObserver = null;
  let bodyObserver = null;
  let pollTimer = null;
  let starting = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `/static/skills/${VIEW_ID}/zzzzzz-vision.css`;
    document.head.appendChild(link);
  }

  function q(sel) {
    return root ? root.querySelector(sel) : null;
  }

  function notify(text, kind = 'info') {
    try { window.Jarvis?.notify?.({ kind, text }); } catch (_) {}
  }

  function liveVideoTrack() {
    const video = document.getElementById('cam-video');
    const stream = video?.srcObject;
    if (!stream || typeof stream.getVideoTracks !== 'function') return null;
    return stream.getVideoTracks().find((track) => track.readyState === 'live') || null;
  }

  function cameraActive() {
    return Boolean(
      liveVideoTrack() ||
      nativeCamButton?.classList.contains('active') ||
      nativeOverlay?.classList.contains('is-open')
    );
  }

  function routerActive() {
    return Boolean(window.Jarvis?.gestures);
  }

  function setHud(id, value, state) {
    const el = q(`#${id}`);
    if (!el) return;
    el.textContent = value;
    el.dataset.state = state || '';
  }

  function syncVisionUi() {
    if (!root) return;
    nativeCamButton = nativeCamButton || document.getElementById('hc-cam');
    nativeOverlay = nativeOverlay || document.getElementById('cam-overlay');

    const active = cameraActive();
    deck = deck || q('#sho-vision-deck');
    if (deck) deck.dataset.camera = active ? 'on' : starting ? 'starting' : 'off';

    const visionButton = q('#sho-vision-btn');
    const railButton = q('[data-sho-nav="vision"]');
    if (visionButton) visionButton.classList.toggle('active', active || starting);
    if (railButton) railButton.classList.toggle('active', active || starting);

    const buttonLabel = q('#sho-vision-label');
    if (buttonLabel) buttonLabel.textContent = active ? 'VISION ON' : starting ? 'VISION START' : 'VISION OFF';

    setHud('sho-vision-cam', active ? 'LIVE' : starting ? 'STARTING' : 'OFF', active ? 'ok' : starting ? 'wait' : 'off');
    setHud('sho-vision-router', routerActive() ? 'ACTIVE' : 'WAIT', routerActive() ? 'ok' : 'wait');
    setHud('sho-vision-fps', active ? '15 FPS' : '--', active ? 'ok' : 'off');

    const mp = document.getElementById('mp-status');
    const mpText = String(mp?.textContent || '').trim();
    const face = Boolean(mp?.classList.contains('active'));
    setHud(
      'sho-vision-face',
      active ? (face ? 'LOCK' : 'SCAN') : 'OFF',
      active ? (face ? 'ok' : 'wait') : 'off'
    );

    const gestureEl = document.getElementById('mp-gesture-label');
    const gestureText = String(gestureEl?.textContent || '').trim();
    const gestureVisible = gestureEl && getComputedStyle(gestureEl).opacity !== '0';
    setHud('sho-vision-gesture', active && gestureVisible && gestureText ? gestureText : 'NONE', gestureVisible ? 'hit' : 'off');

    const nativeStatus = q('#sho-vision-native-status');
    if (nativeStatus) {
      if (!nativeCamButton || !nativeOverlay) nativeStatus.textContent = 'CAMERA MISSING';
      else if (!active && !starting) nativeStatus.textContent = 'STANDBY';
      else nativeStatus.textContent = mpText || (starting ? 'MEDIAPIPE LOADING' : 'MEDIAPIPE ACTIVE');
    }
  }

  function makeDeck() {
    if (!root) return null;
    const existing = q('#sho-vision-deck');
    if (existing) return existing;

    const host = q('.sho-system');
    if (!host) return null;
    host.classList.add('sho-system-with-vision');

    const wrap = document.createElement('section');
    wrap.id = 'sho-vision-deck';
    wrap.className = 'sho-vision-deck';
    wrap.dataset.camera = 'off';
    wrap.innerHTML = `
      <div class="sho-vision-frame">
        <div class="sho-vision-head">
          <div class="sho-vision-title">
            <span class="sho-vision-eyebrow">VISION</span>
            <strong>MEDIAPIPE</strong>
          </div>
          <div class="sho-vision-head-status"><span class="sho-vision-pulse"></span><b id="sho-vision-native-status">STANDBY</b></div>
        </div>
        <div id="sho-vision-slot" class="sho-vision-slot">
          <div class="sho-vision-standby">
            <span class="sho-vision-reticle"></span>
            <b>VISION STANDBY</b>
            <small>CAM / VISION POUR ACTIVER</small>
          </div>
        </div>
        <div class="sho-vision-hud">
          <div><span>CAM</span><b id="sho-vision-cam" data-state="off">OFF</b></div>
          <div><span>FACE</span><b id="sho-vision-face" data-state="off">OFF</b></div>
          <div><span>GESTURE</span><b id="sho-vision-gesture" data-state="off">NONE</b></div>
          <div><span>ROUTER</span><b id="sho-vision-router" data-state="off">WAIT</b></div>
          <div><span>DETECT</span><b id="sho-vision-fps" data-state="off">--</b></div>
        </div>
      </div>`;

    host.appendChild(wrap);
    return wrap;
  }

  function makeControls() {
    if (!root) return;

    const topstats = q('.sho-topstats');
    if (topstats && !q('#sho-vision-btn')) {
      const button = document.createElement('button');
      button.className = 'sho-native-action sho-vision-btn';
      button.id = 'sho-vision-btn';
      button.type = 'button';
      button.innerHTML = '<span>CAM</span><b id="sho-vision-label">VISION OFF</b>';
      const voice = q('#sho-voice-btn');
      topstats.insertBefore(button, voice || topstats.firstChild);
      button.addEventListener('click', toggleVision);
    }

    const rail = q('.sho-rail');
    if (rail && !q('[data-sho-nav="vision"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = 'Vision / MediaPipe';
      button.dataset.shoNav = 'vision';
      button.textContent = '◉';
      const settings = q('[data-sho-nav="settings"]');
      rail.insertBefore(button, settings || rail.querySelector('.sho-build'));
      button.addEventListener('click', toggleVision);
    }
  }

  function adoptNativeOverlay() {
    nativeOverlay = document.getElementById('cam-overlay');
    nativeCamButton = document.getElementById('hc-cam');
    const slot = q('#sho-vision-slot');
    if (!nativeOverlay || !slot) return false;

    if (nativeOverlay.parentElement !== slot) slot.appendChild(nativeOverlay);
    nativeOverlay.classList.add('sho-vision-native');
    return true;
  }

  function bindNativeObservers() {
    const mp = document.getElementById('mp-status');
    const gesture = document.getElementById('mp-gesture-label');
    nativeCamButton = document.getElementById('hc-cam');

    if (mp && !statusObserver) {
      statusObserver = new MutationObserver(syncVisionUi);
      statusObserver.observe(mp, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    if (gesture && !gestureObserver) {
      gestureObserver = new MutationObserver(syncVisionUi);
      gestureObserver.observe(gesture, { attributes: true, childList: true, characterData: true, subtree: true });
    }
    if (nativeCamButton && !camObserver) {
      camObserver = new MutationObserver(syncVisionUi);
      camObserver.observe(nativeCamButton, { attributes: true, attributeFilter: ['class', 'data-state'] });
    }
  }

  function forceStopCamera() {
    try { if (typeof window.mpStop === 'function') window.mpStop(); } catch (_) {}
    const video = document.getElementById('cam-video');
    const stream = video?.srcObject;
    if (stream && typeof stream.getTracks === 'function') {
      try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {}
      try { video.srcObject = null; } catch (_) {}
    }
    nativeOverlay?.classList.remove('is-open');
    nativeCamButton?.classList.remove('active');
  }

  function openVision() {
    if (!root) return;
    deck = makeDeck();
    makeControls();
    adoptNativeOverlay();
    bindNativeObservers();

    if (!nativeCamButton) {
      syncVisionUi();
      notify('Caméra Jarvis introuvable sur cette Home.', 'err');
      return;
    }

    if (!cameraActive()) {
      starting = true;
      syncVisionUi();
      try { nativeCamButton.click(); } catch (err) {
        starting = false;
        notify(`Caméra impossible: ${err?.message || err}`, 'err');
      }
      window.setTimeout(() => {
        starting = false;
        syncVisionUi();
      }, 1800);
    } else {
      syncVisionUi();
    }
  }

  function closeVision(stopCamera) {
    if (!root) return;
    const wasActive = cameraActive();

    if (stopCamera && wasActive && nativeCamButton) {
      try { nativeCamButton.click(); } catch (_) {}
      window.setTimeout(() => {
        if (cameraActive()) forceStopCamera();
        syncVisionUi();
      }, 450);
    } else if (stopCamera && wasActive) {
      forceStopCamera();
    }

    starting = false;
    syncVisionUi();
  }

  function toggleVision() {
    if (cameraActive() || starting) closeVision(true);
    else openVision();
  }

  function install() {
    root = document.getElementById(ROOT_ID);
    if (!root) return false;

    ensureStyle();
    makeControls();
    deck = makeDeck();
    adoptNativeOverlay();
    bindNativeObservers();
    syncVisionUi();

    if (!pollTimer) pollTimer = window.setInterval(syncVisionUi, POLL_MS);

    if (!bodyObserver) {
      bodyObserver = new MutationObserver(() => {
        if (!document.body.classList.contains('shino-home-active') && cameraActive()) closeVision(true);
      });
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    console.info('[SHINO-OS] Docked MediaPipe vision bridge ready.');
    return true;
  }

  function boot() {
    if (install()) return;
    const observer = new MutationObserver(() => {
      if (install()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('pagehide', () => {
    if (cameraActive()) forceStopCamera();
  });
  window.addEventListener('beforeunload', () => {
    if (cameraActive()) forceStopCamera();
  });

  window.SHINOVision = {
    open: openVision,
    close: () => closeVision(true),
    toggle: toggleVision,
    status: () => ({ active: cameraActive(), router: routerActive() }),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
