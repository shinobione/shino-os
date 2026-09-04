(function () {
  'use strict';

  if (window.__SHINO_MUSIC_BRIDGE__) return;
  window.__SHINO_MUSIC_BRIDGE__ = true;

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const STYLE_ID = 'shino-music-css';

  let root = null;
  let host = null;
  let nativeWidget = null;
  let nativeButton = null;
  let dockObserver = null;
  let active = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `/static/skills/${VIEW_ID}/zzzzzzzzz-music.css`;
    document.head.appendChild(link);
  }

  function q(sel) { return root ? root.querySelector(sel) : null; }

  function currentMode() {
    return String(q('#sho-dock [data-mode].active')?.dataset?.mode || q('#sho-mode')?.textContent || 'RISO').toUpperCase();
  }

  function ensureHost() {
    const panel = q('.sho-skills');
    if (!panel) return null;
    let el = q('#sho-music-host');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'sho-music-host';
    el.className = 'sho-music-host';
    el.innerHTML = '<div class="sho-music-standby"><span>MUSIC LINK</span><b>JARVIS PLAYER</b><small>SELECT MUSIC TO OPEN</small></div>';
    panel.appendChild(el);
    return el;
  }

  function adoptNativeMusic() {
    nativeWidget = document.getElementById('hc-widget-music');
    nativeButton = document.getElementById('hc-music');
    host = ensureHost();
    if (!nativeWidget || !host) return false;

    if (nativeWidget.parentElement !== host) host.appendChild(nativeWidget);
    nativeWidget.classList.add('sho-music-native');
    host.querySelector('.sho-music-standby')?.remove();
    return true;
  }

  function nativeActive() {
    return Boolean(nativeButton?.classList.contains('active'));
  }

  function startNativeMusic() {
    nativeButton = nativeButton || document.getElementById('hc-music');
    if (nativeButton && !nativeActive()) nativeButton.click();
  }

  function stopNativeMusic() {
    nativeButton = nativeButton || document.getElementById('hc-music');
    if (nativeButton && nativeActive()) nativeButton.click();
  }

  function showMusic() {
    if (!root) return;
    active = true;
    adoptNativeMusic();
    const panel = q('.sho-skills');
    panel?.classList.add('sho-music-mode');
    host?.classList.add('is-open');
    startNativeMusic();
  }

  function hideMusic() {
    active = false;
    const panel = q('.sho-skills');
    panel?.classList.remove('sho-music-mode');
    host?.classList.remove('is-open');
    stopNativeMusic();
  }

  function syncMode() {
    if (!root) return;
    const wantMusic = currentMode() === 'MUSIC';
    if (wantMusic && !active) showMusic();
    else if (!wantMusic && active) hideMusic();
  }

  function observeDock() {
    const dock = q('#sho-dock');
    if (!dock || dockObserver) return;
    dockObserver = new MutationObserver(syncMode);
    dockObserver.observe(dock, { attributes: true, subtree: true, attributeFilter: ['class'] });
    dock.addEventListener('click', () => window.setTimeout(syncMode, 0));
  }

  function install() {
    root = document.getElementById(ROOT_ID);
    if (!root) return false;
    ensureStyle();
    ensureHost();
    adoptNativeMusic();
    observeDock();
    syncMode();
    console.info('[SHINO-OS] Native Jarvis music widget docked into SHINO mode panel.');
    return true;
  }

  function boot() {
    if (install()) return;
    const timer = window.setInterval(() => {
      if (install()) window.clearInterval(timer);
    }, 250);
  }

  window.SHINOMusic = { show: showMusic, hide: hideMusic, sync: syncMode };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
