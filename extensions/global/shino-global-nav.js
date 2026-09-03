(function () {
  'use strict';

  if (window.__shinoGlobalNavMounted) return;
  window.__shinoGlobalNavMounted = true;

  const routes = [
    { id: 'home', label: 'HOME', href: '/', mode: 'home' },
    { id: 'workspace', label: 'WORKSPACE', href: '/dashboard', mode: 'workspace' },
    { id: 'capacites', label: 'CAPACITES', href: '/capabilities', mode: 'capacites' },
    { id: 'config', label: 'SETTINGS', href: '/settings', mode: 'config' },
  ];

  function currentMode() {
    return document.body?.dataset?.mode || '';
  }

  function navigate(href) {
    if (window.Jarvis?.navigate) window.Jarvis.navigate(href);
    else window.location.href = href;
  }

  function mount() {
    if (!document.body || document.getElementById('shino-global-nav')) return;

    const nav = document.createElement('nav');
    nav.id = 'shino-global-nav';
    nav.setAttribute('aria-label', 'SHINO navigation');

    const brand = document.createElement('button');
    brand.className = 'sgn-brand';
    brand.type = 'button';
    brand.title = 'SHINO Home';
    brand.innerHTML = '<span class="sgn-mark"></span><strong>SHINO</strong>';
    brand.addEventListener('click', () => navigate('/'));
    nav.appendChild(brand);

    const sep = document.createElement('span');
    sep.className = 'sgn-sep';
    nav.appendChild(sep);

    routes.forEach((route) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sgn-route';
      btn.dataset.mode = route.mode;
      btn.textContent = route.label;
      btn.classList.toggle('active', currentMode() === route.mode);
      btn.addEventListener('click', () => navigate(route.href));
      nav.appendChild(btn);
    });

    const mc = document.createElement('button');
    mc.type = 'button';
    mc.className = 'sgn-mc';
    mc.textContent = 'MC';
    mc.title = 'Mission Control';
    mc.addEventListener('click', () => {
      if (window.Jarvis?.openMissionControl) window.Jarvis.openMissionControl();
    });
    nav.appendChild(mc);

    document.body.appendChild(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
