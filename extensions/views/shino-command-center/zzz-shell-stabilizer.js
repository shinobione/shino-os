(function () {
  'use strict';

  // Runs only in the top-level Jarvis Home shell. Child pages stay inside #page-frame.
  if (window !== window.top) return;
  if (location.pathname !== '/' && !location.pathname.endsWith('/home.html')) return;

  const VIEW_ID = 'shino-command-center';
  const FRAME_SENTINEL = '__shino_frame__';
  let attempts = 0;
  let frame = null;
  let root = null;
  let nav = null;
  let nativeNavigateFrame = null;

  function frameIsActive() {
    return Boolean(frame && frame.classList.contains('is-active'));
  }

  function setActiveButton() {
    if (!nav || !frame) return;
    let src = '';
    try { src = String(frame.getAttribute('src') || ''); } catch (_) {}
    nav.querySelectorAll('[data-href]').forEach((btn) => {
      const href = btn.dataset.href;
      const active = href !== '/' && src.includes(href);
      btn.classList.toggle('active', active);
    });
  }

  function showHome() {
    if (!root) return;
    const views = window.Jarvis?.views;
    if (views && (views._active === VIEW_ID || views._active === FRAME_SENTINEL)) views._active = null;
    document.body.classList.remove('view-active', 'shino-frame-active');
    document.body.classList.add('shino-home-active');
    root.style.display = 'block';
    root.style.opacity = '1';
    if (nav) nav.classList.remove('is-visible');
  }

  function showFrame() {
    if (!root) return;
    const views = window.Jarvis?.views;
    // Prevent the legacy restoreHomeSkin listener from re-activating the view while
    // a Jarvis child page is visible in the persistent iframe shell.
    if (views) views._active = FRAME_SENTINEL;
    document.body.classList.remove('view-active', 'shino-home-active');
    document.body.classList.add('shino-frame-active');
    root.style.opacity = '0';
    root.style.display = 'none';
    if (nav) nav.classList.add('is-visible');
    setActiveButton();
  }

  function syncShellState() {
    if (!frame || !root) return;
    if (frameIsActive()) showFrame();
    else showHome();
  }

  function go(href) {
    if (typeof window.Jarvis?.navigateFrame === 'function') {
      window.Jarvis.navigateFrame(href);
    } else if (typeof window.Jarvis?.navigate === 'function') {
      window.Jarvis.navigate(href);
    }
    window.setTimeout(syncShellState, 0);
    window.setTimeout(syncShellState, 80);
  }

  function mountNav() {
    if (nav) return nav;
    nav = document.createElement('nav');
    nav.id = 'shino-shell-nav';
    nav.setAttribute('aria-label', 'SHINO shell navigation');
    nav.innerHTML = `
      <button class="ssn-brand" type="button" data-href="/">SHINO</button>
      <span class="ssn-sep"></span>
      <button type="button" data-href="/">HOME</button>
      <button type="button" data-href="/dashboard">WORKSPACE</button>
      <button type="button" data-href="/capabilities">CAPACITÉS</button>
      <button type="button" data-href="/settings">SETTINGS</button>
      <span class="ssn-spacer"></span>
      <button class="ssn-mc" type="button" data-action="mc">MC</button>`;
    nav.addEventListener('click', (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'mc') {
        window.Jarvis?.openMissionControl?.();
        return;
      }
      if (btn.dataset.href) go(btn.dataset.href);
    });
    document.body.appendChild(nav);
    return nav;
  }

  function wrapNativeRouter() {
    if (window.Jarvis?.navigateFrame && !window.Jarvis.navigateFrame.__shinoWrapped) {
      nativeNavigateFrame = window.Jarvis.navigateFrame.bind(window.Jarvis);
      const wrapped = function (url) {
        const result = nativeNavigateFrame(url);
        window.setTimeout(syncShellState, 0);
        window.setTimeout(syncShellState, 80);
        return result;
      };
      wrapped.__shinoWrapped = true;
      window.Jarvis.navigateFrame = wrapped;
    }
  }

  function install() {
    attempts += 1;
    frame = document.getElementById('page-frame');
    root = document.getElementById(`${VIEW_ID}-container`);
    if (!frame || !root || !window.Jarvis?.navigateFrame) {
      if (attempts < 120) window.setTimeout(install, 80);
      else console.error('[SHINO-OS] Shell stabilizer could not attach.');
      return;
    }

    mountNav();
    wrapNativeRouter();

    const observer = new MutationObserver(syncShellState);
    observer.observe(frame, { attributes: true, attributeFilter: ['class', 'src'] });
    frame.addEventListener('load', syncShellState);

    // Legacy home-restoration listeners run earlier than this file; run after them
    // and re-assert the single source of truth: #page-frame.is-active.
    const deferredSync = () => window.setTimeout(syncShellState, 20);
    window.addEventListener('focus', deferredSync);
    window.addEventListener('pageshow', deferredSync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) deferredSync(); });

    syncShellState();
    console.info('[SHINO-OS] Single-shell router attached to native Jarvis iframe navigation.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.setTimeout(install, 0), { once: true });
  } else {
    window.setTimeout(install, 0);
  }
})();
