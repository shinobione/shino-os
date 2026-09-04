(function () {
  'use strict';

  if (window.__SHINO_WORKSPACE_BRIDGE__) return;
  window.__SHINO_WORKSPACE_BRIDGE__ = true;

  const VIEW_ID = 'shino-command-center';
  const ROOT_ID = `${VIEW_ID}-container`;
  const STYLE_ID = 'shino-workspaces-css';

  let root = null;
  let workspace = null;
  let activeMode = null;
  let installObserver = null;
  let pcTimer = null;

  let fsRootHandle = null;
  let fsPath = [];
  let fsPreviewUrl = null;

  function q(sel, base) {
    return (base || root || document).querySelector(sel);
  }

  function qa(sel, base) {
    return Array.from((base || root || document).querySelectorAll(sel));
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `/static/skills/${VIEW_ID}/zzzzzzzzzz-workspaces.css`;
    document.head.appendChild(link);
  }

  async function fetchJson(path, options) {
    const headers = {
      ...(window.Jarvis?.authHeaders ? window.Jarvis.authHeaders() : {}),
      ...((options && options.headers) || {}),
    };
    const response = await fetch(path, {
      cache: 'no-store',
      ...(options || {}),
      headers,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${(n / 1024 ** 3).toFixed(2)} GB`;
  }

  function formatUptime(seconds) {
    let s = Math.max(0, Number(seconds) || 0);
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60);
    return `${d ? `${d}j ` : ''}${h}h ${m}m`;
  }

  function workspaceMarkup() {
    return `
      <section id="sho-workspace" class="sho-workspace" aria-hidden="true">
        <header class="sho-workspace-head">
          <div>
            <span class="sho-workspace-kicker">SHINO NATIVE WORKSPACE</span>
            <strong id="sho-workspace-title">FILES</strong>
          </div>
          <nav class="sho-workspace-tabs">
            <button type="button" data-sho-workspace-tab="FILES">FILES</button>
            <button type="button" data-sho-workspace-tab="PC">PC</button>
          </nav>
          <button type="button" id="sho-workspace-close" class="sho-workspace-close">DASHBOARD</button>
        </header>

        <div id="sho-files-workspace" class="sho-workspace-pane sho-files-workspace">
          <aside class="sho-files-sidebar">
            <div class="sho-files-permission"><span>LOCAL FILE ACCESS</span><b id="sho-files-permission">STANDBY</b></div>
            <button id="sho-files-open-folder" class="sho-command-primary" type="button">OPEN FOLDER</button>
            <div class="sho-files-actions">
              <button id="sho-files-up" type="button">↑ UP</button>
              <button id="sho-files-refresh" type="button">↻ REFRESH</button>
            </div>
            <div class="sho-files-path-label">CURRENT PATH</div>
            <div id="sho-files-path" class="sho-files-path">NO FOLDER SELECTED</div>
            <div class="sho-files-safety">
              <b>READ-ONLY GATE</b>
              <span>Navigation et aperçu uniquement. Aucune suppression / écriture dans ce module.</span>
            </div>
          </aside>

          <section class="sho-files-browser">
            <div class="sho-files-browser-head">
              <div><span>LOCAL DIRECTORY</span><strong id="sho-files-count">0 ITEMS</strong></div>
              <span id="sho-files-api">FILE SYSTEM ACCESS API</span>
            </div>
            <div class="sho-files-columns"><span>NAME</span><span>TYPE</span><span>SIZE</span><span>MODIFIED</span></div>
            <div id="sho-files-list" class="sho-files-list">
              <div class="sho-files-empty">CLICK <b>OPEN FOLDER</b> TO BROWSE YOUR PC LOCALLY.</div>
            </div>
          </section>

          <aside class="sho-files-preview">
            <div class="sho-files-preview-head"><span>PREVIEW</span><b id="sho-preview-kind">NONE</b></div>
            <div id="sho-files-preview-body" class="sho-files-preview-body">
              <div class="sho-preview-empty">SELECT A FILE</div>
            </div>
          </aside>
        </div>

        <div id="sho-pc-workspace" class="sho-workspace-pane sho-pc-workspace">
          <section class="sho-pc-meters">
            <article class="sho-pc-meter"><div><span>CPU</span><b id="sho-pc-cpu">--%</b></div><div class="sho-pc-track"><i id="sho-pc-cpu-bar"></i></div><small id="sho-pc-cpu-detail">WAITING FOR JARVIS API</small></article>
            <article class="sho-pc-meter"><div><span>MEMORY</span><b id="sho-pc-ram">--%</b></div><div class="sho-pc-track"><i id="sho-pc-ram-bar"></i></div><small id="sho-pc-ram-detail">-- / -- GB</small></article>
            <article class="sho-pc-meter"><div><span>STORAGE</span><b id="sho-pc-disk">--%</b></div><div class="sho-pc-track"><i id="sho-pc-disk-bar"></i></div><small id="sho-pc-disk-detail">-- / -- GB</small></article>
          </section>

          <section class="sho-pc-grid">
            <article class="sho-pc-card">
              <div class="sho-pc-card-head"><span>MACHINE</span><b>LIVE</b></div>
              <dl>
                <div><dt>PLATFORM</dt><dd id="sho-pc-platform">--</dd></div>
                <div><dt>UPTIME</dt><dd id="sho-pc-uptime">--</dd></div>
                <div><dt>CPU TOPOLOGY</dt><dd id="sho-pc-topology">--</dd></div>
                <div><dt>BATTERY</dt><dd id="sho-pc-battery">DESKTOP</dd></div>
              </dl>
            </article>

            <article class="sho-pc-card">
              <div class="sho-pc-card-head"><span>JARVIS PROCESS</span><b>RUNTIME</b></div>
              <dl>
                <div><dt>PID</dt><dd id="sho-pc-pid">--</dd></div>
                <div><dt>RAM</dt><dd id="sho-pc-proc-ram">-- MB</dd></div>
                <div><dt>THREADS</dt><dd id="sho-pc-threads">--</dd></div>
                <div><dt>CPU</dt><dd id="sho-pc-proc-cpu">--%</dd></div>
              </dl>
            </article>

            <article class="sho-pc-card">
              <div class="sho-pc-card-head"><span>SHINO / JARVIS DATA</span><b>LOCAL</b></div>
              <dl>
                <div><dt>PROJECTS</dt><dd id="sho-pc-projects">--</dd></div>
                <div><dt>MEMORY TOPICS</dt><dd id="sho-pc-memory">--</dd></div>
                <div><dt>SESSIONS</dt><dd id="sho-pc-sessions">--</dd></div>
                <div><dt>WORKSPACE</dt><dd id="sho-pc-workspace-path" class="sho-pc-path">--</dd></div>
              </dl>
            </article>

            <article class="sho-pc-card sho-pc-models">
              <div class="sho-pc-card-head"><span>AI RUNTIME CONFIG</span><b>CONFIG</b></div>
              <dl>
                <div><dt>LLM PROVIDER</dt><dd id="sho-pc-llm">--</dd></div>
                <div><dt>MODEL</dt><dd id="sho-pc-model">--</dd></div>
                <div><dt>VISION</dt><dd id="sho-pc-vision">--</dd></div>
                <div><dt>WHISPER</dt><dd id="sho-pc-whisper">--</dd></div>
              </dl>
            </article>
          </section>

          <footer class="sho-pc-footer"><span>REALTIME: /api/system/perf</span><span>RUNTIME: /api/system/stats</span><b id="sho-pc-last-update">WAITING</b></footer>
        </div>
      </section>`;
  }

  function ensureWorkspace() {
    if (!root) return null;
    workspace = q('#sho-workspace');
    if (workspace) return workspace;
    const main = q('.sho-main');
    if (!main) return null;
    main.insertAdjacentHTML('beforeend', workspaceMarkup());
    workspace = q('#sho-workspace');

    q('#sho-workspace-close')?.addEventListener('click', () => {
      const dashboard = q('#sho-dock [data-mode="RISO"]');
      if (dashboard) dashboard.click();
      else hideWorkspace();
    });
    qa('[data-sho-workspace-tab]').forEach((btn) => btn.addEventListener('click', () => {
      const mode = btn.dataset.shoWorkspaceTab;
      const dockButton = q(`#sho-dock [data-mode="${mode}"]`);
      if (dockButton) dockButton.click();
      else showWorkspace(mode);
    }));

    q('#sho-files-open-folder')?.addEventListener('click', chooseFolder);
    q('#sho-files-up')?.addEventListener('click', goUpFolder);
    q('#sho-files-refresh')?.addEventListener('click', renderCurrentDirectory);
    return workspace;
  }

  function showWorkspace(mode) {
    mode = String(mode || '').toUpperCase();
    if (!['FILES', 'PC'].includes(mode)) return hideWorkspace();
    ensureWorkspace();
    activeMode = mode;
    root.dataset.shoWorkspace = mode.toLowerCase();
    workspace?.classList.add('is-open');
    workspace?.setAttribute('aria-hidden', 'false');
    const title = q('#sho-workspace-title');
    if (title) title.textContent = mode === 'FILES' ? 'FILES / LOCAL BROWSER' : 'PC / SYSTEM TELEMETRY';
    qa('[data-sho-workspace-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.shoWorkspaceTab === mode));
    q('#sho-files-workspace')?.classList.toggle('active', mode === 'FILES');
    q('#sho-pc-workspace')?.classList.toggle('active', mode === 'PC');
    if (mode === 'PC') startPcPolling();
    else stopPcPolling();
  }

  function hideWorkspace() {
    activeMode = null;
    if (root) delete root.dataset.shoWorkspace;
    workspace?.classList.remove('is-open');
    workspace?.setAttribute('aria-hidden', 'true');
    stopPcPolling();
  }

  function bindDock() {
    qa('#sho-dock [data-mode]').forEach((btn) => {
      if (btn.dataset.shoWorkspaceBound === '1') return;
      btn.dataset.shoWorkspaceBound = '1';
      btn.addEventListener('click', () => {
        const mode = String(btn.dataset.mode || '').toUpperCase();
        if (mode === 'FILES' || mode === 'PC') showWorkspace(mode);
        else hideWorkspace();
      });
    });
  }

  async function setFilesPermission(enabled) {
    try {
      await fetchJson('/api/permissions/files', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: Boolean(enabled) }),
      });
    } catch (_) {}
  }

  async function chooseFolder() {
    const status = q('#sho-files-permission');
    if (!('showDirectoryPicker' in window)) {
      if (status) status.textContent = 'UNSUPPORTED';
      window.Jarvis?.notify?.({ kind: 'err', text: 'Chrome File System Access indisponible.' });
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      fsRootHandle = handle;
      fsPath = [{ name: handle.name, handle }];
      if (status) status.textContent = 'GRANTED · READ ONLY';
      await setFilesPermission(true);
      await renderCurrentDirectory();
    } catch (err) {
      if (err?.name !== 'AbortError') {
        if (status) status.textContent = 'ERROR';
        window.Jarvis?.notify?.({ kind: 'err', text: `Accès dossier impossible: ${err?.message || err}` });
      }
    }
  }

  function currentDirectoryHandle() {
    return fsPath.length ? fsPath[fsPath.length - 1].handle : fsRootHandle;
  }

  async function goUpFolder() {
    if (fsPath.length <= 1) return;
    fsPath.pop();
    await renderCurrentDirectory();
  }

  function clearPreviewUrl() {
    if (fsPreviewUrl) {
      URL.revokeObjectURL(fsPreviewUrl);
      fsPreviewUrl = null;
    }
  }

  async function renderCurrentDirectory() {
    const list = q('#sho-files-list');
    const path = q('#sho-files-path');
    const count = q('#sho-files-count');
    const handle = currentDirectoryHandle();
    if (!list || !handle) return;

    if (path) path.textContent = fsPath.map((part) => part.name).join(' / ');
    list.innerHTML = '<div class="sho-files-loading">SCANNING LOCAL DIRECTORY…</div>';

    try {
      const entries = [];
      for await (const [name, entry] of handle.entries()) {
        entries.push({ name, entry });
        if (entries.length >= 500) break;
      }
      entries.sort((a, b) => {
        if (a.entry.kind !== b.entry.kind) return a.entry.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      if (count) count.textContent = `${entries.length}${entries.length >= 500 ? '+' : ''} ITEMS`;
      list.innerHTML = '';

      if (!entries.length) {
        list.innerHTML = '<div class="sho-files-empty">EMPTY DIRECTORY</div>';
        return;
      }

      for (const item of entries) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `sho-file-row ${item.entry.kind}`;
        row.innerHTML = `<span class="sho-file-name"><i>${item.entry.kind === 'directory' ? 'DIR' : 'FILE'}</i><b>${escapeHtml(item.name)}</b></span><span>${item.entry.kind === 'directory' ? 'FOLDER' : extensionOf(item.name)}</span><span class="sho-file-size">${item.entry.kind === 'directory' ? '—' : '…'}</span><span class="sho-file-date">${item.entry.kind === 'directory' ? '—' : '…'}</span>`;
        list.appendChild(row);
        if (item.entry.kind === 'directory') {
          row.addEventListener('click', async () => {
            fsPath.push({ name: item.name, handle: item.entry });
            await renderCurrentDirectory();
          });
        } else {
          row.addEventListener('click', () => previewFile(item.name, item.entry, row));
          hydrateFileMeta(item.entry, row);
        }
      }
    } catch (err) {
      list.innerHTML = `<div class="sho-files-empty">DIRECTORY ERROR · ${escapeHtml(err?.message || err)}</div>`;
    }
  }

  function extensionOf(name) {
    const idx = name.lastIndexOf('.');
    return idx > 0 ? name.slice(idx + 1).toUpperCase().slice(0, 10) : 'FILE';
  }

  async function hydrateFileMeta(handle, row) {
    try {
      const file = await handle.getFile();
      const size = q('.sho-file-size', row);
      const date = q('.sho-file-date', row);
      if (size) size.textContent = formatBytes(file.size);
      if (date) date.textContent = new Date(file.lastModified).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {}
  }

  function isTextFile(file) {
    if (file.type.startsWith('text/')) return true;
    return /\.(txt|md|json|js|jsx|ts|tsx|css|html|htm|xml|yaml|yml|py|ps1|bat|cmd|log|csv|ini|toml|env|sql)$/i.test(file.name);
  }

  async function previewFile(name, handle, row) {
    qa('.sho-file-row').forEach((el) => el.classList.remove('selected'));
    row?.classList.add('selected');
    const body = q('#sho-files-preview-body');
    const kind = q('#sho-preview-kind');
    if (!body) return;
    body.innerHTML = '<div class="sho-files-loading">LOADING PREVIEW…</div>';
    clearPreviewUrl();

    try {
      const file = await handle.getFile();
      const ext = extensionOf(name);
      if (kind) kind.textContent = `${ext} · ${formatBytes(file.size)}`;

      const meta = `<div class="sho-preview-meta"><b>${escapeHtml(name)}</b><span>${escapeHtml(file.type || ext)} · ${formatBytes(file.size)}</span></div>`;
      if (isTextFile(file)) {
        if (file.size > 2 * 1024 * 1024) {
          body.innerHTML = `${meta}<div class="sho-preview-empty">TEXT FILE TOO LARGE FOR INLINE PREVIEW</div>`;
          return;
        }
        const text = await file.text();
        body.innerHTML = `${meta}<pre class="sho-preview-text">${escapeHtml(text.slice(0, 180000))}</pre>`;
        return;
      }

      fsPreviewUrl = URL.createObjectURL(file);
      if (file.type.startsWith('image/')) {
        body.innerHTML = `${meta}<div class="sho-preview-media"><img src="${fsPreviewUrl}" alt=""></div>`;
      } else if (file.type.startsWith('audio/')) {
        body.innerHTML = `${meta}<div class="sho-preview-media audio"><audio src="${fsPreviewUrl}" controls></audio></div>`;
      } else if (file.type.startsWith('video/')) {
        body.innerHTML = `${meta}<div class="sho-preview-media"><video src="${fsPreviewUrl}" controls></video></div>`;
      } else if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
        body.innerHTML = `${meta}<iframe class="sho-preview-pdf" src="${fsPreviewUrl}" title="PDF preview"></iframe>`;
      } else {
        body.innerHTML = `${meta}<div class="sho-preview-empty">NO INLINE PREVIEW FOR THIS FILE TYPE</div><button class="sho-preview-open" type="button">OPEN IN BROWSER</button>`;
        q('.sho-preview-open', body)?.addEventListener('click', () => window.open(fsPreviewUrl, '_blank', 'noopener'));
      }
    } catch (err) {
      body.innerHTML = `<div class="sho-preview-empty">PREVIEW ERROR · ${escapeHtml(err?.message || err)}</div>`;
    }
  }

  function setPcText(id, value) {
    const el = q(`#${id}`);
    if (el) el.textContent = String(value ?? '—');
  }

  function setPcMeter(key, value) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    setPcText(`sho-pc-${key}`, `${Math.round(pct)}%`);
    const bar = q(`#sho-pc-${key}-bar`);
    if (bar) bar.style.width = `${pct}%`;
  }

  async function refreshPc() {
    if (activeMode !== 'PC') return;
    try {
      const [perf, stats] = await Promise.all([
        fetchJson('/api/system/perf'),
        fetchJson('/api/system/stats'),
      ]);
      setPcMeter('cpu', perf.cpu_pct);
      setPcMeter('ram', perf.ram_pct);
      setPcMeter('disk', perf.disk_pct);
      setPcText('sho-pc-cpu-detail', `${perf.cpu_cores ?? '—'} CORES · ${perf.cpu_threads ?? '—'} THREADS`);
      setPcText('sho-pc-ram-detail', `${perf.ram_used_gb ?? '—'} / ${perf.ram_total_gb ?? '—'} GB`);
      setPcText('sho-pc-disk-detail', `${perf.disk_used_gb ?? '—'} / ${perf.disk_total_gb ?? '—'} GB`);
      setPcText('sho-pc-platform', perf.platform || '—');
      setPcText('sho-pc-uptime', formatUptime(perf.uptime_s));
      setPcText('sho-pc-topology', `${perf.cpu_cores ?? '—'} CORES / ${perf.cpu_threads ?? '—'} THREADS`);
      setPcText('sho-pc-battery', perf.battery_pct == null ? 'DESKTOP / AC' : `${perf.battery_pct}%${perf.battery_charging ? ' · CHARGING' : ''}`);
      setPcText('sho-pc-pid', perf.process?.pid ?? '—');
      setPcText('sho-pc-proc-ram', `${perf.process?.ram_mb ?? '—'} MB`);
      setPcText('sho-pc-threads', perf.process?.threads ?? '—');
      setPcText('sho-pc-proc-cpu', `${perf.process?.cpu_pct ?? '—'}%`);

      const projects = stats.projects || {};
      setPcText('sho-pc-projects', `${projects.total ?? 0} TOTAL · ${projects.running ?? 0} RUNNING`);
      setPcText('sho-pc-memory', `${stats.memory?.topics ?? 0} TOPICS · ${stats.memory?.size_kb ?? 0} KB`);
      setPcText('sho-pc-sessions', `${stats.sessions?.total ?? 0} · ${stats.sessions?.size_mb ?? 0} MB`);
      setPcText('sho-pc-workspace-path', stats.workspace || '—');
      setPcText('sho-pc-llm', stats.config?.llm_provider || '—');
      setPcText('sho-pc-model', stats.config?.model || '—');
      setPcText('sho-pc-vision', stats.config?.vision_model || '—');
      setPcText('sho-pc-whisper', stats.config?.whisper_model || '—');
      setPcText('sho-pc-last-update', `LIVE · ${new Date().toLocaleTimeString('fr-FR')}`);
    } catch (err) {
      setPcText('sho-pc-last-update', `API ERROR · ${err?.message || err}`);
    }
  }

  function startPcPolling() {
    stopPcPolling();
    refreshPc();
    pcTimer = window.setInterval(refreshPc, 2200);
  }

  function stopPcPolling() {
    if (pcTimer) window.clearInterval(pcTimer);
    pcTimer = null;
  }

  function install() {
    root = document.getElementById(ROOT_ID);
    if (!root) return false;
    ensureStyle();
    ensureWorkspace();
    bindDock();
    console.info('[SHINO-OS] FILES + PC native workspaces ready.');
    return true;
  }

  function boot() {
    if (install()) return;
    installObserver = new MutationObserver(() => {
      if (install()) {
        installObserver.disconnect();
        installObserver = null;
      }
    });
    installObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.addEventListener('pagehide', () => {
    stopPcPolling();
    clearPreviewUrl();
  });

  window.SHINOWorkspaces = {
    show: showWorkspace,
    hide: hideWorkspace,
    mode: () => activeMode,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
