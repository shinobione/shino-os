(function () {
  'use strict';

  const VIEW_ID = 'shino-command-center';
  const MAX_ATTEMPTS = 100;
  let attempts = 0;

  function mountHome() {
    attempts += 1;
    try {
      const views = window.Jarvis?.views;
      const view = views?._registry?.[VIEW_ID];
      if (views && view && typeof view.show === 'function') {
        // Important: SHINO is the Home skin, not a temporary Jarvis view.
        // Calling show() directly keeps the native Jarvis orb visible and avoids
        // body.view-active / view lifecycle races when returning from other rooms.
        view.show({ mode: 'RISO', state: 'idle' });
        views._active = VIEW_ID;
        document.body.classList.remove('view-active');
        document.body.classList.add('shino-home-active');
        console.info('[SHINO-OS] Persistent Home mounted on native Jarvis shell.');
        return true;
      }
    } catch (err) {
      console.warn('[SHINO-OS] Home mount retry:', err);
    }

    if (attempts < MAX_ATTEMPTS) {
      window.setTimeout(mountHome, 80);
    } else {
      console.error('[SHINO-OS] Persistent Home failed to mount before timeout.');
    }
    return false;
  }

  function start() {
    if (location.pathname !== '/' && !location.pathname.endsWith('/home.html')) return;
    window.setTimeout(mountHome, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
