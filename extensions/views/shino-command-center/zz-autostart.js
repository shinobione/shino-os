(function () {
  'use strict';

  const VIEW_ID = 'shino-command-center';
  const MAX_ATTEMPTS = 100;
  const VISION_LOADER_ID = 'shino-vision-loader';
  const GESTURE_LOADER_ID = 'shino-gesture-loader';
  let attempts = 0;

  function ensureScript(id, src, readyFlag, label) {
    if (window[readyFlag] || document.getElementById(id)) return;
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    script.addEventListener('error', () => console.error(`[SHINO-OS] ${label} failed to load.`));
    document.head.appendChild(script);
  }

  function ensureShinoBridges() {
    ensureScript(
      VISION_LOADER_ID,
      `/static/skills/${VIEW_ID}/zzzzzz-vision.js`,
      '__SHINO_VISION_BRIDGE__',
      'Vision bridge'
    );
    ensureScript(
      GESTURE_LOADER_ID,
      `/static/skills/${VIEW_ID}/zzzzzzz-gestures.js`,
      '__SHINO_GESTURE_BRIDGE__',
      'Gesture bridge'
    );
  }

  function mountHome() {
    attempts += 1;
    try {
      const views = window.Jarvis?.views;
      const view = views?._registry?.[VIEW_ID];
      if (view && typeof view.show === 'function') {
        // SHINO is chrome on the native Jarvis Home shell, not an active child view.
        // Do not touch views._active or body.view-active here: the parent iframe
        // router remains the only navigation source of truth.
        view.show({ mode: 'RISO', state: 'idle' });
        document.body.classList.remove('view-active');
        document.body.classList.add('shino-home-active');
        console.info('[SHINO-OS] Home chrome mounted on native Jarvis shell.');
        return true;
      }
    } catch (err) {
      console.warn('[SHINO-OS] Home mount retry:', err);
    }

    if (attempts < MAX_ATTEMPTS) window.setTimeout(mountHome, 80);
    else console.error('[SHINO-OS] Home chrome failed to mount before timeout.');
    return false;
  }

  function start() {
    if (location.pathname !== '/' && !location.pathname.endsWith('/home.html')) return;
    ensureShinoBridges();
    window.setTimeout(mountHome, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
