(function () {
  'use strict';

  if (window.__SHINO_CONTROL_BRIDGE__) return;
  window.__SHINO_CONTROL_BRIDGE__ = true;

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const STYLE_ID = 'shino-control-css';
  const DEFINITIONS = [
    { key: 'screen', nativeId: 'hc-screen', id: 'sho-screen-btn', glyph: 'SCR', label: 'SCREEN' },
    { key: 'files', nativeId: 'hc-files', id: 'sho-files-btn', glyph: 'FLS', label: 'FILES' },
  ];

  let root = null;
  let observers = [];
  let pollTimer = null;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `/static/skills/${VIEW_ID}/zzzzzzzz-controls.css`;
    document.head.appendChild(link);
  }

  function q(sel) { return root ? root.querySelector(sel) : null; }

  function nativeButton(def) { return document.getElementById(def.nativeId); }

  function nativeActive(def) {
    const btn = nativeButton(def);
    return Boolean(btn?.classList.contains('active'));
  }

  function syncOne(def) {
    const btn = q(`#${def.id}`);
    if (!btn) return;
    const native = nativeButton(def);
    const active = nativeActive(def);
    const value = btn.querySelector('b');
    btn.classList.toggle('active', active);
    btn.classList.toggle('unavailable', !native);
    if (value) value.textContent = native ? `${def.label} ${active ? 'ON' : 'OFF'}` : `${def.label} N/A`;
    btn.title = native
      ? `${def.label} permission Jarvis — ${active ? 'active' : 'inactive'}`
      : `${def.label} control unavailable`;
  }

  function syncAll() { DEFINITIONS.forEach(syncOne); }

  function clickNative(def) {
    const native = nativeButton(def);
    if (!native) {
      window.Jarvis?.notify?.({ kind: 'err', text: `${def.label} control Jarvis introuvable.` });
      return;
    }
    native.click();
    window.setTimeout(() => syncOne(def), 120);
  }

  function makeButtons() {
    root = root || document.getElementById(ROOT_ID);
    const topstats = q('.sho-topstats');
    if (!topstats) return false;

    const cam = q('#sho-vision-btn');
    DEFINITIONS.forEach((def) => {
      if (q(`#${def.id}`)) return;
      const btn = document.createElement('button');
      btn.id = def.id;
      btn.type = 'button';
      btn.className = 'sho-native-action sho-perm-btn';
      btn.innerHTML = `<span>${def.glyph}</span><b>${def.label} OFF</b>`;
      btn.addEventListener('click', () => clickNative(def));
      if (cam?.parentElement === topstats) topstats.insertBefore(btn, cam);
      else topstats.insertBefore(btn, topstats.firstChild);
    });
    syncAll();
    return true;
  }

  function observeNative() {
    observers.forEach((o) => o.disconnect());
    observers = [];
    DEFINITIONS.forEach((def) => {
      const native = nativeButton(def);
      if (!native) return;
      const observer = new MutationObserver(() => syncOne(def));
      observer.observe(native, { attributes: true, attributeFilter: ['class', 'data-state'] });
      observers.push(observer);
    });
  }

  function install() {
    root = document.getElementById(ROOT_ID);
    if (!root) return false;
    ensureStyle();
    if (!makeButtons()) return false;
    observeNative();
    syncAll();
    if (!pollTimer) pollTimer = window.setInterval(syncAll, 1000);
    console.info('[SHINO-OS] Screen/files permission controls bridged to native Jarvis controls.');
    return true;
  }

  function boot() {
    if (install()) return;
    const timer = window.setInterval(() => {
      if (install()) window.clearInterval(timer);
    }, 250);
  }

  window.SHINOControls = {
    sync: syncAll,
    screen: () => clickNative(DEFINITIONS[0]),
    files: () => clickNative(DEFINITIONS[1]),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
