(function () {
  'use strict';

  const VIEW_ID = 'shino-command-center';
  const MAX_ATTEMPTS = 100;
  const VISION_LOADER_ID = 'shino-vision-loader';
  let attempts = 0;

  function ensureVisionBridge() {
    if (window.__SHINO_VISION_BRIDGE__ || document.getElementById(VISION_LOADER_ID)) return;
    const script = document.createElement('script');
    script.id = VISION_LOADER_ID;
    script.src = `/static/skills/${VIEW_ID}/zzzzzz-vision.js`;
    script.defer = true;
    script.addEventListener('error', () => console.error('[SHINO-OS] Vision bridge failed to load.'));
    document.head.appendChild(script);
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
    ensureVisionBridge();
    window.setTimeout(mountHome, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
