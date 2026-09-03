(function () {
  const VIEW_ID = 'shino-command-center';
  const MAX_ATTEMPTS = 80;
  let attempts = 0;

  function activate() {
    attempts += 1;
    try {
      const views = window.Jarvis?.views;
      const registered = views?._registry?.[VIEW_ID];
      if (views && registered) {
        views.activate(VIEW_ID, { mode: 'RISO', state: 'idle' });
        console.info('[SHINO-OS] Command Center activated.');
        return;
      }
    } catch (err) {
      console.warn('[SHINO-OS] Command Center activation retry:', err);
    }

    if (attempts < MAX_ATTEMPTS) {
      setTimeout(activate, 100);
    } else {
      console.error('[SHINO-OS] Command Center failed to register before timeout.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
  } else {
    setTimeout(activate, 0);
  }
})();
