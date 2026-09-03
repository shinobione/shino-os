(function () {
  const VIEW_ID = 'shino-command-center';
  const MAX_ATTEMPTS = 50;
  let attempts = 0;

  function activate() {
    attempts += 1;
    try {
      if (window.Jarvis?.views) {
        Jarvis.views.activate(VIEW_ID, { mode: 'RISO', state: 'idle' });
        console.info('[SHINO-OS] Command Center activated.');
        return;
      }
    } catch (err) {
      console.warn('[SHINO-OS] Command Center activation retry:', err);
    }

    if (attempts < MAX_ATTEMPTS) setTimeout(activate, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(activate, 0), { once: true });
  } else {
    setTimeout(activate, 0);
  }
})();
